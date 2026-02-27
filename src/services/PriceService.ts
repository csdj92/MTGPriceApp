import { getLorcanaDatabase } from './DatabaseAccess';
import { LorcastCard, lorcastAPI } from './LorcastAPIService';
import { getPreferredLorcastImageUrl } from '../utils/lorcastImage';

export type PriceLookupCard = {
    Name: string;
    Set_Num?: number;
    Rarity?: string;
    Card_Num?: number;
    Unique_ID?: string;
};

export type LorcanaPrice = {
    usd: string | null;
    usd_foil: string | null;
    tcgplayer_id: string | null;
};

const DEFAULT_CACHE_HOURS = 24;
const HISTORY_DEDUPE_WINDOW_MS = 60 * 60 * 1000;

const toIsoCutoff = (hours: number): string => {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
};

const normalizeText = (value?: string | null): string => {
    return (value || '').trim().toLowerCase();
};

const normalizeRarity = (value?: string | null): string => {
    return normalizeText(value).replace(/[\s-]+/g, '_');
};

const normalizePriceValue = (value: unknown): string | null => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    return String(value);
};

const toPositiveInt = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return Math.trunc(parsed);
};

const splitCardName = (name: string): { baseName: string; version: string } => {
    const parts = name.split(' - ');
    return {
        baseName: parts[0]?.trim() || name.trim(),
        version: parts.length > 1 ? parts.slice(1).join(' - ').trim() : '',
    };
};

const escapeQueryText = (value: string): string => value.replace(/"/g, '\\"');

class PriceService {
    private async getCachedPriceByCardId(cardId: string, maxAgeHours: number = DEFAULT_CACHE_HOURS): Promise<LorcanaPrice | null> {
        const db = await getLorcanaDatabase();
        const cutoff = toIsoCutoff(maxAgeHours);
        const [result] = await db.executeSql(
            `SELECT usd, usd_foil, tcgplayer_id, last_updated
             FROM lorcana_card_prices
             WHERE card_id = ? AND last_updated IS NOT NULL AND last_updated >= ?`,
            [cardId, cutoff]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows.item(0);
        return {
            usd: normalizePriceValue(row.usd),
            usd_foil: normalizePriceValue(row.usd_foil),
            tcgplayer_id: row.tcgplayer_id !== null && row.tcgplayer_id !== undefined
                ? String(row.tcgplayer_id)
                : null,
        };
    }

    async getRecentPricesForCards(
        cards: Array<Pick<PriceLookupCard, 'Unique_ID' | 'Name'>>,
        maxAgeHours: number = DEFAULT_CACHE_HOURS
    ): Promise<Record<string, LorcanaPrice>> {
        const uniqueCardIds = Array.from(
            new Set(
                cards
                    .map((card) => card.Unique_ID)
                    .filter((cardId): cardId is string => Boolean(cardId))
            )
        );

        if (uniqueCardIds.length === 0) {
            return {};
        }

        const db = await getLorcanaDatabase();
        const placeholders = uniqueCardIds.map(() => '?').join(', ');
        const cutoff = toIsoCutoff(maxAgeHours);

        const [result] = await db.executeSql(
            `SELECT card_id, usd, usd_foil, tcgplayer_id
             FROM lorcana_card_prices
             WHERE card_id IN (${placeholders})
               AND last_updated IS NOT NULL
               AND last_updated >= ?`,
            [...uniqueCardIds, cutoff]
        );

        const byUniqueId: Record<string, LorcanaPrice> = {};
        for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            byUniqueId[row.card_id] = {
                usd: normalizePriceValue(row.usd),
                usd_foil: normalizePriceValue(row.usd_foil),
                tcgplayer_id: row.tcgplayer_id !== null && row.tcgplayer_id !== undefined
                    ? String(row.tcgplayer_id)
                    : null,
            };
        }

        const response: Record<string, LorcanaPrice> = {};
        for (const card of cards) {
            const cacheKey = card.Unique_ID || card.Name;
            if (!cacheKey) {
                continue;
            }

            const cached = card.Unique_ID ? byUniqueId[card.Unique_ID] : null;
            if (cached) {
                response[cacheKey] = cached;
            }
        }

        return response;
    }

    private scoreSearchResult(card: PriceLookupCard, candidate: LorcastCard): number {
        const { baseName, version } = splitCardName(card.Name);
        const candidateName = candidate?.name || '';
        const candidateVersion = candidate?.version || '';
        const candidateCollectorNumber = candidate?.collector_number || '';
        const normalizedCardNumber = toPositiveInt(card.Card_Num);
        const normalizedSetNumber = toPositiveInt(card.Set_Num);
        const targetCollectorNumber = normalizedCardNumber !== null ? String(normalizedCardNumber) : '';

        let score = 0;

        if (normalizeText(candidateName) === normalizeText(card.Name)) {
            score += 90;
        } else if (normalizeText(candidateName) === normalizeText(baseName)) {
            score += 65;
        } else if (
            normalizeText(candidateName).includes(normalizeText(baseName)) ||
            normalizeText(baseName).includes(normalizeText(candidateName))
        ) {
            score += 35;
        }

        if (version) {
            if (normalizeText(candidateVersion) === normalizeText(version)) {
                score += 25;
            } else if (
                normalizeText(candidateVersion).includes(normalizeText(version)) ||
                normalizeText(version).includes(normalizeText(candidateVersion))
            ) {
                score += 12;
            }
        }

        if (targetCollectorNumber && candidateCollectorNumber === targetCollectorNumber) {
            score += 20;
        }

        if (normalizedSetNumber !== null) {
            const setAsString = String(normalizedSetNumber);
            if (
                candidate?.set?.id === setAsString ||
                candidate?.set?.code?.toUpperCase() === setAsString.toUpperCase()
            ) {
                score += 20;
            }
        }

        if (normalizeRarity(card.Rarity) && normalizeRarity(card.Rarity) === normalizeRarity(candidate?.rarity)) {
            score += 10;
        }

        return score;
    }

    private pickBestSearchResult(card: PriceLookupCard, candidates: LorcastCard[]): LorcastCard | null {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            return null;
        }

        let best: { score: number; card: LorcastCard } | null = null;
        for (const candidate of candidates) {
            const score = this.scoreSearchResult(card, candidate);
            if (!best || score > best.score) {
                best = { score, card: candidate };
            }
        }

        return best?.card || candidates[0];
    }

    private async findCardFromLorcast(card: PriceLookupCard): Promise<LorcastCard | null> {
        const normalizedSetNumber = toPositiveInt(card.Set_Num);
        const normalizedCardNumber = toPositiveInt(card.Card_Num);

        if (normalizedSetNumber !== null && normalizedCardNumber !== null) {
            const direct = await lorcastAPI.fetchCard(normalizedSetNumber, normalizedCardNumber);
            if (direct) {
                return direct;
            }
        }

        const { baseName, version } = splitCardName(card.Name);
        const queryParts = [
            `name:"${escapeQueryText(baseName)}"`,
            version ? `version:"${escapeQueryText(version)}"` : '',
            normalizedSetNumber !== null ? `set:${normalizedSetNumber}` : '',
            card.Rarity ? `rarity:${normalizeRarity(card.Rarity)}` : '',
        ].filter(Boolean);

        try {
            const strictResults = await lorcastAPI.searchCards(queryParts.join(' '), 'prints');
            const strictMatch = this.pickBestSearchResult(card, strictResults);
            if (strictMatch) {
                return strictMatch;
            }
        } catch (error) {
            console.warn('[PriceService] Strict Lorcast search failed, falling back to lenient query', error);
        }

        try {
            const lenientResults = await lorcastAPI.searchCards(`name:"${escapeQueryText(baseName)}"`, 'prints');
            return this.pickBestSearchResult(card, lenientResults);
        } catch (error) {
            console.warn('[PriceService] Lenient Lorcast search failed', error);
            return null;
        }
    }

    private toPricePayload(card: PriceLookupCard, lorcastCard: LorcastCard): LorcanaPrice {
        const isEnchanted = normalizeText(card.Rarity) === 'enchanted';
        const usd = normalizePriceValue(lorcastCard?.prices?.usd);
        const usdFoil = normalizePriceValue(lorcastCard?.prices?.usd_foil);

        return {
            usd: isEnchanted ? (usdFoil || usd) : (usd || usdFoil),
            usd_foil: usdFoil,
            tcgplayer_id: lorcastCard?.tcgplayer_id !== null && lorcastCard?.tcgplayer_id !== undefined
                ? String(lorcastCard.tcgplayer_id)
                : null,
        };
    }

    private async isFirstScan(cardId: string): Promise<boolean> {
        const db = await getLorcanaDatabase();
        const [result] = await db.executeSql(
            'SELECT COUNT(*) as count FROM lorcana_price_history WHERE card_id = ?',
            [cardId]
        );
        return result.rows.item(0).count === 0;
    }

    private async savePriceHistory(
        cardId: string,
        price: LorcanaPrice,
        isFirstScan: boolean
    ): Promise<void> {
        const db = await getLorcanaDatabase();
        const [lastRecord] = await db.executeSql(
            `SELECT usd, usd_foil, recorded_at
             FROM lorcana_price_history
             WHERE card_id = ?
             ORDER BY recorded_at DESC
             LIMIT 1`,
            [cardId]
        );

        if (lastRecord.rows.length > 0) {
            const latest = lastRecord.rows.item(0);
            const lastRecordedAt = new Date(latest.recorded_at).getTime();
            const pricesUnchanged = latest.usd === price.usd && latest.usd_foil === price.usd_foil;
            const tooRecent = Date.now() - lastRecordedAt < HISTORY_DEDUPE_WINDOW_MS;
            if (pricesUnchanged && tooRecent) {
                return;
            }
        }

        await db.executeSql(
            `INSERT INTO lorcana_price_history (card_id, usd, usd_foil, tcgplayer_id, recorded_at, first_scan)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                cardId,
                price.usd,
                price.usd_foil,
                price.tcgplayer_id,
                new Date().toISOString(),
                isFirstScan ? 1 : 0,
            ]
        );
    }

    private async persistCurrentPrice(cardId: string, price: LorcanaPrice, imageUrl: string | null): Promise<void> {
        const db = await getLorcanaDatabase();
        const timestamp = new Date().toISOString();

        await db.executeSql(
            `INSERT OR REPLACE INTO lorcana_card_prices (card_id, usd, usd_foil, tcgplayer_id, last_updated)
             VALUES (?, ?, ?, ?, ?)`,
            [cardId, price.usd, price.usd_foil, price.tcgplayer_id, timestamp]
        );

        if (imageUrl) {
            await db.executeSql(
                `UPDATE lorcana_cards
                 SET price_usd = ?, price_usd_foil = ?, last_updated = ?, Image = ?
                 WHERE Unique_ID = ?`,
                [price.usd, price.usd_foil, timestamp, imageUrl, cardId]
            );
            return;
        }

        await db.executeSql(
            `UPDATE lorcana_cards
             SET price_usd = ?, price_usd_foil = ?, last_updated = ?
             WHERE Unique_ID = ?`,
            [price.usd, price.usd_foil, timestamp, cardId]
        );
    }

    async getCardPrice(
        card: PriceLookupCard,
        options: { forceRefresh?: boolean; maxAgeHours?: number; skipRecentCacheLookup?: boolean } = {}
    ): Promise<LorcanaPrice> {
        const {
            forceRefresh = false,
            maxAgeHours = DEFAULT_CACHE_HOURS,
            skipRecentCacheLookup = false,
        } = options;

        if (!card || !card.Name) {
            return { usd: null, usd_foil: null, tcgplayer_id: null };
        }

        if (card.Unique_ID && !forceRefresh && !skipRecentCacheLookup) {
            const cached = await this.getCachedPriceByCardId(card.Unique_ID, maxAgeHours);
            if (cached) {
                return cached;
            }
        }

        const lorcastCard = await this.findCardFromLorcast(card);
        if (!lorcastCard) {
            return { usd: null, usd_foil: null, tcgplayer_id: null };
        }

        const price = this.toPricePayload(card, lorcastCard);
        const imageUrl = getPreferredLorcastImageUrl(lorcastCard);

        if (card.Unique_ID) {
            const firstScan = await this.isFirstScan(card.Unique_ID);
            await this.persistCurrentPrice(card.Unique_ID, price, imageUrl);
            await this.savePriceHistory(card.Unique_ID, price, firstScan);
        }

        return price;
    }

    async cleanupPriceHistory(daysToKeep: number = 15): Promise<number> {
        const db = await getLorcanaDatabase();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoff = cutoffDate.toISOString();

        const [before] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_price_history');
        const beforeCount = before.rows.item(0).count;

        await db.executeSql(
            `DELETE FROM lorcana_price_history
             WHERE recorded_at < ?
               AND first_scan = 0`,
            [cutoff]
        );

        const [after] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_price_history');
        const afterCount = after.rows.item(0).count;
        return beforeCount - afterCount;
    }

    async updateAllPrices(daysThreshold: number = 1): Promise<{ updated: number; skipped: number }> {
        const db = await getLorcanaDatabase();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);
        const cutoff = cutoffDate.toISOString();

        const [cardsToUpdate] = await db.executeSql(
            `SELECT lc.*
             FROM lorcana_cards lc
             LEFT JOIN lorcana_card_prices lcp ON lc.Unique_ID = lcp.card_id
             WHERE lcp.card_id IS NULL OR lcp.last_updated < ?
             ORDER BY lc.Name`,
            [cutoff]
        );

        let updated = 0;
        let skipped = 0;

        const batchSize = 10;
        for (let i = 0; i < cardsToUpdate.rows.length; i += batchSize) {
            const batch: PriceLookupCard[] = [];
            for (let j = 0; j < batchSize && i + j < cardsToUpdate.rows.length; j++) {
                batch.push(cardsToUpdate.rows.item(i + j));
            }

            await Promise.all(
                batch.map(async (card) => {
                    try {
                        await this.getCardPrice(card, { forceRefresh: true, maxAgeHours: 0 });
                        updated++;
                    } catch (error) {
                        console.error(`[PriceService] Failed to update price for ${card.Name}`, error);
                        skipped++;
                    }
                })
            );

            if (i + batchSize < cardsToUpdate.rows.length) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }

        await this.cleanupPriceHistory(15);
        return { updated, skipped };
    }
}

export const priceService = new PriceService();
