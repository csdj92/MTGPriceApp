import { Logger } from '../utils/logger';
import {
  getOrCreateLorcanaSetCollection,
  addCardToLorcanaCollection,
  markCardAsCollected,
} from './LorcanaService';
import type { LorcanaCard } from '../types/lorcana';

/**
 * Service responsible for persisting cards into the user's collection.
 * Each method has a single responsibility: write to the DB and nothing else.
 */
export const CollectionService = {
  /**
   * Add a Lorcana card to its set collection and mark it as collected.
   * No-ops silently if the card is missing Set_ID or Set_Name.
   */
  async addLorcanaCard(card: LorcanaCard): Promise<void> {
    const { Set_ID, Set_Name, Unique_ID } = card;
    if (!Set_ID || !Set_Name) {
      Logger.debug('[CollectionService] Skipping card without set info:', Unique_ID);
      return;
    }

    Logger.debug('[CollectionService] Adding card to collection:', Unique_ID);
    const setCollectionId = await getOrCreateLorcanaSetCollection(Set_ID, Set_Name);
    if (setCollectionId) {
      await addCardToLorcanaCollection(Unique_ID, setCollectionId);
      await markCardAsCollected(Unique_ID);
      Logger.debug('[CollectionService] Card added successfully:', Unique_ID);
    }
  },
};
