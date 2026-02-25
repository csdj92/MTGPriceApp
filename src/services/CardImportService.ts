/**
 * CardImportService - Orchestrates the import of Lorcana cards from Lorcast API
 * Handles set discovery, card fetching, data mapping, and database storage
 */

import { lorcastAPI, LorcastCard, LorcastSet } from './LorcastAPIService';
import { getLorcanaDatabase } from './DatabaseAccess';
import {
    buildLorcanaUniqueId,
    getCanonicalSetCodeForStorage,
    getLorcanaSetNumberFromIdentifier,
} from '../utils/lorcanaSetMapping';
import { getPreferredLorcastImageUrl } from '../utils/lorcastImage';

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
    /**
     * Map Lorcast card data to database format
     */
    private mapCardToDbFormat(card: LorcastCard): any {
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
            Color: card.inks && Array.isArray(card.inks) && card.inks.length > 0 ? card.inks[0] : null,
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
            Date_Added: card.released_at || new Date().toISOString(),
            Date_Modified: new Date().toISOString(),
            last_updated: new Date().toISOString(),

            // Prices
            price_usd: card.prices?.usd || null,
            price_usd_foil: card.prices?.usd_foil || null,

            // Collection status
            collected: 0,
        };
    }

    /**
     * Import or update a single card in the database
     */
    private async importCard(db: any, card: LorcastCard): Promise<'added' | 'updated' | 'skipped'> {
        const dbCard = this.mapCardToDbFormat(card);
        console.log(`[CardImport] → Processing card: ${dbCard.Name || 'Unknown'} (${dbCard.Unique_ID})`);

        // Check if card exists - use promise-based executeSql
        let result;
        try {
            result = await db.executeSql(
                'SELECT Unique_ID, collected FROM lorcana_cards WHERE Unique_ID = ?',
                [dbCard.Unique_ID]
            );
            console.log(`[CardImport]   SELECT result for ${dbCard.Unique_ID}: ${result[0].rows.length} rows`);
        } catch (error) {
            console.error(`[CardImport]   SELECT failed for ${dbCard.Unique_ID}:`, error);
            throw error;
        }
        const rows = result[0].rows;

        console.log(`[CardImport]   Card exists in DB: ${rows.length > 0}`);

        if (rows.length === 0) {
            // Insert new card
            console.log(`[CardImport]   ✓ Inserting new card: ${dbCard.Name}`);

            // Use promise-based executeSql
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
                console.log(`[CardImport]   ✓ INSERT success for ${dbCard.Name}`);
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
                            card.tcgplayer_id,
                            new Date().toISOString()
                        ]
                    );
                    console.log(`[CardImport]   ✓ Price INSERT success for ${dbCard.Name}`);
                } catch (error) {
                    console.error(`[CardImport]   ✗ Price INSERT failed for ${dbCard.Name}:`, error);
                    throw error;
                }
            }

            console.log(`[CardImport]   ✓ Insert completed, returning 'added'`);
            return 'added';
        } else {
            // Update existing card (preserve collected status)
            console.log(`[CardImport]   Updating existing card...`);
            const wasCollected = rows.item(0).collected === 1;

            // Use promise-based executeSql
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
                console.log(`[CardImport]   ✓ UPDATE success for ${dbCard.Name}`);
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
                            card.tcgplayer_id,
                            new Date().toISOString()
                        ]
                    );
                    console.log(`[CardImport]   ✓ Price UPDATE success for ${dbCard.Name}`);
                } catch (error) {
                    console.error(`[CardImport]   ✗ Price UPDATE failed for ${dbCard.Name}:`, error);
                    throw error;
                }
            }

            console.log(`[CardImport]   ✓ Update completed, returning 'updated'`);
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
            console.log(`[CardImport] ✓ Database connection obtained`);

            // Skip table verification for now - proceed directly to test INSERT

            let added = 0;
            let updated = 0;
            let skipped = 0;

            // Test basic INSERT functionality
            console.log(`[CardImport] → Testing basic INSERT functionality...`);
            try {
                await db.executeSql(
                    "INSERT OR REPLACE INTO lorcana_cards (Unique_ID, Name, Set_ID, Card_Num, collected, last_updated) VALUES (?, ?, ?, ?, ?, ?)",
                    ['TEST-999', 'Test Card', 'TEST', 999, 0, new Date().toISOString()]
                );
                console.log(`[CardImport] ✓ Test INSERT successful`);

                // Clean up test record
                await db.executeSql(
                    "DELETE FROM lorcana_cards WHERE Unique_ID = ?",
                    ['TEST-999']
                );
                console.log(`[CardImport] ✓ Test record cleaned up`);
            } catch (error) {
                console.error(`[CardImport] Basic INSERT test failed:`, error);
                throw error;
            }

            // Process cards in batches to avoid long transactions
            const batchSize = 50;
            const totalBatches = Math.ceil(cards.length / batchSize);
            console.log(`[CardImport] → Processing ${cards.length} cards in ${totalBatches} batches (${batchSize} cards per batch)...`);

            for (let i = 0; i < cards.length; i += batchSize) {
                const batchNum = Math.floor(i / batchSize) + 1;
                const batch = cards.slice(i, Math.min(i + batchSize, cards.length));

                console.log(`[CardImport] → Batch ${batchNum}/${totalBatches}: Processing ${batch.length} cards...`);

                // Process cards WITHOUT transaction for now (to debug)
                for (const card of batch) {
                    try {
                        const result = await this.importCard(db, card);
                        console.log(`[CardImport]     Result for ${card.name}: ${result}`);

                        if (result === 'added') added++;
                        else if (result === 'updated') updated++;
                        else skipped++;

                        // Report progress
                        if (onProgress) {
                            onProgress({
                                totalSets: 1,
                                currentSet: 1,
                                setName: card.set.name,
                                totalCards: cards.length,
                                processedCards: i + batch.indexOf(card) + 1,
                                addedCards: added,
                                updatedCards: updated,
                                skippedCards: skipped
                            });
                        }
                    } catch (error) {
                        const cardName = card?.name || card?.id || 'Unknown Card';
                        console.error(`[CardImport] Error importing card ${cardName}:`, error);
                        skipped++;
                    }
                }
                console.log(`[CardImport]   Batch ${batchNum} complete. Running totals - Added: ${added}, Updated: ${updated}, Skipped: ${skipped}`);
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
            console.log('[CardImport] Sets:', sets.map(s => `${s.name} (${s.code})`).join(', '));

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
