import { Platform, ToastAndroid } from 'react-native';
import { databaseService } from './DatabaseService';
import { Logger } from '../utils/logger';
import { scryfallService } from './ScryfallService';
import { getLorcanaCardWithPrice, searchLorcanaCards, markCardAsCollected, getOrCreateLorcanaSetCollection, addCardToLorcanaCollection } from './LorcanaService';
import type { OcrResult, ExtendedCard } from '../types/card';
import type { LorcanaCard } from '../types/lorcana';
import type { ScannedCard } from '../hooks/useScannedCards';

// Recent scans tracking for duplicate prevention
const recentScans = new Set<string>();
const SCAN_COOLDOWN_MS = 1750; // 1.75 second cooldown between scans
const MAX_RECENT_SCANS = 10; // Maximum number of recent scans to track

/**
 * Service for processing card data
 */
export const CardProcessingService = {
  /**
   * Process OCR result text to identify cards
   */
  async processOcrResult(result: OcrResult): Promise<ScannedCard | null> {
    try {
      if (!result?.text?.trim()) {
        return null;
      }
      
      Logger.debug(`Processing OCR result: ${result.text} (isLorcana: ${result.isLorcana})`);
      
      if (result.isLorcana) {
        // Handle null or undefined mainName
        if (!result.mainName) {
          return null;
        }
        return await this.processLorcanaOcrText(result.mainName, result.subtype ?? undefined);
      } else {
        return await this.processMTGOcrText(result.text);
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
      // Search for card in Scryfall
      const searchResponse = await scryfallService.searchCards(ocrText, 1);
      const foundCards = searchResponse.data;
      
      if (foundCards.length === 0) {
        return null;
      }
      
      // Process the first result
      return await this.processMTGCard(foundCards[0]);
    } catch (error) {
      Logger.error('Error processing MTG OCR text:', error);
      throw error;
    }
  },
  
  /**
   * Process OCR text to identify Lorcana cards
   */
  async processLorcanaOcrText(mainName: string, subtype?: string): Promise<ScannedCard | null> {
    try {
      // Search for card in Lorcana database
      const lorcanaResults = await searchLorcanaCards(mainName, subtype);
      
      if (!lorcanaResults || lorcanaResults.length === 0) {
        return null;
      }
      
      // Process the first result
      return await this.processLorcanaCard(lorcanaResults[0]);
    } catch (error) {
      Logger.error('Error processing Lorcana OCR text:', error);
      throw error;
    }
  },
  
  /**
   * Process MTG card data into a ScannedCard
   */
  async processMTGCard(card: ExtendedCard): Promise<ScannedCard | null> {
    try {
      const timestamp = Date.now();
      
      // Check for duplicates
      const isDuplicate = this.checkForDuplicate(card.name.toLowerCase(), timestamp);
      if (isDuplicate) {
        return null;
      }
      
      // Add card to cache to ensure it has a UUID
      const cardWithUuid = await databaseService.addToCache(card);
      if (!cardWithUuid.uuid) {
        throw new Error('Failed to generate UUID for card');
      }

      // Ensure imageUris is properly set
      const imageUris = cardWithUuid.imageUris || {};
      if (cardWithUuid.imageUrl && !imageUris.normal) {
        // If we have imageUrl but not imageUris.normal, set it
        imageUris.normal = cardWithUuid.imageUrl;
      }

      // Create scanned card object
      const scannedCard: ScannedCard = {
        ...cardWithUuid,
        type: 'MTG',
        scannedAt: timestamp,
        imageUris: imageUris
      };
      
      return scannedCard;
    } catch (error) {
      Logger.error('Error processing MTG card:', error);
      throw error;
    }
  },
  
  /**
   * Process Lorcana card data into a ScannedCard
   */
  async processLorcanaCard(card: LorcanaCard): Promise<ScannedCard | null> {
    try {
      const timestamp = Date.now();
      
      // Check for duplicates - ensure we handle naming correctly
      // Note: LorcanaCard should use 'Name' not 'name'
      const cardName = card.Name?.toLowerCase() || '';
      const isDuplicate = this.checkForDuplicate(cardName, timestamp);
      if (isDuplicate) {
        return null;
      }
      
      // Get card with price data
      const cardWithPrice = await getLorcanaCardWithPrice(card.Unique_ID);
      if (!cardWithPrice) {
        throw new Error('Failed to get Lorcana card with price');
      }
      
      // Create scanned card object
      const scannedCard: ScannedCard = {
        id: cardWithPrice.Unique_ID,
        uuid: cardWithPrice.Unique_ID,
        name: cardWithPrice.Name || '',
        setName: cardWithPrice.Set_Name || '',
        setCode: cardWithPrice.Set_ID || '',
        collectorNumber: String(cardWithPrice.Card_Num || ''),
        imageUris: { normal: cardWithPrice.Image || '' },
        hasNonFoil: true,
        hasFoil: true,
        prices: {
          usd: cardWithPrice.price_usd || cardWithPrice.prices?.usd || null,
          usdFoil: cardWithPrice.price_usd_foil || cardWithPrice.prices?.usd_foil || null
        },
        type: 'Lorcana',
        purchaseUrls: {},
        legalities: {},
        scannedAt: timestamp,
        rarity: cardWithPrice.Rarity || '',
        colorIdentity: [],
        keywords: [],
        cmc: 0,
        frameEffects: [],
      };
      
      return scannedCard;
    } catch (error) {
      Logger.error('Error processing Lorcana card:', error);
      throw error;
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
  }
}; 