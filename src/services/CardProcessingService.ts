import { Platform, ToastAndroid, NativeEventEmitter, NativeModules } from 'react-native';
import { databaseService } from './DatabaseService';
import { Logger } from '../utils/logger';
import { scryfallService } from './ScryfallService';
import { getLorcanaCardWithPrice, searchLorcanaCards, markCardAsCollected, getOrCreateLorcanaSetCollection, addCardToLorcanaCollection } from './LorcanaService';
import type { OcrResult, ExtendedCard } from '../types/card';
import type { LorcanaCard } from '../types/lorcana';
import type { ScannedCard } from '../types/card';

// Recent scans tracking for duplicate prevention
const recentScans = new Set<string>();
const SCAN_COOLDOWN_MS = 1750; // 1.75 second cooldown between scans
const MAX_RECENT_SCANS = 10; // Maximum number of recent scans to track

// Map to store card verification attempts with timestamp
// Key: card name, value: { attempts: number, lastAttempt: timestamp }
const cardVerificationAttempts = new Map<string, { attempts: number, lastAttempt: number }>();
const MAX_VERIFICATION_ATTEMPTS = 2; // After this many failed attempts, accept the card anyway
const VERIFICATION_RESET_MS = 60000; // Reset verification attempts after 1 minute

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
  card: ExtendedCard | null;
  originalText: string;
  verificationScore: number;
  isVerified: boolean | null;
};

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
    
    // Standardize whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();
    
    // Replace common OCR errors
    cleaned = cleaned
      // Number/letter confusions
      .replace(/0/g, 'O')
      .replace(/1/g, 'l')
      .replace(/5/g, 'S')
      
      // Remove trailing garbage characters and punctuation
      .replace(/[^\w\s\-'\.]+$/, '')
      
      // Remove common OCR artifacts
      .replace(/\(CollectorNumber\)/i, '')
      .replace(/\(\d+\/\d+\)/, '') // Remove collector number notations like (123/456)
      
      // Fix common MTG wording
      .replace(/illustr[ae]ted by/i, '')
      .replace(/illus\./i, '')
      .replace(/\d{1,3}\/\d{1,3}/, ''); // Remove power/toughness notation
    
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
  async processOcrResult(result: OcrResult): Promise<ScannedCard | null> {
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
      `);
      
      // Update result with preprocessed text
      const processedResult: OcrResult = {
        ...result,
        text: preprocessedText,
        mainName: result.isLorcana ? this.preprocessOcrText(result.mainName) : preprocessedText
      };
      
      if (result.isLorcana) {
        // Handle null or undefined mainName
        if (!processedResult.mainName) {
          return null;
        }
        return await this.processLorcanaOcrText(processedResult.mainName, processedResult.subtype ?? undefined);
      } else {
        return await this.processMTGOcrText(processedResult.text);
      }
    } catch (error) {
      Logger.error('Error processing OCR result:', error);
      throw error;
    }
  },
  
  /**
   * Process OCR text to identify MTG cards
   */
  async processMTGOcrText(ocrText: string): Promise<ScannedCard | null> {
    try {
      // Emit verification starting
      verificationEmitter.emit(EVENT_NAME, {
        isVerifying: true,
        card: null,
        originalText: ocrText,
        verificationScore: 0,
        isVerified: null
      } as VerificationStatus);
      
      // Check if the text has already been processed recently
      const normalizedText = ocrText.toLowerCase().trim();
      const now = Date.now();
      const recentScanKey = `${normalizedText}-${Math.floor(now / SCAN_COOLDOWN_MS)}`;
      
      if (recentScans.has(recentScanKey)) {
        Logger.debug(`Ignoring duplicate scan: ${ocrText}`);
        
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
      
      Logger.debug(`Searching for MTG card: ${ocrText}`);
      const searchResponse = await scryfallService.searchCards(ocrText, 1);
      const foundCards = searchResponse.data;
      
      if (foundCards.length === 0) {
        Logger.debug(`No MTG cards found for text: ${ocrText}`);
        
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
      
      // Get the most likely card
      const card = foundCards[0];
      
      // Verify the card using version checking
      const { isVerified, score } = await this.verifyMTGCard(ocrText, card);
      
      // Emit verification result
      verificationEmitter.emit(EVENT_NAME, {
        isVerifying: false,
        card: card,
        originalText: ocrText,
        verificationScore: score,
        isVerified: isVerified
      } as VerificationStatus);
      
      if (!isVerified) {
        Logger.debug(`Card verification failed for: ${card.name}`);
        return null;
      }
      
      // Cache the card and add UUID
      const cardWithUuid = await databaseService.addToCache(card);
      if (!cardWithUuid.uuid) {
        throw new Error('Failed to generate UUID for card');
      }

      // Ensure imageUris is properly set
      const imageUris = cardWithUuid.imageUris || {};
      if (cardWithUuid.imageUrl && !imageUris.normal) {
        imageUris.normal = cardWithUuid.imageUrl;
      }

      const scannedCard: ScannedCard = {
        ...cardWithUuid,
        type: 'MTG',
        scannedAt: now,
        imageUris: imageUris
      };
      
      Logger.debug(`Created scanned card with name: ${scannedCard.name}`);
      
      // Handle collection addition
      await this.handleMTGCollection(scannedCard);
      
      return scannedCard;
    } catch (error) {
      Logger.error('Error processing MTG OCR text:', error);
      
      // Reset verification status
      verificationEmitter.emit(EVENT_NAME, {
        isVerifying: false,
        card: null,
        originalText: '',
        verificationScore: 0,
        isVerified: null
      } as VerificationStatus);
      
      if (error instanceof Error && error.message.includes('404')) {
        Logger.debug(`No MTG cards found for text: ${ocrText}`);
        return null;
      }
      throw error;
    }
  },
  
  /**
   * Verify if the detected MTG card matches expected properties
   * to reduce false positive OCR results
   */
  async verifyMTGCard(ocrText: string, card: ExtendedCard): Promise<{ isVerified: boolean, score: number }> {
    try {
      const cardName = card.name.toLowerCase();
      const now = Date.now();
      
      // Check if we've made multiple verification attempts for this card
      const attempts = cardVerificationAttempts.get(cardName);
      if (attempts) {
        // Reset attempts if it's been a while
        if (now - attempts.lastAttempt > VERIFICATION_RESET_MS) {
          cardVerificationAttempts.delete(cardName);
        } 
        // Accept after multiple attempts even if verification fails
        else if (attempts.attempts >= MAX_VERIFICATION_ATTEMPTS) {
          Logger.debug(`Accepting card after ${attempts.attempts} verification attempts: ${card.name}`);
          return { isVerified: true, score: 1.0 }; // Force score to 1.0 for UI
        }
        // Update attempts
        else {
          cardVerificationAttempts.set(cardName, {
            attempts: attempts.attempts + 1,
            lastAttempt: now
          });
        }
      } else {
        // First attempt
        cardVerificationAttempts.set(cardName, {
          attempts: 1,
          lastAttempt: now
        });
      }
      
      // 1. Extract words from OCR text for comparison
      const ocrWords = ocrText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      
      // 2. Check if OCR text contains majority of the card name words
      const nameWords = card.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const nameWordMatches = nameWords.filter(word => 
        ocrWords.some(ocrWord => ocrWord.includes(word) || word.includes(ocrWord))
      );
      const nameMatchPercentage = nameWords.length > 0 ? nameWordMatches.length / nameWords.length : 0;
      
      // 3. Check for type line matches if available
      let typeMatchScore = 0;
      if (card.type) {
        const typeWords = card.type.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const typeWordMatches = typeWords.filter(word => 
          ocrWords.some(ocrWord => ocrWord.includes(word) || word.includes(ocrWord))
        );
        typeMatchScore = typeWords.length > 0 ? typeWordMatches.length / typeWords.length : 0;
      }
      
      // 4. Check for set code/name if in the OCR text
      let setMatchScore = 0;
      if (card.setCode && card.setName) {
        const setCodeMatch = ocrText.toLowerCase().includes(card.setCode.toLowerCase());
        const setNameWords = card.setName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const setNameMatches = setNameWords.filter(word => 
          ocrWords.some(ocrWord => ocrWord.includes(word) || word.includes(ocrWord))
        );
        const setNameMatchScore = setNameWords.length > 0 ? setNameMatches.length / setNameWords.length : 0;
        setMatchScore = setCodeMatch ? 1 : setNameMatchScore;
      }
      
      // 5. Calculate verification score
      // Name match is most important, then type line, then set info
      const verificationScore = (nameMatchPercentage * 0.7) + (typeMatchScore * 0.2) + (setMatchScore * 0.1);
      
      // Log verification details
      Logger.debug(`Card verification for "${card.name}":
        - OCR Text: ${ocrText}
        - Name match: ${nameMatchPercentage.toFixed(2)}
        - Type match: ${typeMatchScore.toFixed(2)}
        - Set match: ${setMatchScore.toFixed(2)}
        - Total score: ${verificationScore.toFixed(2)}
      `);
      
      // Accept if score is high enough (threshold is adjustable)
      const threshold = 0.5; // Require at least 50% overall match
      const isVerified = verificationScore >= threshold;
      
      if (!isVerified) {
        // Show feedback in dev mode
        if (__DEV__ && Platform.OS === 'android') {
          ToastAndroid.show(`Low confidence match (${(verificationScore * 100).toFixed(0)}%): ${card.name}`, ToastAndroid.SHORT);
        }
      }
      
      return { isVerified, score: verificationScore };
    } catch (error) {
      Logger.error('Error verifying MTG card:', error);
      // If verification process fails, accept the card to avoid blocking the user
      return { isVerified: true, score: 1.0 };
    }
  },
  
  /**
   * Process Lorcana OCR text
   */
  async processLorcanaOcrText(mainName: string, subtype?: string): Promise<ScannedCard | null> {
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
      const lorcanaResults = await searchLorcanaCards(mainName, subtype);
      
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
      
      // If multiple cards found, just use the first one for now
      // In the actual app this would be handled by showing a selection modal
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
      
      // For Lorcana, we'll create a faux ExtendedCard to display verification details
      // This is only for UI display purposes
      const fauxCardForDisplay: ExtendedCard = {
        id: cardWithPrice.Unique_ID,
        name: cardWithPrice.Name,
        setName: cardWithPrice.Set_Name || '',
        setCode: cardWithPrice.Set_ID || '',
        collectorNumber: String(cardWithPrice.Card_Num || ''),
        type: 'Lorcana Card',  // This is type line, not the card type property
        imageUris: { 
          normal: cardWithPrice.Image,
        },
        prices: {
          usd: cardWithPrice.price_usd?.toString() || null,
          usdFoil: cardWithPrice.price_usd_foil?.toString() || null,
        },
        purchaseUrls: {},
        legalities: {},
        hasNonFoil: true,
        hasFoil: true,
        colorIdentity: [],
        keywords: [],
        cmc: 0,
        frameEffects: []
      };
      
      // Always accept Lorcana cards since verification is less sophisticated
      verificationEmitter.emit(EVENT_NAME, {
        isVerifying: false,
        card: fauxCardForDisplay,
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
      if (card.type === 'MTG' && card.uuid) {
        await this.addMTGCardToCollection(card);
      } else if (card.type === 'Lorcana' && card.id) {
        await this.addLorcanaCardToCollection(card);
      }
    } catch (error) {
      Logger.error('Error adding card to collection:', error);
      throw error;
    }
  },
  
  /**
   * Add MTG card to collection
   */
  async addMTGCardToCollection(card: ScannedCard): Promise<void> {
    if (card.uuid && card.setCode) {
      try {
        const setCode = card.setCode || 'UNKNOWN';
        const setName = card.setName || setCode;
        const setCollectionId = await databaseService.getOrCreateSetCollection(setCode, setName);
        await databaseService.addCardToCollection(card.uuid, setCollectionId);
      } catch (error) {
        Logger.error('Error adding MTG card to collection:', error);
        throw error;
      }
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
  },
  
  /**
   * Handle MTG card collection
   */
  async handleMTGCollection(scannedCard: ScannedCard): Promise<void> {
    if (scannedCard.uuid) {
      const setCode = scannedCard.setCode || 'UNKNOWN';
      const setName = scannedCard.setName || setCode;
      const setCollectionId = await databaseService.getOrCreateSetCollection(setCode, setName);
      await databaseService.addCardToCollection(scannedCard.uuid, setCollectionId);
    }
  }
}; 