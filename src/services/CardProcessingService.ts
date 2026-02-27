/**
 * CardProcessingService — kept as a thin facade.
 *
 * OCR processing, card searching, and collection management have been
 * moved to dedicated services:
 *   OcrService       — text preprocessing & duplicate detection
 *   CardSearchService — database search & price lookup
 *   CollectionService — persisting cards to the user's collection
 *
 * This file re-exports the types that external code may depend on and
 * delegates the remaining helper methods to the new services.
 */

import { OcrService } from './OcrService';
import { CollectionService } from './CollectionService';
import type { LorcanaCard } from '../types/lorcana';

export type VerificationStatus = {
  isVerifying: boolean;
  card: LorcanaCard | null;
  originalText: string;
  verificationScore: number;
  isVerified: boolean | null;
};

/** @deprecated Use OcrService.preprocessText instead */
export const CardProcessingService = {
  preprocessOcrText: (text: string) => OcrService.preprocessText(text),

  /** @deprecated Use CollectionService.addLorcanaCard instead */
  handleLorcanaCollection: (card: LorcanaCard) => CollectionService.addLorcanaCard(card),

  /** @deprecated Use OcrService.clearRecentScans instead */
  clearRecentScans: () => OcrService.clearRecentScans(),
};
