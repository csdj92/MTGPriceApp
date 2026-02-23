import { Platform, ToastAndroid } from 'react-native';
import { Logger } from '../utils/logger';
import { getLorcanaCardWithPrice, searchLorcanaCards, markCardAsCollected, getOrCreateLorcanaSetCollection, addCardToLorcanaCollection } from './LorcanaService';
import type { OcrResult } from '../types/card';
import type { LorcanaCard } from '../types/lorcana';
import type { ScannedCard } from '../types/card';

// Recent scans tracking for duplicate prevention
const recentScans = new Set<string>();
const SCAN_COOLDOWN_MS = 1750; // 1.75 second cooldown between scans
const MAX_RECENT_SCANS = 10; // Maximum number of recent scans to track

// Simple custom event emitter implementation
class SimpleEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  emit(event: string, ...args: any[]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          Logger.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  removeListener(event: string, listenerToRemove: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      this.listeners.set(
        event,
        eventListeners.filter(listener => listener !== listenerToRemove)
      );
    }
  }

  removeAllListeners(event: string): void {
    this.listeners.delete(event);
  }
}

// Create an event emitter for verification status updates
const EVENT_NAME = 'CardVerificationUpdate';
const verificationEmitter = new SimpleEventEmitter();

export type VerificationStatus = {
  isVerifying: boolean;
  card: LorcanaCard | null;
  originalText: string;
  verificationScore: number;
  isVerified: boolean | null;
};

// Add this type near the top of the file with other type definitions
export type ProcessedOcrResult = ScannedCard | { multipleCards: LorcanaCard[] } | null;

/**
 * Service for processing card data
 */
export const CardProcessingService = {
  // Add emitter accessor
  getVerificationEmitter: () => verificationEmitter,

  /**
   * Preprocess OCR text to improve card name recognition
   * This cleans up common OCR errors and formatting issues
   */
  preprocessOcrText(text: string): string {
    if (!text) return '';

    console.log('preprocessOcrText', text);

    // Standardize whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();

    // Remove overly short segments (likely OCR artifacts)
    cleaned = cleaned.split(' ')
      .filter(word => word.length > 1 || /^[A-Z]$/.test(word)) // Keep single letter words if they're uppercase
      .join(' ');

    // Limit length to help prevent overly long OCR results
    if (cleaned.length > 50) {
      // Try to find a good break point
      const breakPoint = cleaned.lastIndexOf(' ', 50);
      if (breakPoint > 10) { // Only truncate if we have enough text
        cleaned = cleaned.substring(0, breakPoint);
      }
    }

    return cleaned;
  },

  /**
   * Process OCR result text to identify cards
   */
  async processOcrResult(result: OcrResult, selectedSet?: string | null): Promise<ProcessedOcrResult | null> {
    try {
      if (!result?.text?.trim()) {
        return null;
      }

      // Preprocess OCR text to improve recognition
      const preprocessedText = this.preprocessOcrText(result.text);

      Logger.debug(`Processing OCR result:
        Original: ${result.text}
        Preprocessed: ${preprocessedText}
        isLorcana: ${result.isLorcana}
        setCode: ${result.setCode || 'undefined'}
        cardNumber: ${result.cardNumber || 'undefined'}
      `);

      // Update result with preprocessed text
      const processedResult: OcrResult = {
        ...result,
        text: preprocessedText,
        mainName: result.isLorcana ? this.preprocessOcrText(result.mainName ?? '') : preprocessedText
      };

      // Handle null or undefined mainName
      if (!processedResult.mainName) {
        return null;
      }
      return await this.processLorcanaOcrText(processedResult.mainName, processedResult.subtype, selectedSet);
    } catch (error) {
      Logger.error('Error processing OCR result:', error);
      return null;
    }
  },

  /**
   * Process Lorcana OCR text
   */
  async processLorcanaOcrText(mainName: string, subtype?: string | null | undefined, selectedSet?: string | null | undefined): Promise<ScannedCard | { multipleCards: LorcanaCard[] } | null> {
    try {
      // Emit verification starting
      verificationEmitter.emit(EVENT_NAME, {
        isVerifying: true,
        card: null,
        originalText: mainName + (subtype ? ` - ${subtype}` : ''),
        verificationScore: 0,
        isVerified: null
      } as VerificationStatus);

      // Check if the text has already been processed recently
      const normalizedText = mainName.toLowerCase().trim();
      const now = Date.now();
      const recentScanKey = `${normalizedText}-${Math.floor(now / SCAN_COOLDOWN_MS)}`;

      if (recentScans.has(recentScanKey)) {
        Logger.debug(`Ignoring duplicate Lorcana scan: ${mainName}`);

        // Show popup for duplicate scan
        if (Platform.OS === 'android') {
          ToastAndroid.show('Card already scanned', ToastAndroid.SHORT);
        }

        // Reset verification status
        verificationEmitter.emit(EVENT_NAME, {
          isVerifying: false,
          card: null,
          originalText: '',
          verificationScore: 0,
          isVerified: null
        } as VerificationStatus);

        return null;
      }

      // Add to recent scans and maintain max size
      recentScans.add(recentScanKey);
      if (recentScans.size > MAX_RECENT_SCANS) {
        const oldestKey = Array.from(recentScans)[0];
        recentScans.delete(oldestKey);
      }

      Logger.debug(`Searching for Lorcana card: ${mainName} (subtype: ${subtype || 'none'})`);
      const lorcanaResults = await searchLorcanaCards(mainName, subtype, selectedSet || undefined);

      if (!lorcanaResults || lorcanaResults.length === 0) {
        Logger.debug(`No Lorcana cards found for text: ${mainName}`);

        // Reset verification status
        verificationEmitter.emit(EVENT_NAME, {
          isVerifying: false,
          card: null,
          originalText: '',
          verificationScore: 0,
          isVerified: null
        } as VerificationStatus);

        return null;
      }

      // If multiple cards found, return them all for selection
      if (lorcanaResults.length > 1) {
        Logger.debug(`Multiple Lorcana cards found for: ${mainName}, count: ${lorcanaResults.length}`);
        return { multipleCards: lorcanaResults };
      }

      // Single card found, proceed with price lookup
      const cardWithPrice = await getLorcanaCardWithPrice(lorcanaResults[0].Unique_ID);

      if (!cardWithPrice) {
        Logger.debug(`No price data found for Lorcana card: ${mainName}`);

        // Reset verification status
        verificationEmitter.emit(EVENT_NAME, {
          isVerifying: false,
          card: null,
          originalText: '',
          verificationScore: 0,
          isVerified: null
        } as VerificationStatus);

        return null;
      }

      // Always accept Lorcana cards since verification is less sophisticated
      verificationEmitter.emit(EVENT_NAME, {
        isVerifying: false,
        card: cardWithPrice,
        originalText: mainName + (subtype ? ` - ${subtype}` : ''),
        verificationScore: 1.0,  // Always 100% for Lorcana cards for now
        isVerified: true
      } as VerificationStatus);

      // Convert to ScannedCard format
      const scannedCard: ScannedCard = {
        id: cardWithPrice.Unique_ID,
        uuid: cardWithPrice.Unique_ID,
        name: cardWithPrice.Name || cardWithPrice.name,
        setName: cardWithPrice.Set_Name || cardWithPrice.set_name,
        setCode: cardWithPrice.Set_ID || cardWithPrice.set_id || '',
        collectorNumber: String(cardWithPrice.Card_Num || cardWithPrice.card_num),
        imageUris: { normal: cardWithPrice.Image || cardWithPrice.image },
        hasNonFoil: true,
        hasFoil: true,
        prices: {
          usd: cardWithPrice.price_usd || cardWithPrice.prices?.usd || null,
          usdFoil: cardWithPrice.price_usd_foil || cardWithPrice.prices?.usd_foil || null
        },
        type: 'Lorcana',
        purchaseUrls: {},
        legalities: {},
        scannedAt: now,
        rarity: cardWithPrice.Rarity || cardWithPrice.rarity,
        colorIdentity: [],
        keywords: [],
        cmc: 0,
        frameEffects: [],
        isFoil: false,
        card: cardWithPrice,
      };

      // Handle Lorcana card collection addition
      await this.handleLorcanaCollection(cardWithPrice);

      return scannedCard;
    } catch (error) {
      Logger.error('Error processing Lorcana OCR text:', error);

      // Reset verification status
      verificationEmitter.emit(EVENT_NAME, {
        isVerifying: false,
        card: null,
        originalText: '',
        verificationScore: 0,
        isVerified: null
      } as VerificationStatus);

      return null;
    }
  },

  /**
   * Handle Lorcana card collection
   */
  async handleLorcanaCollection(cardWithPrice: LorcanaCard): Promise<void> {
    if (cardWithPrice.Set_ID && cardWithPrice.Set_Name) {
      try {
        Logger.debug('Adding to Lorcana set collection...');
        const setCollectionId = await getOrCreateLorcanaSetCollection(
          cardWithPrice.Set_ID,
          cardWithPrice.Set_Name
        );
        if (setCollectionId) {
          await addCardToLorcanaCollection(cardWithPrice.Unique_ID, setCollectionId);
          Logger.debug('Successfully added to Lorcana set collection');
          await markCardAsCollected(cardWithPrice.Unique_ID);
        }
      } catch (error) {
        Logger.error('Error adding to Lorcana set collection:', error);
      }
    }
  },

  /**
   * Check if a card was recently scanned
   */
  checkForDuplicate(cardName: string, timestamp: number): boolean {
    // Check against recently scanned cards
    const recentScanKey = `${cardName}-${Math.floor(timestamp / SCAN_COOLDOWN_MS)}`;
    if (recentScans.has(recentScanKey)) {
      return true;
    }

    // Add to recent scans tracking
    recentScans.add(recentScanKey);
    if (recentScans.size > MAX_RECENT_SCANS) {
      const oldestKey = Array.from(recentScans)[0];
      recentScans.delete(oldestKey);
    }

    return false;
  },

  /**
   * Add a card to the appropriate collection
   */
  async addCardToCollection(card: ScannedCard): Promise<void> {
    try {
      if (card.id) {
        await this.addLorcanaCardToCollection(card);
      }
    } catch (error) {
      Logger.error('Error adding card to collection:', error);
      throw error;
    }
  },

  /**
   * Add Lorcana card to collection
   */
  async addLorcanaCardToCollection(card: ScannedCard): Promise<void> {
    const setId = card.setCode;
    const setName = card.setName;

    if (setId && setName && card.id) {
      try {
        Logger.debug('Adding Lorcana card to set collection...');
        const setCollectionId = await getOrCreateLorcanaSetCollection(setId, setName);
        if (setCollectionId) {
          await addCardToLorcanaCollection(card.id, setCollectionId);
          Logger.debug('Successfully added to set collection');
          await markCardAsCollected(card.id);
        }
      } catch (error) {
        Logger.error('Error adding Lorcana card to set collection:', error);
        throw error;
      }
    }
  },

  /**
   * Clear recent scans tracking
   */
  clearRecentScans(): void {
    recentScans.clear();
  }
};
