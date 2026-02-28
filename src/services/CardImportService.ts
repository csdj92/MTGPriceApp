/**
 * CardImportService - Orchestrates the import of Lorcana cards from Lorcast API
 * Handles set discovery, card fetching, data mapping, and database storage
 */

import { lorcastAPI, LorcastCard } from './LorcastAPIService';
import { getLorcanaDatabase } from './DatabaseAccess';
import {
    buildLorcanaUniqueId,
    getCanonicalSetCodeForStorage,
    getLorcanaSetNumberFromIdentifier,
} from '../utils/lorcanaSetMapping';
import { getPreferredLorcastImageUrl } from '../utils/lorcastImage';
import { buildLorcanaColorString } from '../utils/formatters';

export interface ImportProgress {
    totalSets: number;
    currentSet: number;
    setName: string;
    totalCards: number;
    processedCards: number;
    addedCards: number;
    updatedCards: number;
    skippedCards: number;
}

export interface ImportResult {
    success: boolean;
    setsProcessed: number;
    totalCards: number;
    addedCards: number;
    updatedCards: number;
    skippedCards: number;
    errors: string[];
    summary: string;
}

class CardImportService {
    private readonly batchSize = 50;
    private readonly progressUpdateInterval = 10;
    private readonly verboseLogging = typeof __DEV__ !== 'undefined' && __DEV__;

    private debugLog(message: string, ...args: unknown[]): void {
        if (this.verboseLogging) {
            console.log(message, ...args);
        }
    }

    /**
     * Map Lorcast card data to database format
     */
    private mapCardToDbFormat(card: LorcastCard, timestamp: string = new Date().toISOString()): any {
        // Validate required fields
        if (!card) {
            throw new Error('Card data is null or undefined');
        }
        if (!card.name) {
            throw new Error('Card name is missing');
        }
        if (!card.set || !card.set.code) {
            throw new Error('Card set information is missing');
        }
        if (!card.collector_number) {
            throw new Error('Card collector number is missing');
        }

        const canonicalSetCode = getCanonicalSetCodeForStorage(card.set.code);
        if (!canonicalSetCode) {
            throw new Error(`Unable to resolve canonical set code for "${card.set.code}"`);
        }

        const uniqueId = buildLorcanaUniqueId(canonicalSetCode, card.collector_number);
        if (!uniqueId) {
            throw new Error(`Unable to create Unique_ID for card "${card.name}"`);
        }

        return {
            // Primary identifiers
            Unique_ID: uniqueId,
            Name: card.version ? `${card.name} - ${card.version}` : card.name,
            Card_Num: Number(card.collector_number),

            // Set information
            Set_ID: canonicalSetCode,
            Set_Name: card.set.name,
            Set_Num: getLorcanaSetNumberFromIdentifier(canonicalSetCode),

            // Card properties
            Artist: card.illustrators && Array.isArray(card.illustrators) && card.illustrators.length > 0 ? card.illustrators[0] : null,
            Body_Text: card.text,
            Classifications: card.classifications && Array.isArray(card.classifications) && card.classifications.length > 0 ? card.classifications.join(', ') : null,
            Color: buildLorcanaColorString(card),
            Cost: card.cost,
            Flavor_Text: card.flavor_text,
            Franchise: '', // Not provided by Lorcast API
            Image: getPreferredLorcastImageUrl(card),
            Inkable: card.inkwell ? 1 : 0,
            Lore: card.lore,
            Rarity: card.rarity,
            Strength: card.strength,
            Type: card.type && Array.isArray(card.type) && card.type.length > 0 ? card.type[0] : null,
            Willpower: card.willpower,

            // Timestamps
            Date_Added: card.released_at || timestamp,
            Date_Modified: timestamp,
            last_updated: timestamp,

            // Prices
            price_usd: card.prices?.usd || null,
            price_usd_foil: card.prices?.usd_foil || null,

            // Collection status
            collected: 0,
        };
    }

    private async loadExistingCardIds(db: any, setCode: string): Promise<Set<string>> {
        const result = await db.executeSql(
            'SELECT Unique_ID FROM lorcana_cards WHERE UPPER(Set_ID) = UPPER(?)',
            [setCode]
        );

        const existingCardIds = new Set<string>();
        const rows = result[0].rows;
        for (let i = 0; i < rows.length; i++) {
            const row = rows.item(i);
            if (row?.Unique_ID) {
                existingCardIds.add(String(row.Unique_ID));
            }
        }

        return existingCardIds;
    }

    /**
     * Import or update a single card in the database
     */
    private async importCard(
        db: any,
        dbCard: any,
        tcgplayerId: string | number | null | undefined,
        existsInDatabase: boolean
    ): Promise<'added' | 'updated'> {
        this.debugLog(
            `[CardImport] → Processing card: ${dbCard.Name || 'Unknown'} (${dbCard.Unique_ID}), exists=${existsInDatabase}`
        );

        if (!existsInDatabase) {
            // Insert new card
            this.debugLog(`[CardImport]   Inserting new card: ${dbCard.Name}`);

            try {
                await db.executeSql(
                    `INSERT INTO lorcana_cards (
                        Artist, Body_Text, Card_Num, Classifications, Color, Cost,
                        Date_Added, Date_Modified, Flavor_Text, Franchise, Image, Inkable,
                        Lore, Name, Rarity, Set_ID, Set_Name, Set_Num, Strength, Type,
                        Unique_ID, Willpower, collected, last_updated, price_usd, price_usd_foil
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        dbCard.Artist, dbCard.Body_Text, dbCard.Card_Num, dbCard.Classifications,
                        dbCard.Color, dbCard.Cost, dbCard.Date_Added, dbCard.Date_Modified,
                        dbCard.Flavor_Text, dbCard.Franchise, dbCard.Image, dbCard.Inkable,
                        dbCard.Lore, dbCard.Name, dbCard.Rarity, dbCard.Set_ID, dbCard.Set_Name,
                        dbCard.Set_Num, dbCard.Strength, dbCard.Type, dbCard.Unique_ID,
                        dbCard.Willpower, dbCard.collected, dbCard.last_updated,
                        dbCard.price_usd, dbCard.price_usd_foil
                    ]
                );
            } catch (error) {
                console.error(`[CardImport]   ✗ INSERT failed for ${dbCard.Name}:`, error);
                throw error;
            }

            // Also insert into price table
            if (dbCard.price_usd || dbCard.price_usd_foil) {
                try {
                    await db.executeSql(
                        `INSERT OR REPLACE INTO lorcana_card_prices
                        (card_id, usd, usd_foil, tcgplayer_id, last_updated)
                        VALUES (?, ?, ?, ?, ?)`,
                        [
                            dbCard.Unique_ID,
                            dbCard.price_usd,
                            dbCard.price_usd_foil,
                            tcgplayerId,
                            dbCard.last_updated
                        ]
                    );
                } catch (error) {
                    console.error(`[CardImport]   ✗ Price INSERT failed for ${dbCard.Name}:`, error);
                    throw error;
                }
            }

            return 'added';
        } else {
            // Update existing card (preserve collected status)
            this.debugLog(`[CardImport]   Updating existing card...`);

            try {
                await db.executeSql(
                    `UPDATE lorcana_cards SET
                        Artist = ?, Body_Text = ?, Card_Num = ?, Classifications = ?,
                        Color = ?, Cost = ?, Date_Modified = ?, Flavor_Text = ?,
                        Image = ?, Inkable = ?, Lore = ?, Name = ?, Rarity = ?,
                        Set_ID = ?, Set_Name = ?, Set_Num = ?, Strength = ?,
                        Type = ?, Willpower = ?, last_updated = ?,
                        price_usd = ?, price_usd_foil = ?
                    WHERE Unique_ID = ?`,
                    [
                        dbCard.Artist, dbCard.Body_Text, dbCard.Card_Num, dbCard.Classifications,
                        dbCard.Color, dbCard.Cost, dbCard.Date_Modified, dbCard.Flavor_Text,
                        dbCard.Image, dbCard.Inkable, dbCard.Lore, dbCard.Name, dbCard.Rarity,
                        dbCard.Set_ID, dbCard.Set_Name, dbCard.Set_Num, dbCard.Strength,
                        dbCard.Type, dbCard.Willpower, dbCard.last_updated,
                        dbCard.price_usd, dbCard.price_usd_foil,
                        dbCard.Unique_ID
                    ]
                );
            } catch (error) {
                console.error(`[CardImport]   ✗ UPDATE failed for ${dbCard.Name}:`, error);
                throw error;
            }

            // Update price table
            if (dbCard.price_usd || dbCard.price_usd_foil) {
                try {
                    await db.executeSql(
                        `INSERT OR REPLACE INTO lorcana_card_prices
                        (card_id, usd, usd_foil, tcgplayer_id, last_updated)
                        VALUES (?, ?, ?, ?, ?)`,
                        [
                            dbCard.Unique_ID,
                            dbCard.price_usd,
                            dbCard.price_usd_foil,
                            tcgplayerId,
                            dbCard.last_updated
                        ]
                    );
                } catch (error) {
                    console.error(`[CardImport]   ✗ Price UPDATE failed for ${dbCard.Name}:`, error);
                    throw error;
                }
            }

            return 'updated';
        }
    }

    /**
     * Import all cards for a specific set
     */
    async importSet(
        setIdOrCode: string | number,
        onProgress?: (progress: ImportProgress) => void
    ): Promise<{ added: number; updated: number; skipped: number }> {
        try {
            console.log(`[CardImport] ========================================`);
            console.log(`[CardImport] Starting import for set ${setIdOrCode}...`);
            console.log(`[CardImport] ========================================`);

            // Fetch all cards for the set
            console.log(`[CardImport] → Fetching cards from API...`);
            const cards = await lorcastAPI.fetchAllCardsForSet(setIdOrCode);

            console.log(`[CardImport] ✓ API returned ${cards.length} cards`);

            if (cards.length === 0) {
                console.warn(`[CardImport] ⚠ WARNING: No cards found for set ${setIdOrCode}`);
                return { added: 0, updated: 0, skipped: 0 };
            }

            console.log(`[CardImport] → Getting database connection...`);
            const db = await getLorcanaDatabase();
            const canonicalSetCode =
                getCanonicalSetCodeForStorage(cards[0]?.set?.code || String(setIdOrCode)) ||
                String(setIdOrCode).trim().toUpperCase();
            const existingCardIds = await this.loadExistingCardIds(db, canonicalSetCode);
            console.log(
                `[CardImport] ✓ Database connection obtained, found ${existingCardIds.size} existing cards for ${canonicalSetCode}`
            );

            let added = 0;
            let updated = 0;
            let skipped = 0;

            // Process cards in batches to keep progress updates responsive.
            // Avoid async transaction callbacks here; the promise-based executeSql
            // path is more reliable for startup imports.
            const totalBatches = Math.ceil(cards.length / this.batchSize);
            console.log(
                `[CardImport] → Processing ${cards.length} cards in ${totalBatches} batches (${this.batchSize} cards per batch)...`
            );

            for (let i = 0; i < cards.length; i += this.batchSize) {
                const batchNum = Math.floor(i / this.batchSize) + 1;
                const batch = cards.slice(i, Math.min(i + this.batchSize, cards.length));

                this.debugLog(`[CardImport] → Batch ${batchNum}/${totalBatches}: Processing ${batch.length} cards...`);

                for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
                    const card = batch[batchIndex];

                    try {
                        const dbCard = this.mapCardToDbFormat(card);
                        const existsInDatabase = existingCardIds.has(dbCard.Unique_ID);
                        const result = await this.importCard(db, dbCard, card.tcgplayer_id, existsInDatabase);

                        if (result === 'added') {
                            added++;
                            existingCardIds.add(dbCard.Unique_ID);
                        } else if (result === 'updated') {
                            updated++;
                        }
                        else skipped++;

                        const processedCards = i + batchIndex + 1;
                        if (onProgress) {
                            const shouldReportProgress =
                                processedCards === cards.length ||
                                processedCards % this.progressUpdateInterval === 0;

                            if (shouldReportProgress) {
                                onProgress({
                                    totalSets: 1,
                                    currentSet: 1,
                                    setName: card.set.name,
                                    totalCards: cards.length,
                                    processedCards,
                                    addedCards: added,
                                    updatedCards: updated,
                                    skippedCards: skipped
                                });
                            }
                        }
                    } catch (error) {
                        const cardName = card?.name || card?.id || 'Unknown Card';
                        console.error(`[CardImport] Error importing card ${cardName}:`, error);
                        skipped++;
                    }
                }
                this.debugLog(
                    `[CardImport] Batch ${batchNum} complete. Running totals - Added: ${added}, Updated: ${updated}, Skipped: ${skipped}`
                );
            }

            console.log(`[CardImport] ✓ Set ${setIdOrCode} complete: ${added} added, ${updated} updated, ${skipped} skipped`);
            return { added, updated, skipped };
        } catch (error) {
            console.error(`[CardImport] Error importing set ${setIdOrCode}:`, error);
            throw error;
        }
    }

    /**
     * Import all available sets from Lorcast
     */
    async importAllSets(onProgress?: (progress: ImportProgress) => void): Promise<ImportResult> {
        console.log('[CardImport] ████████████████████████████████████████████████');
        console.log('[CardImport] STARTING IMPORT ALL SETS');
        console.log('[CardImport] ████████████████████████████████████████████████');

        const errors: string[] = [];
        let totalAdded = 0;
        let totalUpdated = 0;
        let totalSkipped = 0;
        let setsProcessed = 0;

        try {
            console.log('[CardImport] → Step 1: Fetching all available sets from API...');
            const sets = await lorcastAPI.fetchAllSets();

            console.log(`[CardImport] ✓ Successfully fetched ${sets.length} sets from API`);
            this.debugLog('[CardImport] Sets:', sets.map(s => `${s.name} (${s.code})`).join(', '));

            for (let i = 0; i < sets.length; i++) {
                const set = sets[i];

                try {
                    console.log(`[CardImport] ────────────────────────────────────────`);
                    console.log(`[CardImport] → Processing set ${i + 1}/${sets.length}: ${set.name} (${set.code})`);
                    console.log(`[CardImport] ────────────────────────────────────────`);

                    const result = await this.importSet(set.code, (progress) => {
                        if (onProgress) {
                            onProgress({
                                ...progress,
                                totalSets: sets.length,
                                currentSet: i + 1,
                                setName: set.name
                            });
                        }
                    });

                    totalAdded += result.added;
                    totalUpdated += result.updated;
                    totalSkipped += result.skipped;
                    setsProcessed++;
                } catch (error) {
                    const errorMsg = `Failed to import set ${set.name}: ${error}`;
                    console.error(`[CardImport] ${errorMsg}`);
                    errors.push(errorMsg);
                }
            }

            const summary = `Import complete: ${setsProcessed}/${sets.length} sets processed, ${totalAdded} cards added, ${totalUpdated} cards updated, ${totalSkipped} skipped`;
            console.log(`[CardImport] ${summary}`);

            return {
                success: errors.length === 0,
                setsProcessed,
                totalCards: totalAdded + totalUpdated,
                addedCards: totalAdded,
                updatedCards: totalUpdated,
                skippedCards: totalSkipped,
                errors,
                summary
            };
        } catch (error) {
            console.error('[CardImport] Fatal error during import:', error);
            return {
                success: false,
                setsProcessed,
                totalCards: totalAdded + totalUpdated,
                addedCards: totalAdded,
                updatedCards: totalUpdated,
                skippedCards: totalSkipped,
                errors: [...errors, `Fatal error: ${error}`],
                summary: 'Import failed with errors'
            };
        }
    }

    /**
     * Get import statistics for a specific set
     */
    async getSetImportStats(setCode: string): Promise<{
        totalInDb: number;
        expectedCount: number;
        complete: boolean;
    }> {
        try {
            const db = await getLorcanaDatabase();
            const canonicalSetCode = getCanonicalSetCodeForStorage(setCode) || setCode.trim().toUpperCase();

            // Count cards in database for this set
            const resultSet = await db.executeSql(
                'SELECT COUNT(*) as count FROM lorcana_cards WHERE Set_ID = ?',
                [canonicalSetCode]
            );
            const totalInDb = resultSet[0].rows.item(0).count;

            // Fetch set info from API to get expected count
            const sets = await lorcastAPI.fetchAllSets();
            const normalizedInput = setCode.trim().toUpperCase();
            const set = sets.find((s) => {
                const normalizedSetCode = getCanonicalSetCodeForStorage(s.code) || s.code.toString().trim().toUpperCase();
                return normalizedSetCode === canonicalSetCode || normalizedSetCode === normalizedInput;
            });
            const expectedCount = set?.card_count || 0;

            return {
                totalInDb,
                expectedCount,
                complete: totalInDb >= expectedCount
            };
        } catch (error) {
            console.error('[CardImport] Error getting import stats:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const cardImportService = new CardImportService();
