import { Logger } from '../utils/logger';
import {
  searchLorcanaCards,
  searchLorcanaCardsByCollector,
  getLorcanaCardWithPrice,
} from './LorcanaService';
import type { LorcanaCard } from '../types/lorcana';

export type CardSearchResult =
  | { kind: 'single'; card: LorcanaCard }
  | { kind: 'multiple'; cards: LorcanaCard[] };

const toPositiveInt = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const normalizeBaseName = (name: string): string => {
  return name.trim().toUpperCase();
};

const normalizeSubtype = (subtype?: string | null): string => {
  return subtype?.trim().toUpperCase() ?? '';
};

const getCardBaseName = (cardName?: string | null): string => {
  if (!cardName) return '';
  const [base] = cardName.split(' - ');
  return normalizeBaseName(base);
};

const getCardSubtype = (cardName?: string | null): string => {
  if (!cardName) return '';
  const parts = cardName.split(' - ');
  if (parts.length < 2) return '';
  return parts.slice(1).join(' - ').trim().toUpperCase();
};

/**
 * Service responsible for searching the local database for a card by name.
 * Handles both exact and fuzzy matches, and fetches price data for single results.
 */
export const CardSearchService = {
  /**
   * Search for a Lorcana card by name, optional subtype, and optional set filter.
   * Returns a single card with price, multiple candidates for user selection, or null if not found.
   */
  async findLorcanaCard(
    mainName: string,
    subtype?: string | null,
    selectedSet?: string | null,
    cardNumber?: string | null,
    setNumber?: number | null,
  ): Promise<CardSearchResult | null> {
    Logger.debug(
      `[CardSearchService] Searching: "${mainName}" (subtype: ${subtype ?? 'none'}, card: ${cardNumber ?? 'n/a'}, setNum: ${setNumber ?? 'n/a'})`
    );

    const parsedCardNumber = toPositiveInt(cardNumber);
    const parsedSetNumber = toPositiveInt(setNumber);

    if (parsedCardNumber !== null) {
      let collectorResults: LorcanaCard[] = [];

      if (parsedSetNumber !== null) {
        collectorResults = await searchLorcanaCardsByCollector(parsedCardNumber, parsedSetNumber, null);
      }

      if (collectorResults.length === 0 && selectedSet) {
        collectorResults = await searchLorcanaCardsByCollector(parsedCardNumber, null, selectedSet);
      }

      if (collectorResults.length === 0) {
        collectorResults = await searchLorcanaCardsByCollector(parsedCardNumber);
      }

      if (collectorResults.length > 0) {
        const normalizedMainName = normalizeBaseName(mainName);
        const normalizedSubtype = normalizeSubtype(subtype);
        const narrowedByName = collectorResults.filter(card => getCardBaseName(card.Name) === normalizedMainName);
        let resolvedResults = narrowedByName.length > 0 ? narrowedByName : collectorResults;

        if (resolvedResults.length > 1 && normalizedSubtype.length >= 3) {
          const narrowedBySubtype = resolvedResults.filter(card => {
            const cardSubtype = getCardSubtype(card.Name);
            if (!cardSubtype) return false;
            return (
              cardSubtype === normalizedSubtype ||
              cardSubtype.includes(normalizedSubtype) ||
              normalizedSubtype.includes(cardSubtype)
            );
          });
          if (narrowedBySubtype.length > 0) {
            resolvedResults = narrowedBySubtype;
          }
        }

        if (resolvedResults.length === 1) {
          const cardWithPrice = await getLorcanaCardWithPrice(resolvedResults[0].Unique_ID);
          if (cardWithPrice) {
            return { kind: 'single', card: cardWithPrice };
          }
          return { kind: 'single', card: resolvedResults[0] };
        }

        Logger.debug(
          `[CardSearchService] Multiple collector matches (${resolvedResults.length}) for card #${parsedCardNumber}`
        );
        return { kind: 'multiple', cards: resolvedResults };
      }
    }

    const results = await searchLorcanaCards(mainName, subtype, selectedSet ?? undefined);
    const narrowedBySetNumber =
      parsedSetNumber !== null
        ? results.filter(card => toPositiveInt(card.Set_Num) === parsedSetNumber)
        : results;
    const resolvedNameResults =
      narrowedBySetNumber.length > 0 ? narrowedBySetNumber : results;
    if (!resolvedNameResults || resolvedNameResults.length === 0) {
      Logger.debug(`[CardSearchService] No results for: "${mainName}"`);
      return null;
    }

    if (resolvedNameResults.length > 1) {
      Logger.debug(`[CardSearchService] Multiple results (${resolvedNameResults.length}) for: "${mainName}"`);
      return { kind: 'multiple', cards: resolvedNameResults };
    }

    const cardWithPrice = await getLorcanaCardWithPrice(resolvedNameResults[0].Unique_ID);
    if (!cardWithPrice) {
      Logger.debug(`[CardSearchService] No price data for: "${mainName}"`);
      return null;
    }

    return { kind: 'single', card: cardWithPrice };
  },
};
