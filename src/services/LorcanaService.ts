import { SQLiteDatabase, enablePromise } from 'react-native-sqlite-storage'
import RNFS from 'react-native-fs'
import { updateAllImageUrlsInDatabase } from '../utils/imageUtils'
import { LorcanaCard, LorcanaCardWithPrice, PartialLorcanaCardWithPrice } from '../types/lorcana'
import DatabaseInitializer from './DatabaseInitializer'
import { getLorcanaDatabase } from './DatabaseAccess'
import { Logger } from '../utils/logger'
import { cardImportService, type ImportProgress, type ImportResult } from './CardImportService'
import { lorcastAPI, LorcastSet } from './LorcastAPIService'
import { priceService } from './PriceService'
import {
    buildLorcanaUniqueId,
    getCanonicalSetCodeForStorage,
    getLorcanaSetCodeFromIdentifier,
    getLorcanaSetNumberFromIdentifier,
    mapLorcastSetCodeToCanonicalSetCode,
} from '../utils/lorcanaSetMapping'
import { getPreferredLorcastImageUrl } from '../utils/lorcastImage'
import { buildLorcanaColorString } from '../utils/formatters'

// Enable promise support for SQLite
enablePromise(true)

// Function to get the latest set API URL dynamically
const getLatestSetApiUrl = (setNumber: number = 10): string => {
    return `https://api.lorcast.com/v0/sets/${setNumber}/cards`;
};

// Function to get set API URL for a specific set
const getSetApiUrl = (setNumber: number): string => {
    return `https://api.lorcast.com/v0/sets/${setNumber}/cards`;
};

/**
 * Sync sets from Lorcast API to local database
 * This eliminates hardcoded set mappings and enables dynamic set handling
 */
export const syncLorcanaSetsFromAPI = async (): Promise<void> => {
    try {
        console.log('[LorcanaService] Syncing sets from Lorcast API...');

        // Fetch all sets from API
        const sets = await lorcastAPI.fetchAllSets();
        console.log(`[LorcanaService] Fetched ${sets.length} sets from API`);
        await upsertLorcanaSetMetadata(sets);

        console.log(`[LorcanaService] Successfully synced ${sets.length} sets to database`);
    } catch (error) {
        console.error('[LorcanaService] Error syncing sets from API:', error);
        // Don't throw - we can fall back to existing data
    }
};

/**
 * Get set info from cache or API
 */
export const getLorcanaSetByCode = async (code: string): Promise<{ set_number: number; name: string; code: string } | null> => {
    try {
        const db = await getDB();
        const [result] = await db.executeSql(
            'SELECT set_number, name, code FROM lorcana_sets WHERE UPPER(code) = UPPER(?) LIMIT 1',
            [code]
        );

        if (result.rows.length > 0) {
            return result.rows.item(0);
        }

        return null;
    } catch (error) {
        console.error(`[LorcanaService] Error getting set by code ${code}:`, error);
        return null;
    }
};

export interface LorcanaInitializationStatus {
    message: string;
    stage: 'preparing' | 'importing' | 'finalizing' | 'ready';
}

export interface LorcanaInitializationResult {
    success: boolean;
    didImportCards: boolean;
    importedSetNames: string[];
}

let dbInstance: SQLiteDatabase | null = null
let isInitialized = false
let initializationPromise: Promise<LorcanaInitializationResult> | null = null
let hasBackfilledMissingColors = false;

const reportInitializationStatus = (
    onStatusChange?: (status: LorcanaInitializationStatus) => void,
    status?: LorcanaInitializationStatus
) => {
    if (!onStatusChange || !status) {
        return;
    }

    try {
        onStatusChange(status);
    } catch (error) {
        console.warn('[LorcanaService] Failed to report initialization status:', error);
    }
};

const getNormalizedSetCode = (setCode: string): string => {
    const canonicalSetCode = getCanonicalSetCodeForStorage(setCode);
    return canonicalSetCode || setCode.trim().toUpperCase();
};

const upsertLorcanaSetMetadata = async (
    sets: LorcastSet[],
    dbConnection?: SQLiteDatabase
): Promise<void> => {
    const db = dbConnection ?? await getDB();
    const sortedSets = [...sets].sort((a, b) =>
        new Date(a.released_at).getTime() - new Date(b.released_at).getTime()
    );
    const now = new Date().toISOString();

    for (let i = 0; i < sortedSets.length; i++) {
        const set = sortedSets[i];
        const normalizedSetCode = getNormalizedSetCode(set.code);
        const setNumber = i + 1;

        await db.executeSql(`
            INSERT OR IGNORE INTO lorcana_sets
            (id, code, name, set_number, released_at, card_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            set.id,
            normalizedSetCode,
            set.name,
            setNumber,
            set.released_at,
            set.card_count || 0,
            now,
            now
        ]);

        await db.executeSql(`
            UPDATE lorcana_sets
            SET code = ?, name = ?, set_number = ?, released_at = ?, card_count = ?, updated_at = ?
            WHERE id = ?
        `, [
            normalizedSetCode,
            set.name,
            setNumber,
            set.released_at,
            set.card_count || 0,
            now,
            set.id
        ]);
    }
};

const getLocalCardCountsBySet = async (dbConnection?: SQLiteDatabase): Promise<Map<string, number>> => {
    const db = dbConnection ?? await getDB();
    const [result] = await db.executeSql(`
        SELECT UPPER(Set_ID) AS set_code, COUNT(*) AS count
        FROM lorcana_cards
        WHERE Set_ID IS NOT NULL
        GROUP BY UPPER(Set_ID)
    `);

    const counts = new Map<string, number>();
    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        counts.set(row.set_code, Number(row.count) || 0);
    }

    return counts;
};

const backfillLorcanaCollectionSetCodes = async (dbConnection?: SQLiteDatabase): Promise<void> => {
    const db = dbConnection ?? await getDB();

    try {
        const [collectionColumns] = await db.executeSql('PRAGMA table_info(lorcana_collections)');
        const collectionColumnNames = new Set<string>();
        for (let i = 0; i < collectionColumns.rows.length; i++) {
            collectionColumnNames.add(collectionColumns.rows.item(i).name);
        }

        if (!collectionColumnNames.has('set_code')) {
            console.log('[LorcanaService] Skipping collection set_code backfill because set_code column is missing');
            return;
        }

        const [setsTableResult] = await db.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='lorcana_sets'"
        );
        if (setsTableResult.rows.length === 0) {
            console.log('[LorcanaService] Skipping collection set_code backfill because lorcana_sets is missing');
            return;
        }

        await db.executeSql(`
            UPDATE lorcana_collections
            SET set_code = (
                SELECT UPPER(ls.code)
                FROM lorcana_sets ls
                WHERE lorcana_collections.description LIKE '%(' || ls.code || ')%' COLLATE NOCASE
                LIMIT 1
            )
            WHERE name LIKE 'Set: %'
              AND (set_code IS NULL OR TRIM(set_code) = '')
              AND EXISTS (
                  SELECT 1
                  FROM lorcana_sets ls
                  WHERE lorcana_collections.description LIKE '%(' || ls.code || ')%' COLLATE NOCASE
              )
        `);

        await db.executeSql(`
            UPDATE lorcana_collections
            SET set_code = (
                SELECT UPPER(ls.code)
                FROM lorcana_sets ls
                WHERE ls.set_number = lorcana_collections.set_number
                LIMIT 1
            )
            WHERE name LIKE 'Set: %'
              AND (set_code IS NULL OR TRIM(set_code) = '')
              AND set_number IS NOT NULL
              AND set_number > 0
              AND EXISTS (
                  SELECT 1
                  FROM lorcana_sets ls
                  WHERE ls.set_number = lorcana_collections.set_number
              )
        `);

        await db.executeSql(`
            UPDATE lorcana_collections
            SET set_code = (
                SELECT UPPER(ls.code)
                FROM lorcana_sets ls
                WHERE ls.name = TRIM(REPLACE(lorcana_collections.name, 'Set: ', '')) COLLATE NOCASE
                LIMIT 1
            )
            WHERE name LIKE 'Set: %'
              AND (set_code IS NULL OR TRIM(set_code) = '')
              AND EXISTS (
                  SELECT 1
                  FROM lorcana_sets ls
                  WHERE ls.name = TRIM(REPLACE(lorcana_collections.name, 'Set: ', '')) COLLATE NOCASE
              )
        `);

        const [collectionsWithSetCodes] = await db.executeSql(`
            SELECT id, set_code
            FROM lorcana_collections
            WHERE name LIKE 'Set: %'
              AND set_code IS NOT NULL
              AND TRIM(set_code) <> ''
        `);

        let normalizedSetCodes = 0;
        for (let i = 0; i < collectionsWithSetCodes.rows.length; i++) {
            const row = collectionsWithSetCodes.rows.item(i);
            const normalizedSetCode = getNormalizedSetCode(row.set_code);
            if (normalizedSetCode !== String(row.set_code).trim().toUpperCase()) {
                await db.executeSql(
                    'UPDATE lorcana_collections SET set_code = ? WHERE id = ?',
                    [normalizedSetCode, row.id]
                );
                normalizedSetCodes++;
            }
        }

        await db.executeSql(`
            UPDATE lorcana_collections
            SET set_number = (
                SELECT ls.set_number
                FROM lorcana_sets ls
                WHERE UPPER(ls.code) = UPPER(lorcana_collections.set_code)
                LIMIT 1
            )
            WHERE name LIKE 'Set: %'
              AND set_code IS NOT NULL
              AND TRIM(set_code) <> ''
              AND EXISTS (
                  SELECT 1
                  FROM lorcana_sets ls
                  WHERE UPPER(ls.code) = UPPER(lorcana_collections.set_code)
              )
        `);

        const [resolvedCountResult] = await db.executeSql(`
            SELECT COUNT(*) AS count
            FROM lorcana_collections
            WHERE name LIKE 'Set: %'
              AND set_code IS NOT NULL
              AND TRIM(set_code) <> ''
        `);
        const [unresolvedCountResult] = await db.executeSql(`
            SELECT COUNT(*) AS count
            FROM lorcana_collections
            WHERE name LIKE 'Set: %'
              AND (set_code IS NULL OR TRIM(set_code) = '')
        `);

        console.log(
            `[LorcanaService] Collection set_code backfill complete: resolved ${resolvedCountResult.rows.item(0).count}, unresolved ${unresolvedCountResult.rows.item(0).count}, normalized ${normalizedSetCodes}`
        );
    } catch (error) {
        console.error('[LorcanaService] Error backfilling collection set_code values:', error);
    }
};

const updateSetImportMetadata = async (
    setCode: string,
    dbConnection?: SQLiteDatabase,
    importedAt?: string
): Promise<number> => {
    const db = dbConnection ?? await getDB();
    const normalizedSetCode = getNormalizedSetCode(setCode);
    const [countResult] = await db.executeSql(
        'SELECT COUNT(*) AS count FROM lorcana_cards WHERE UPPER(Set_ID) = UPPER(?)',
        [normalizedSetCode]
    );
    const totalCardsInDb = Number(countResult.rows.item(0).count) || 0;
    const updatedAt = importedAt || new Date().toISOString();

    await db.executeSql(`
        UPDATE lorcana_sets
        SET total_cards_in_db = ?,
            updated_at = ?,
            last_imported_at = COALESCE(?, last_imported_at)
        WHERE UPPER(code) = UPPER(?)
    `, [
        totalCardsInDb,
        updatedAt,
        importedAt || null,
        normalizedSetCode
    ]);

    return totalCardsInDb;
};

const syncMissingOrIncompleteSets = async (
    onStatusChange?: (status: LorcanaInitializationStatus) => void,
    isFirstLaunch: boolean = false
): Promise<{ didImportCards: boolean; importedSetNames: string[] }> => {
    const db = await getDB();
    const sets = await lorcastAPI.fetchAllSets();
    console.log(`[LorcanaService] Startup sync fetched ${sets.length} set(s) from https://api.lorcast.com/v0/sets`);
    await upsertLorcanaSetMetadata(sets, db);

    const localCardCounts = await getLocalCardCountsBySet(db);
    console.log(`[LorcanaService] Local card count map contains ${localCardCounts.size} set(s)`);
    const setDiagnostics = sets.map((set) => {
        const normalizedSetCode = getNormalizedSetCode(set.code);
        const localCount = localCardCounts.get(normalizedSetCode) || 0;
        const expectedCount = Number(set.card_count) || 0;
        const needsImport = localCount === 0 || (expectedCount > 0 && localCount < expectedCount);

        return {
            setName: set.name,
            apiCode: set.code,
            normalizedSetCode,
            expectedCount,
            localCount,
            needsImport,
            reason: localCount === 0
                ? 'missing locally'
                : expectedCount > 0 && localCount < expectedCount
                    ? 'local count below API count'
                    : 'already complete',
        };
    });
    console.log('[LorcanaService] Startup set diagnostics:', setDiagnostics);

    const setsNeedingImport = sets.filter((set) => {
        const normalizedSetCode = getNormalizedSetCode(set.code);
        const localCount = localCardCounts.get(normalizedSetCode) || 0;
        const expectedCount = Number(set.card_count) || 0;

        return localCount === 0 || (expectedCount > 0 && localCount < expectedCount);
    });

    if (setsNeedingImport.length === 0) {
        console.log('[LorcanaService] No missing or incomplete sets found during startup sync');
        return { didImportCards: false, importedSetNames: [] };
    }

    const importedSetNames: string[] = [];
    console.log(`[LorcanaService] Importing ${setsNeedingImport.length} missing/incomplete set(s)`);

    for (let i = 0; i < setsNeedingImport.length; i++) {
        const set = setsNeedingImport[i];
        const normalizedSetCode = getNormalizedSetCode(set.code);
        const localCountBeforeImport = localCardCounts.get(normalizedSetCode) || 0;
        const expectedCount = Number(set.card_count) || 0;
        reportInitializationStatus(onStatusChange, {
            stage: 'importing',
            message: isFirstLaunch
                ? `Downloading ${set.name} (${i + 1}/${setsNeedingImport.length})...`
                : `Downloading new or incomplete set ${set.name} (${i + 1}/${setsNeedingImport.length})...`,
        });
        console.log(
            `[LorcanaService] Starting startup import for ${set.name} (${set.code}) with local=${localCountBeforeImport}, expected=${expectedCount}, normalized=${normalizedSetCode}`
        );

        try {
            const result = await cardImportService.importSet(set.code);
            const importedAt = new Date().toISOString();
            const totalCardsInDb = await updateSetImportMetadata(set.code, db, importedAt);
            console.log(
                `[LorcanaService] Startup sync complete for ${set.name}: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped, ${totalCardsInDb} cards now in DB`
            );

            if (expectedCount > 0 && totalCardsInDb < expectedCount) {
                console.warn(
                    `[LorcanaService] Set ${set.name} is still incomplete after startup import: local=${totalCardsInDb}, expected=${expectedCount}`
                );
            }

            if (totalCardsInDb === 0) {
                console.warn(
                    `[LorcanaService] Set ${set.name} still has zero cards in DB after startup import attempt`
                );
            }

            if (result.added > 0 || result.updated > 0) {
                importedSetNames.push(set.name);
            } else {
                console.warn(
                    `[LorcanaService] Import for ${set.name} reported no added/updated rows. Result:`,
                    result
                );
            }
        } catch (error) {
            console.error(`[LorcanaService] Failed to import set ${set.name} during startup sync:`, error);
        }
    }

    return {
        didImportCards: importedSetNames.length > 0,
        importedSetNames,
    };
};

// Utility function for standardized error handling
const handleError = (message: string, error: any) => {
    console.error(`[LorcanaService] ${message}:`, error);
    throw error;
};

// Keep getDB export for existing callers, but route through shared access helper.
export const getDB = getLorcanaDatabase;

const verifyAndRepairDatabase = async () => {
    console.log('[LorcanaService] Starting database verification...');
    try {
        const db = await getDB();
        console.log('[LorcanaService] Got database connection for verification');
        
        // Check if tables exist instead of dropping them
        console.log('[LorcanaService] Checking existing tables...');
        const [tablesResult] = await db.executeSql(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND (
                name='lorcana_cards' OR 
                name='lorcana_collections' OR 
                name='lorcana_collection_cards'
            )
        `);
        
        const existingTables = new Set<string>();
        for (let i = 0; i < tablesResult.rows.length; i++) {
            existingTables.add(tablesResult.rows.item(i).name);
        }
        
        console.log(`[LorcanaService] Found ${existingTables.size} Lorcana database tables:`, Array.from(existingTables));
        
        // Only recreate tables if needed
        console.log('[LorcanaService] Ensuring tables are created...');
        await ensureTablesCreated();
        console.log('[LorcanaService] Tables verified/created successfully');

        // Sync set metadata from Lorcast API
        console.log('[LorcanaService] Syncing set metadata from API...');
        await syncLorcanaSetsFromAPI();
        console.log('[LorcanaService] Set metadata synced successfully');

        // Note: Image URL normalization is now handled at runtime via toLorcastLargeJpg()
        // No need to scan and update the entire database on every startup
    } catch (error) {
        console.error('[LorcanaService] Error in verifyAndRepairDatabase:', error);
        if (error instanceof Error) {
            console.error('[LorcanaService] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
        throw error;
    }
};

const ensureTablesCreated = async () => {
    console.log('[LorcanaService] Starting ensureTablesCreated...');
    try {
        const db = await getDB();

        // Create lorcana_collections table
        await db.executeSql(`
            CREATE TABLE IF NOT EXISTS lorcana_collections (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                total_value REAL DEFAULT 0,
                card_count INTEGER DEFAULT 0,
                set_code TEXT,
                set_number INTEGER
            );
        `);

        // Add set_number column if it was missing in an existing DB
        const [colInfo] = await db.executeSql('PRAGMA table_info(lorcana_collections)');
        const colNames = new Set<string>();
        for (let i = 0; i < colInfo.rows.length; i++) {
            colNames.add(colInfo.rows.item(i).name);
        }
        if (!colNames.has('set_code')) {
            await db.executeSql('ALTER TABLE lorcana_collections ADD COLUMN set_code TEXT');
        }
        if (!colNames.has('set_number')) {
            await db.executeSql('ALTER TABLE lorcana_collections ADD COLUMN set_number INTEGER');
        }
        await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_collections_set_code ON lorcana_collections(set_code)');

        console.log('[LorcanaService] Ensured lorcana_collections table exists with set_code and set_number columns.');

        // Create lorcana_collection_cards table (new schema with quantity columns)
        await db.executeSql(`
            CREATE TABLE IF NOT EXISTS lorcana_collection_cards (
                collection_id TEXT NOT NULL,
                card_id TEXT NOT NULL,
                quantity_normal INTEGER DEFAULT 0,
                quantity_foil INTEGER DEFAULT 0,
                added_at TEXT NOT NULL,
                PRIMARY KEY (collection_id, card_id),
                FOREIGN KEY (collection_id) REFERENCES lorcana_collections(id) ON DELETE CASCADE,
                FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
            );
        `);

        // If the table existed but lacked the new quantity columns, add them.
        const [columnsInfo] = await db.executeSql('PRAGMA table_info(lorcana_collection_cards)');
        const existingCols = new Set<string>();
        for (let i = 0; i < columnsInfo.rows.length; i++) {
            existingCols.add(columnsInfo.rows.item(i).name);
        }

        if (!existingCols.has('quantity_normal')) {
            await db.executeSql('ALTER TABLE lorcana_collection_cards ADD COLUMN quantity_normal INTEGER DEFAULT 0');
        }
        if (!existingCols.has('quantity_foil')) {
            await db.executeSql('ALTER TABLE lorcana_collection_cards ADD COLUMN quantity_foil INTEGER DEFAULT 0');
        }

        console.log('[LorcanaService] Ensured lorcana_collection_cards table exists with quantity columns.');

        return true;
    } catch (error) {
        console.error('[LorcanaService] Error in ensureTablesCreated:', error);
        if (error instanceof Error) {
            console.error('[LorcanaService] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
        throw error;
    }
};

const getSetNumberFromIdentifier = (setIdentifier?: string | number | null): number | null => {
    return getLorcanaSetNumberFromIdentifier(setIdentifier);
};

const getSetCodeFromIdentifier = (setIdentifier?: string | number | null): string | null => {
    return getLorcanaSetCodeFromIdentifier(setIdentifier);
};

const mapLorcastSetCodeToSetId = (setCode: string): string | null => {
    return mapLorcastSetCodeToCanonicalSetCode(setCode);
};

const ensureDatabaseReady = async (): Promise<void> => {
    // Use DatabaseInitializer to ensure database is initialized
    await DatabaseInitializer.initializeAllDatabases();

    // Ensure core Lorcana tables are created, in case DatabaseInitializer skipped them
    await ensureTablesCreated();
};

const populateInitialData = async (
    onStatusChange?: (status: LorcanaInitializationStatus) => void
): Promise<{ didImportCards: boolean; importedSetNames: string[] }> => {
    // Check if we need to populate the database with card data
    const db = await getDB();
    const [cardCount] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards');
    const totalCards = cardCount.rows.item(0).count;

    console.log(`[LorcanaService] Found ${totalCards} cards in lorcana_cards table`);

    const isFirstLaunch = totalCards === 0;
    reportInitializationStatus(onStatusChange, {
        stage: 'preparing',
        message: isFirstLaunch
            ? 'Checking Lorcast for sets and cards...'
            : 'Checking for new or incomplete sets...',
    });

    try {
        const result = await syncMissingOrIncompleteSets(onStatusChange, isFirstLaunch);
        const [afterSyncCardCount] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards');
        const totalCardsAfterSync = Number(afterSyncCardCount.rows.item(0).count) || 0;
        console.log(
            `[LorcanaService] Startup sync card totals: before=${totalCards}, after=${totalCardsAfterSync}, firstLaunch=${isFirstLaunch}`
        );

        if (isFirstLaunch && totalCardsAfterSync === 0) {
            throw new Error('No Lorcana cards were imported during first launch');
        }

        if (result.didImportCards) {
            reportInitializationStatus(onStatusChange, {
                stage: 'finalizing',
                message: 'Sets and cards downloaded. Finishing setup...',
            });
        }
        return result;
    } catch (error) {
        console.error('[LorcanaService] Error syncing set data from API:', error);
        if (isFirstLaunch) {
            console.log('[LorcanaService] Initial card import failed during first launch');
            throw error;
        }
    }

    return { didImportCards: false, importedSetNames: [] };
};

const backfillMissingCardColors = async (dbConnection?: SQLiteDatabase): Promise<void> => {
    try {
        if (hasBackfilledMissingColors) {
            return;
        }

        const db = dbConnection ?? await getDB();

        await db.executeSql(`
            UPDATE lorcana_cards AS target
            SET Color = (
                SELECT source.Color
                FROM lorcana_cards AS source
                WHERE source.Set_ID = target.Set_ID
                  AND source.Card_Num = target.Card_Num
                  AND source.Color IS NOT NULL
                  AND TRIM(source.Color) <> ''
                ORDER BY LENGTH(COALESCE(source.Unique_ID, '')) DESC
                LIMIT 1
            )
            WHERE (target.Color IS NULL OR TRIM(target.Color) = '')
              AND target.Set_ID IS NOT NULL
              AND target.Card_Num IS NOT NULL
              AND EXISTS (
                  SELECT 1
                  FROM lorcana_cards AS source
                  WHERE source.Set_ID = target.Set_ID
                    AND source.Card_Num = target.Card_Num
                    AND source.Color IS NOT NULL
                    AND TRIM(source.Color) <> ''
              )
        `);

        const [changesResult] = await db.executeSql('SELECT changes() AS count');
        const updatedCount = Number(changesResult.rows.item(0).count) || 0;
        if (updatedCount > 0) {
            console.log(`[LorcanaService] Backfilled Color for ${updatedCount} legacy card rows`);
        }
        hasBackfilledMissingColors = true;
    } catch (error) {
        console.error('[LorcanaService] Error backfilling missing card colors:', error);
    }
};

const runPostInitializationMaintenance = async (): Promise<void> => {
    // Create and populate tables specific to our implementation
    await populateLorcanaCardPricesTable();
    await createLorcanaPriceHistoryTable();
    await createLorcanaAppSettingsTable();
    await createLorcanaCardApiTimestampsTable();
    await backfillMissingCardColors();

    console.log('[LorcanaService] All tables created, starting JAF → ROJ fix...');

    // Run JAF ➔ ROJ set code fix once
    try {
        await fixJAFtoROJSetIdentifiers();
        console.log('[LorcanaService] JAF → ROJ fix completed');
    } catch (err) {
        console.error('[LorcanaService] Error running JAF ➔ ROJ fix:', err);
    }
};

const scheduleBackgroundTasks = async (): Promise<void> => {
    // Sync set metadata from API so lorcana_sets is always populated on startup
    try {
        console.log('[LorcanaService] Syncing set metadata from API on startup...');
        await syncLorcanaSetsFromAPI();
        console.log('[LorcanaService] Set metadata sync complete');
    } catch (err) {
        console.warn('[LorcanaService] Set metadata sync failed (offline?), continuing:', err);
    }

    // Force creation of set collections after initialization
    try {
        console.log('[LorcanaService] Forcing set collection creation check...');
        const collections = await getLorcanaSetCollections(false);
        console.log(`[LorcanaService] Found/created ${collections.length} set collections after initialization`);
    } catch (err) {
        console.error('[LorcanaService] Error in post-initialization collection check:', err);
    }

    console.log('[LorcanaService] Starting daily price update check...');

    // Check if we need to update prices (run once per day)
    try {
        console.log('[LorcanaService] Getting last price update timestamp...');

        // Get the last update timestamp
        const db = await getDB();
        const [lastUpdateResult] = await db.executeSql(
            `SELECT value FROM lorcana_app_settings WHERE key = 'last_price_update'`
        );

        console.log(`[LorcanaService] Found ${lastUpdateResult.rows.length} price update records`);

        let shouldUpdate = true;
        if (lastUpdateResult.rows.length > 0) {
            const lastUpdate = new Date(lastUpdateResult.rows.item(0).value);
            const now = new Date();
            const oneDayAgo = new Date(now);
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);

            // Only update if it's been more than a day since the last update
            shouldUpdate = lastUpdate < oneDayAgo;
            console.log(`[LorcanaService] Last update: ${lastUpdate.toISOString()}, shouldUpdate: ${shouldUpdate}`);
        }

        if (shouldUpdate) {
            console.log('[LorcanaService] Running daily price update...');

            // Update in the background to not block initialization
            setTimeout(async () => {
                try {
                    console.log('[LorcanaService] Starting background price update...');
                    const result = await updateAllLorcanaPrices();

                    // Update the last update timestamp
                    const timestamp = new Date().toISOString();
                    await db.executeSql(
                        `INSERT OR REPLACE INTO lorcana_app_settings (key, value) VALUES (?, ?)`,
                        ['last_price_update', timestamp]
                    );

                    console.log(`[LorcanaService] Daily price update completed. Updated: ${result.updated}, Skipped: ${result.skipped}`);
                } catch (error) {
                    console.error('[LorcanaService] Error during background price update:', error);
                }
            }, 5000); // Wait 5 seconds after initialization before starting updates
        } else {
            console.log('[LorcanaService] Daily price update already performed recently. Skipping.');
        }
    } catch (error) {
        console.error('[LorcanaService] Error checking for price updates:', error);
    }

    console.log('[LorcanaService] Price update check completed');
};

export const initializeLorcanaDatabase = async (
    onStatusChange?: (status: LorcanaInitializationStatus) => void
): Promise<LorcanaInitializationResult> => {
    // ------------------------------------------------------------------
    // Concurrency guard: if initialization is already complete, or a
    // previous invocation is still in-flight, just wait/return instead of
    // kicking off a brand-new run.  This prevents the "Initializing
    // Lorcana database…" log spam seen in the console.
    // ------------------------------------------------------------------
    

    if (initializationPromise) {
        try {
            return await initializationPromise;
        } catch (err) {
            console.error('[LorcanaService] Previous initialization failed, retrying…');
            // fall through to retry
        }
    }

    initializationPromise = (async () => {
        try {
            console.log('[LorcanaService] Initializing Lorcana database...');
            isInitialized = false;
            reportInitializationStatus(onStatusChange, {
                stage: 'preparing',
                message: 'Preparing card database...',
            });

            await ensureDatabaseReady();
            const initialDataResult = await populateInitialData(onStatusChange);
            await runPostInitializationMaintenance();
            await scheduleBackgroundTasks();

            // The database and tables will be ready after calling initializeAllDatabases
            console.log('[LorcanaService] Lorcana database initialized successfully');
            isInitialized = true;
            reportInitializationStatus(onStatusChange, {
                stage: 'ready',
                message: 'Card database ready.',
            });
            console.log('[LorcanaService] initializeLorcanaDatabase returning true');
            return {
                success: true,
                didImportCards: initialDataResult.didImportCards,
                importedSetNames: initialDataResult.importedSetNames,
            };
        } catch (error) {
            console.error('[LorcanaService] Error initializing Lorcana database:', error);
            if (error instanceof Error) {
                console.error('[LorcanaService] Error details:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
            }
            isInitialized = false;
            return {
                success: false,
                didImportCards: false,
                importedSetNames: [],
            };
        }
    })();

    return initializationPromise!;
};

// Add function to populate the lorcana_card_prices table from existing data
const populateLorcanaCardPricesTable = async () => {
    try {
        console.log('[LorcanaService] Checking lorcana_card_prices table...');
        const db = await getDB();

        // Ensure table and index exist; no explicit sqlite_master existence query needed.
        await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_card_prices (
            card_id TEXT PRIMARY KEY NOT NULL,
            usd TEXT,
            usd_foil TEXT,
            tcgplayer_id TEXT,
            last_updated TEXT,
            FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
        )`);
        await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_card_prices_card_id ON lorcana_card_prices(card_id)');

        // Fast existence check instead of COUNT(*)
        const [existingPriceRows] = await db.executeSql('SELECT 1 FROM lorcana_card_prices LIMIT 1');
        if (existingPriceRows.rows.length > 0) {
            console.log('[LorcanaService] lorcana_card_prices table already populated');
            return;
        }

        console.log('[LorcanaService] Populating lorcana_card_prices table from existing card data...');

        const [insertResult] = await db.executeSql(`
            INSERT OR IGNORE INTO lorcana_card_prices (card_id, usd, usd_foil, last_updated)
            SELECT Unique_ID, price_usd, price_usd_foil, last_updated FROM lorcana_cards
            WHERE Unique_ID IS NOT NULL AND (price_usd IS NOT NULL OR price_usd_foil IS NOT NULL)
        `);

        const insertedRows = typeof insertResult.rowsAffected === 'number' ? insertResult.rowsAffected : 0;
        if (insertedRows > 0) {
            console.log(`[LorcanaService] Successfully populated lorcana_card_prices table with ${insertedRows} entries`);
        } else {
            console.log('[LorcanaService] No legacy price rows found to backfill');
        }
    } catch (error) {
        console.error('[LorcanaService] Error populating lorcana_card_prices table:', error);
    }
};

// Add function to create a lorcana_price_history table
const createLorcanaPriceHistoryTable = async () => {
    try {
        console.log('[LorcanaService] Checking lorcana_price_history table...');
        const db = await getDB();
        
        // First check if the table exists
        const [tableResult] = await db.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='lorcana_price_history'");
        
        if (tableResult.rows.length === 0) {
            console.log('[LorcanaService] lorcana_price_history table not found, creating it...');
            await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                card_id TEXT NOT NULL,
                usd TEXT,
                usd_foil TEXT,
                tcgplayer_id TEXT,
                recorded_at TEXT NOT NULL,
                first_scan INTEGER DEFAULT 0,
                FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
            )`);
            
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_price_history_card_id ON lorcana_price_history(card_id)');
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_price_history_recorded_at ON lorcana_price_history(recorded_at)');
            
            console.log('[LorcanaService] lorcana_price_history table created successfully');
        } else {
            console.log('[LorcanaService] lorcana_price_history table already exists');
            
            // Check if we need to add the first_scan column
            const [columnResult] = await db.executeSql("PRAGMA table_info(lorcana_price_history)");
            
            let hasFirstScanColumn = false;
            for (let i = 0; i < columnResult.rows.length; i++) {
                const column = columnResult.rows.item(i);
                if (column.name === 'first_scan') {
                    hasFirstScanColumn = true;
                    break;
                }
            }
            
            if (!hasFirstScanColumn) {
                console.log('[LorcanaService] Adding first_scan column to lorcana_price_history table');
                await db.executeSql('ALTER TABLE lorcana_price_history ADD COLUMN first_scan INTEGER DEFAULT 0');
                console.log('[LorcanaService] first_scan column added successfully');
            }
        }
    } catch (error) {
        console.error('[LorcanaService] Error creating/updating lorcana_price_history table:', error);
    }
};

// Helper function to get all Lorcana cards from the database
export const getLorcanaCards = async () => {
    try {
        const db = await getDB();
        const [results] = await db.executeSql('SELECT * FROM lorcana_cards;');
        return results.rows.raw();
    } catch (error) {
        return handleError('Error getting Lorcana cards', error);
    }
};

export const setNames = async () => {
    // Make sure the Lorcana database (and its tables) are ready before querying
    if (!isInitialized) {
        await initializeLorcanaDatabase();
    }

    const db = await getDB();
    const [results] = await db.executeSql(`
        SELECT DISTINCT Set_ID, Set_Name 
        FROM lorcana_cards 
        WHERE Set_ID IS NOT NULL AND Set_Name IS NOT NULL
        ORDER BY Set_ID;
    `);
    const sets = results.rows.raw();
    
    // Map the sets to the format expected by SetSelector
    const setOptions = sets.map((set: { Set_ID: string; Set_Name: string }) => ({
        label: set.Set_Name,
        value: set.Set_ID
    })).filter(option => option.label && option.value); // Filter out any null values
    
    Logger.debug("[LorcanaService] Set Options:", setOptions);
    return setOptions;
};

// Helper function to search Lorcana cards by name
export const searchLorcanaCards = async (name: string, subtype?: string | null, setCode?: string | null) => {
    if (!isInitialized) {
        await initializeLorcanaDatabase();
    }
    
    const mainName = name.trim();
    const version = subtype?.trim();
    const setId = setCode?.trim();
    const db = await getDB();
    
    let results;
    let params: any[] = [];
    let addSetIdToQuery = '';
    
    // If we have both name and version, try exact match first
    if (version) {
        const fullName = `${mainName} - ${version}`;
        params = [fullName];
        
        if (setId) {
            addSetIdToQuery = ` AND Set_ID = ?`;
            params.push(setId);
        }
        
        [results] = await db.executeSql(
            `SELECT * FROM lorcana_cards WHERE Name IS NOT NULL AND UPPER(Name) = UPPER(?) ${addSetIdToQuery};`,
            params
        );
        
        // If no results, try matching with fuzzy version match
        if (results.rows.length === 0) {
            params = [mainName, `%${version}%`, `${version}%`, version, version];
            if (setId) {
                addSetIdToQuery = ` AND Set_ID = ?`;
                params.push(setId);
            }
            
            [results] = await db.executeSql(
                `SELECT * FROM lorcana_cards 
                 WHERE Name IS NOT NULL 
                 AND UPPER(SUBSTR(Name, 1, INSTR(Name, " - ") - 1)) = UPPER(?) 
                 AND (
                     UPPER(SUBSTR(Name, INSTR(Name, " - ") + 3)) LIKE UPPER(?)
                     OR UPPER(SUBSTR(Name, INSTR(Name, " - ") + 3)) LIKE UPPER(?)
                     OR UPPER(?) LIKE UPPER(SUBSTR(Name, INSTR(Name, " - ") + 3)) || '%'
                     OR UPPER(SUBSTR(Name, INSTR(Name, " - ") + 3)) LIKE '%' || UPPER(?) || '%'
                 ) ${addSetIdToQuery};`,
                params
            );
        }
    } else {
        // Try matching just the main name
        params = [mainName];
        if (setId) {
            addSetIdToQuery = ` AND Set_ID = ?`;
            params.push(setId);
        }
        
        [results] = await db.executeSql(
            `SELECT * FROM lorcana_cards WHERE Name IS NOT NULL AND UPPER(SUBSTR(Name, 1, INSTR(Name, " - ") - 1)) = UPPER(?) ${addSetIdToQuery};`,
            params
        );
    }
    
    // If still no results, try a more flexible match on the main name
    if (results.rows.length === 0) {
        params = [`%${mainName}%`];
        if (setId) {
            addSetIdToQuery = ` AND Set_ID = ?`;
            params.push(setId);
        }
        
        [results] = await db.executeSql(
            `SELECT * FROM lorcana_cards WHERE Name IS NOT NULL AND UPPER(Name) LIKE UPPER(?) ${addSetIdToQuery};`,
            params
        );
    }
    
    return results.rows.raw();
}

export const searchLorcanaCardsByCollector = async (
    cardNumber: number,
    setNumber?: number | null,
    setCode?: string | null
) => {
    if (!isInitialized) {
        await initializeLorcanaDatabase();
    }

    const normalizedCardNumber = Number(cardNumber);
    if (!Number.isFinite(normalizedCardNumber) || normalizedCardNumber <= 0) {
        return [];
    }

    const explicitSetNumber =
        typeof setNumber === 'number' && Number.isFinite(setNumber) && setNumber > 0
            ? Math.trunc(setNumber)
            : null;
    const normalizedSetCode = setCode?.trim().toUpperCase() || null;
    const derivedSetNumber = explicitSetNumber ?? getSetNumberFromIdentifier(normalizedSetCode);

    const filters: string[] = ['Card_Num = ?'];
    const params: any[] = [Math.trunc(normalizedCardNumber)];
    const setFilters: string[] = [];

    if (derivedSetNumber !== null) {
        setFilters.push('Set_Num = ?');
        params.push(derivedSetNumber);
    }

    if (normalizedSetCode) {
        setFilters.push('UPPER(Set_ID) = UPPER(?)');
        params.push(normalizedSetCode);
    }

    if (setFilters.length > 0) {
        filters.push(`(${setFilters.join(' OR ')})`);
    }

    const db = await getDB();
    const [results] = await db.executeSql(
        `SELECT * FROM lorcana_cards WHERE ${filters.join(' AND ')};`,
        params
    );

    return results.rows.raw();
}

    // Debug function to list all card names
    export const listAllCardNames = async () => {
        try {
            const db = await getDB()
            
            // Check total count
            const [countResults] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards')
            const totalCount = countResults.rows.item(0).count
            console.log(`[LorcanaService] Total cards in database: ${totalCount}`)

        } catch (error) {
            console.error('Error listing card names:', error)
        }
}

export const getLorcanaCardPrice = async (card: { Name: string; Set_Num?: number; Rarity?: string; Card_Num?: number; Unique_ID?: string }) => {
    try {
        return await priceService.getCardPrice(card);
    } catch (error) {
        console.error('[LorcanaService] Error fetching Lorcana card price:', error);
        throw error;
    }
};

// Helper function to debug card data integrity issues
export const debugCardData = (card: any, source: string) => {
    if (!card) {
        console.log(`[LorcanaService] WARNING: Null card object from ${source}`);
        return;
    }

    // Skip debugging for MTG cards
    if ('name' in card && !('Name' in card)) {
        console.log(`[LorcanaService] Received MTG card in ${source}, skipping Lorcana debug checks`);
        return;
    }

    const hasCardNum = card.Card_Num !== undefined;
    const hasUniqueId = Boolean(card.Unique_ID);

    // Only log if we're missing important fields
    if (!hasCardNum || !hasUniqueId) {
        console.log(`[LorcanaService] Incomplete card from ${source}:
            Name: ${card.Name || 'MISSING'}
            Set_Num: ${card.Set_Num !== undefined ? card.Set_Num : 'MISSING'}
            Card_Num: ${card.Card_Num !== undefined ? card.Card_Num : 'MISSING'}
            Rarity: ${card.Rarity || 'MISSING'}
            Unique_ID: ${card.Unique_ID || 'MISSING'}
            Original Object: ${JSON.stringify(card)}
        `);
    }
};

export const removeLorcanaCardFromCollection = async (cardId: string, collectionId: string): Promise<void> => {

    try {
        const db = await getDB();
        await db.executeSql(
            `DELETE FROM lorcana_collection_cards 
             WHERE card_id = ? AND collection_id = ?`,
            [cardId, collectionId]
        );
    } catch (error) {
        console.error('Error removing Lorcana card from collection:', error);
        throw error;
    }
}

// Function to get card with latest price from database
export const getLorcanaCardWithPrice = async (cardId: string) => {
    try {
        const db = await getDB()
        const [results] = await db.executeSql(
            `SELECT * FROM lorcana_cards WHERE Unique_ID = ?;`,
            [cardId]
        )
        
        if (results.rows.length === 0) {
            return null
        }

        const card = results.rows.item(0)
        
        // Get price (will use cached price if available and recent)
        const prices = await getLorcanaCardPrice(card)
        
        return {
            ...card,
            prices,
            collected: Boolean(card.collected)
        }
    } catch (error) {
        console.error('Error getting Lorcana card with price:', error)
        throw error
    }
}

// New function to mark a card as collected
export const markCardAsCollected = async (cardId: string) => {
    try {
        const db = await getDB()
        await db.executeSql(
            'UPDATE lorcana_cards SET collected = 1 WHERE Unique_ID = ?;',
            [cardId]
        )
    } catch (error) {
        console.error('Error marking card as collected:', error)
        throw error
    }
}

// New function to get all collected cards
export const getCollectedCards = async () => {
    try {
        const db = await getDB()
        const [results] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE collected = 1;'
        )
        return results.rows.raw()
    } catch (error) {
        console.error('Error getting collected cards:', error)
        throw error
    }
}

// Function to clear the Lorcana cards table
export const clearLorcanaDatabase = async () => {
    try {
        const db = await getDB();
        await db.executeSql('DELETE FROM lorcana_cards;');
        await db.executeSql('DELETE FROM sqlite_sequence WHERE name="lorcana_cards";'); // Reset autoincrement
        isInitialized = false;
    } catch (error) {
        handleError('Error clearing Lorcana database', error);
    }
};

// Function to force reload all cards
export const reloadLorcanaCards = async () => {
    try {
        // Reset initialization state
        isInitialized = false;
        initializationPromise = null;
        
        // Close existing database connection if any
        if (dbInstance) {
            await dbInstance.close();
            dbInstance = null;
        }
        
        // Verify and repair database structure
        await verifyAndRepairDatabase();
        
        // Initialize database with fresh data
        await initializeLorcanaDatabase();
    } catch (error) {
        console.error('Error reloading Lorcana cards:', error);
        throw error;
    }
};

// Add new functions for set collections
export const getOrCreateLorcanaSetCollection = async (setId: string, setName: string): Promise<string> => {
    try {
        if (!setId || !setName) {
            console.error('[LorcanaService] Invalid set ID or name:', { setId, setName });
            throw new Error('Set ID and name are required');
        }

        const db = await getDB();

        // Ensure tables exist
        await ensureTablesCreated();
        await backfillLorcanaCollectionSetCodes(db);

        // Try to find existing collection
        const normalizedSetCode = getNormalizedSetCode(setId);
        const numericSetNum = getSetNumberFromIdentifier(normalizedSetCode);
        const collectionName = `Set: ${setName}`;
        console.log(`[LorcanaService] Looking for existing collection with set_code "${normalizedSetCode}"`);
        const [existingCollection] = await db.executeSql(
            `SELECT id, set_code, set_number
             FROM lorcana_collections
             WHERE UPPER(set_code) = UPPER(?)`,
            [normalizedSetCode]
        );

        if (existingCollection.rows.length > 0) {
            const existingRow = existingCollection.rows.item(0);
            const collectionId = existingRow.id;
            if (
                String(existingRow.set_code || '').trim().toUpperCase() !== normalizedSetCode ||
                Number(existingRow.set_number || 0) !== Number(numericSetNum || 0)
            ) {
                await db.executeSql(
                    'UPDATE lorcana_collections SET set_code = ?, set_number = ?, updated_at = ? WHERE id = ?',
                    [normalizedSetCode, numericSetNum, new Date().toISOString(), collectionId]
                );
            }
            console.log(`[LorcanaService] Found existing collection: ${collectionId}`);
            return collectionId;
        }
        
        console.log(`[LorcanaService] No existing collection found, creating new one...`);

        // Create new collection
        const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const now = new Date().toISOString();
        const description = `Collection for ${setName} (${normalizedSetCode})`;

        console.log(`[LorcanaService] Inserting collection with:`, {
            id, 
            collectionName, 
            description, 
            normalizedSetCode,
            numericSetNum
        });
        
        await db.executeSql(
            `INSERT INTO lorcana_collections (id, name, description, created_at, updated_at, set_code, set_number)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, collectionName, description, now, now, normalizedSetCode, numericSetNum]
        );

        console.log(`[LorcanaService] Created new collection: ${id}`);

        // Verify the collection was created
        const [verifyCollection] = await db.executeSql(
            'SELECT id FROM lorcana_collections WHERE id = ?',
            [id]
        );

        if (verifyCollection.rows.length === 0) {
            throw new Error('Failed to create collection - verification failed');
        }

        console.log(`[LorcanaService] Collection verified successfully: ${id}`);
        return id;
    } catch (error) {
        console.error('[LorcanaService] Error in getOrCreateLorcanaSetCollection:', error);
        throw error;
    }
};

export const addCardToLorcanaCollection = async (
    cardId: string,
    collectionId: string,
    isFoil: boolean = false,
    quantity: number = 1
): Promise<void> => {
    try {
        if (!cardId || !collectionId) {
            console.error('[LorcanaService] Invalid card ID or collection ID:', { cardId, collectionId });
            throw new Error('Card ID and collection ID are required');
        }

        const db = await getDB();
        const now = new Date().toISOString();

        // Get the card details first
        const [cardDetails] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE Unique_ID = ?',
            [cardId]
        );

        if (cardDetails.rows.length === 0) {
            throw new Error(`Card ${cardId} not found in database`);
        }

        const card = cardDetails.rows.item(0);
        
        // Verify this is a Lorcana card (has Name not name property)
        if (!('Name' in card) || ('name' in card && !('Name' in card))) {
            console.error('[LorcanaService] Attempted to add non-Lorcana card to Lorcana collection:', card);
            throw new Error('Invalid Lorcana card object');
        }

        // Verify the collection exists
        const [collectionExists] = await db.executeSql(
            'SELECT id FROM lorcana_collections WHERE id = ?',
            [collectionId]
        );

        if (collectionExists.rows.length === 0) {
            throw new Error(`Collection ${collectionId} not found`);
        }

        // Fetch current price
        debugCardData(card, 'addCardToLorcanaCollection');
        const prices = await getLorcanaCardPrice({
            Name: card.Name,
            Set_Num: card.Set_Num,
            Card_Num: card.Card_Num,
            Rarity: card.Rarity,
            Unique_ID: card.Unique_ID
        });

        // ---------------------------------------------------------------------
        // Fetch current quantities BEFORE starting the transaction. This avoids
        // relying on tx.executeSql (which has a void return type in typings),
        // eliminating the TypeScript error "Property 'rows' does not exist on
        // type 'Transaction'."
        // ---------------------------------------------------------------------
        const [existingRowResult] = await db.executeSql(
            'SELECT quantity_normal, quantity_foil FROM lorcana_collection_cards WHERE collection_id = ? AND card_id = ?',
            [collectionId, cardId]
        );

        const rowExists = existingRowResult.rows.length > 0;
        const currentNormal = rowExists ? existingRowResult.rows.item(0).quantity_normal || 0 : 0;
        const currentFoil = rowExists ? existingRowResult.rows.item(0).quantity_foil || 0 : 0;

        if (!rowExists) {
            const qNormal = isFoil ? 0 : quantity;
            const qFoil = isFoil ? quantity : 0;
            await db.executeSql(
                `INSERT INTO lorcana_collection_cards (collection_id, card_id, quantity_normal, quantity_foil, added_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [collectionId, cardId, qNormal, qFoil, now]
            );
        } else {
            const newNormal = currentNormal + (isFoil ? 0 : quantity);
            const newFoil = currentFoil + (isFoil ? quantity : 0);
            await db.executeSql(
                `UPDATE lorcana_collection_cards SET quantity_normal = ?, quantity_foil = ?, added_at = ?
                 WHERE collection_id = ? AND card_id = ?`,
                [newNormal, newFoil, now, collectionId, cardId]
            );
        }

        await db.executeSql(
            'UPDATE lorcana_collections SET updated_at = ? WHERE id = ?',
            [now, collectionId]
        );

        await db.executeSql(
            'UPDATE lorcana_cards SET collected = 1, price_usd = ?, price_usd_foil = ?, last_updated = ? WHERE Unique_ID = ?',
            [prices.usd, prices.usd_foil, now, cardId]
        );

        // Verify the card was added
        const [verifyCard] = await db.executeSql(
            'SELECT * FROM lorcana_collection_cards WHERE collection_id = ? AND card_id = ?',
            [collectionId, cardId]
        );

        if (verifyCard.rows.length === 0) {
            throw new Error('Card was not added to collection - verification failed');
        }

        console.log(`[LorcanaService] Successfully added card ${cardId} to collection ${collectionId} with prices:`, prices);
    } catch (error) {
        console.error('[LorcanaService] Error in addCardToLorcanaCollection:', error);
        throw error;
    }
};

// Flag: the per-set collection setup only needs to run once per app session
let setCollectionsBootstrapped = false;

export const getLorcanaSetCollections = async (forceRefresh: boolean = false): Promise<Array<{
    cardCount: number
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
    totalValue: number;
    set_number: number;
}>> => {
    try {
        const db = await getDB();
        // Auto-create/backfill set collections — only needs to run once per session
        if (!setCollectionsBootstrapped) {
            await backfillLorcanaCollectionSetCodes(db);

            // Get distinct sets from cards
            const [distinctSets] = await db.executeSql(
                `SELECT DISTINCT Set_ID, Set_Name, Set_Num FROM lorcana_cards
                 WHERE Set_ID IS NOT NULL AND Set_Name IS NOT NULL
                 ORDER BY Set_Num ASC`
            );

            // Create or update the collection row for each known set
            for (let i = 0; i < distinctSets.rows.length; i++) {
                const row = distinctSets.rows.item(i);
                const setId = row.Set_ID;
                const setName = row.Set_Name;
                const setNum = row.Set_Num;
                const normalizedSetCode = getNormalizedSetCode(setId);

                try {
                    const [existingSetCollection] = await db.executeSql(
                        `SELECT id FROM lorcana_collections WHERE UPPER(set_code) = UPPER(?)`,
                        [normalizedSetCode]
                    );

                    if (existingSetCollection.rows.length === 0) {
                        const collectionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
                        const now = new Date().toISOString();
                        await db.executeSql(
                            `INSERT INTO lorcana_collections (id, name, description, created_at, updated_at, set_code, set_number)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [collectionId, `Set: ${setName}`, `Collection for ${setName} (${normalizedSetCode})`, now, now, normalizedSetCode, setNum]
                        );
                    } else {
                        await db.executeSql(
                            'UPDATE lorcana_collections SET set_code = ?, set_number = ?, updated_at = ? WHERE id = ?',
                            [normalizedSetCode, setNum, new Date().toISOString(), existingSetCollection.rows.item(0).id]
                        );
                    }
                } catch (error) {
                    console.error(`[LorcanaService] Failed to create collection for ${setName}:`, error);
                }
            }

            setCollectionsBootstrapped = true;
        }
        // Use 24 hour cache time 
        // const cacheTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Comment out or remove the price update logic within this function
        /*
        // Get collections that need updating
        const [collectionsToUpdate] = await db.executeSql(`
            SELECT DISTINCT c.id, c.updated_at
            FROM lorcana_collections c
            INNER JOIN lorcana_collection_cards lcc ON c.id = lcc.collection_id
            INNER JOIN lorcana_cards lc ON lcc.card_id = lc.Unique_ID
            WHERE c.name LIKE 'Set: %'
            AND (
                lc.last_updated IS NULL 
                OR lc.last_updated < ?
                OR lc.price_usd IS NULL
                OR (? = 1)
            )
        `, [cacheTime, forceRefresh ? 1 : 0]);

        // Update prices for collections that need it
        for (let i = 0; i < collectionsToUpdate.rows.length; i++) {
            const collection = collectionsToUpdate.rows.item(i);
            const [cardsToUpdate] = await db.executeSql(`
                SELECT lc.*
                FROM lorcana_cards lc
                INNER JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                WHERE lcc.collection_id = ?
                AND (
                    lc.last_updated IS NULL 
                    OR lc.last_updated < ?
                    OR lc.price_usd IS NULL
                )
            `, [collection.id, cacheTime]);

            // Update prices for cards in this collection
            for (let j = 0; j < cardsToUpdate.rows.length; j++) {
                const card = cardsToUpdate.rows.item(j);
                if (card.Name && card.Set_Num && card.Rarity) {
                    // Debug card data
                    debugCardData(card, 'getLorcanaSetCollections price update');
                    
                    const prices = await getLorcanaCardPrice({
                        Name: card.Name,
                        Set_Num: card.Set_Num,
                        Card_Num: card.Card_Num,
                        Rarity: card.Rarity,
                        Unique_ID: card.Unique_ID
                    });
                    
                    await db.executeSql(
                        'UPDATE lorcana_cards SET price_usd = ?, price_usd_foil = ?, last_updated = ? WHERE Unique_ID = ?',
                        [prices.usd, prices.usd_foil, new Date().toISOString(), card.Unique_ID]
                    );
                }
            }
        }
        */

        // Get all collections with their updated stats

        // First check if lorcana_collection_cards table exists
        let collectionCardsTableExists = false;
        try {
            await db.executeSql("SELECT 1 FROM lorcana_collection_cards LIMIT 1");
            collectionCardsTableExists = true;
        } catch {
            // table not yet created — use simplified query below
        }

        const mappedQuery = `
            WITH CollectionStats AS (
                SELECT
                    c.id,
                    c.name,
                    c.description,
                    c.created_at,
                    c.updated_at,
                    COALESCE(cc.collected_count, 0) as collected_cards,
                    COALESCE(
                        (
                            SELECT COALESCE(NULLIF(ls.total_cards_in_db, 0), NULLIF(ls.card_count, 0))
                            FROM lorcana_sets ls
                            WHERE c.set_code IS NOT NULL
                            AND TRIM(c.set_code) <> ''
                            AND UPPER(ls.code) = UPPER(c.set_code)
                            LIMIT 1
                        ),
                        (
                            SELECT COUNT(DISTINCT lc.Unique_ID)
                            FROM lorcana_cards lc
                            WHERE lc.Unique_ID IS NOT NULL
                            AND c.set_code IS NOT NULL
                            AND TRIM(c.set_code) <> ''
                            AND UPPER(lc.Set_ID) = UPPER(c.set_code)
                        ),
                        0
                    ) as total_cards,
                    (
                        SELECT COALESCE(SUM(
                            -- Calculate value for normal cards
                            (COALESCE(lcc.quantity_normal, 0) *
                                CASE
                                    WHEN lc.price_usd IS NOT NULL THEN CAST(lc.price_usd AS FLOAT)
                                    WHEN lc.price_usd_foil IS NOT NULL THEN CAST(lc.price_usd_foil AS FLOAT)
                                    ELSE 0
                                END
                            ) +
                            -- Calculate value for foil cards
                            (COALESCE(lcc.quantity_foil, 0) *
                                CASE
                                    WHEN lc.price_usd_foil IS NOT NULL THEN CAST(lc.price_usd_foil AS FLOAT)
                                    WHEN lc.price_usd IS NOT NULL THEN CAST(lc.price_usd AS FLOAT)
                                    ELSE 0
                                END
                            )
                        ), 0)
                        FROM lorcana_cards lc
                        INNER JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                        WHERE lcc.collection_id = c.id
                    ) as total_value,
                    COALESCE(
                        (
                            SELECT ls.set_number
                            FROM lorcana_sets ls
                            WHERE c.set_code IS NOT NULL
                            AND TRIM(c.set_code) <> ''
                            AND UPPER(ls.code) = UPPER(c.set_code)
                            LIMIT 1
                        ),
                        c.set_number
                    ) as set_number
                FROM lorcana_collections c
                LEFT JOIN (
                    SELECT collection_id, COUNT(*) as collected_count
                    FROM lorcana_collection_cards
                    GROUP BY collection_id
                ) cc ON c.id = cc.collection_id
                WHERE c.name LIKE 'Set: %'
            )
            SELECT
                id,
                name,
                description,
                created_at,
                updated_at,
                collected_cards,
                total_cards,
                total_value,
                set_number,
                CASE
                    WHEN total_cards > 0 THEN (CAST(collected_cards AS FLOAT) / total_cards) * 100
                    ELSE 0
                END as completion_percentage
            FROM CollectionStats
            ORDER BY set_number ASC, name ASC
        `;

        const simplifiedQuery = `
            SELECT
                c.id,
                c.name,
                c.description,
                c.created_at,
                c.updated_at,
                0 as collected_cards,
                COALESCE(
                    (
                        SELECT COALESCE(NULLIF(ls.total_cards_in_db, 0), NULLIF(ls.card_count, 0))
                        FROM lorcana_sets ls
                        WHERE c.set_code IS NOT NULL
                        AND TRIM(c.set_code) <> ''
                        AND UPPER(ls.code) = UPPER(c.set_code)
                        LIMIT 1
                    ),
                    (
                        SELECT COUNT(DISTINCT lc.Unique_ID)
                        FROM lorcana_cards lc
                        WHERE lc.Unique_ID IS NOT NULL
                        AND c.set_code IS NOT NULL
                        AND TRIM(c.set_code) <> ''
                        AND UPPER(lc.Set_ID) = UPPER(c.set_code)
                    ),
                    0
                ) as total_cards,
                0 as total_value,
                COALESCE(
                    (
                        SELECT ls.set_number
                        FROM lorcana_sets ls
                        WHERE c.set_code IS NOT NULL
                        AND TRIM(c.set_code) <> ''
                        AND UPPER(ls.code) = UPPER(c.set_code)
                        LIMIT 1
                    ),
                    c.set_number
                ) as set_number,
                0 as completion_percentage
            FROM lorcana_collections c
            WHERE c.name LIKE 'Set: %'
            ORDER BY set_number ASC, name ASC
        `;

        const collectionStatsQuery = collectionCardsTableExists ? mappedQuery : simplifiedQuery;

        let results;
        try {
            [results] = await db.executeSql(collectionStatsQuery);
        } catch (queryError) {
            console.error('[LorcanaService] Main collection stats query failed:', queryError);
            throw queryError;
        }

        // If for some reason we still have zero collections (e.g. first run
        // where card data arrived a little later), try one more time to create
        // them and re-query.
        // If the main query returns nothing (e.g. bootstrap ran but card data
        // hadn't been imported yet), reset the flag and let the next call retry.
        if (results.rows.length === 0) {
            setCollectionsBootstrapped = false;

            const [distinctAgain] = await db.executeSql(
                `SELECT DISTINCT Set_ID, Set_Name FROM lorcana_cards
                 WHERE Set_ID IS NOT NULL AND Set_Name IS NOT NULL`
            );
            for (let i = 0; i < distinctAgain.rows.length; i++) {
                const row = distinctAgain.rows.item(i);
                await getOrCreateLorcanaSetCollection(row.Set_ID, row.Set_Name);
            }

            [results] = await db.executeSql(collectionStatsQuery);
        }

        return Array.from({length: results.rows.length}, (_, i) => {
            const row = results.rows.item(i);
            return {
                id: row.id,
                name: row.name,
                cardCount: row.total_cards || 0,
                description: row.description,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                totalCards: row.total_cards || 0,
                collectedCards: row.collected_cards || 0,
                completionPercentage: row.completion_percentage || 0,
                totalValue: row.total_value || 0,
                set_number: row.set_number || 0,
            };
        });
    } catch (error) {
        console.error('Error getting Lorcana set collections:', error);
        throw error;
    }
};

// Add this function to check initialization status
export const isLorcanaInitialized = () => isInitialized;

// Add this function to ensure initialization
export const cleanupDuplicateCards = async (): Promise<{ deleted: number; remaining: number }> => {
    try {
        console.log('[LorcanaService] Starting duplicate card cleanup...');

        const db = await getDB();

        // First, get counts before cleanup
        const [beforeResult] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards');
        const totalBefore = beforeResult.rows.item(0).count;

        // Delete cards with numeric Set_ID (old format) or set_ prefixed IDs
        const [deleteResult] = await db.executeSql(
            "DELETE FROM lorcana_cards WHERE Set_ID GLOB '[0-9]*' OR Set_ID LIKE 'set_%'"
        );

        // Reclaim space
        await db.executeSql('VACUUM');

        // Get counts after cleanup
        const [afterResult] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards');
        const totalAfter = afterResult.rows.item(0).count;

        const deleted = totalBefore - totalAfter;

        console.log(`[LorcanaService] Cleanup complete: Deleted ${deleted} duplicate cards, ${totalAfter} cards remaining`);

        return {
            deleted,
            remaining: totalAfter
        };
    } catch (error) {
        console.error('[LorcanaService] Error during duplicate cleanup:', error);
        throw error;
    }
};

export const clearAllLorcanaCards = async (): Promise<{ cleared: number }> => {
    try {
        console.log('[LorcanaService] Starting complete card table clear...');

        const db = await getDB();

        // First, get counts before clearing
        const [beforeResult] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards');
        const totalBefore = beforeResult.rows.item(0).count;

        // Also clear related tables to maintain consistency
        await db.executeSql('DELETE FROM lorcana_collection_cards');
        await db.executeSql('DELETE FROM lorcana_card_prices');

        // Clear the main cards table
        await db.executeSql('DELETE FROM lorcana_cards');

        // Reclaim space
        await db.executeSql('VACUUM');

        console.log(`[LorcanaService] Complete clear finished: Removed ${totalBefore} cards and all related data`);

        return {
            cleared: totalBefore
        };
    } catch (error) {
        console.error('[LorcanaService] Error during complete card clear:', error);
        throw error;
    }
};

export const ensureLorcanaInitialized = async () => {
    try {
        console.log('[LorcanaService] Checking if Lorcana database is initialized...');

        const db = await getDB();

        // Check if tables exist by trying to query them
        try {
            await db.executeSql('SELECT 1 FROM lorcana_cards LIMIT 1');
            console.log('[LorcanaService] Lorcana tables already exist');
            return;
        } catch (error) {
            console.log('[LorcanaService] Lorcana tables do not exist, creating them...');
        }

        // Create tables if they don't exist
        await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Artist TEXT, Body_Text TEXT, Card_Num INTEGER, Classifications TEXT,
            Color TEXT, Cost INTEGER, Date_Added TEXT, Date_Modified TEXT,
            Flavor_Text TEXT, Franchise TEXT, Image TEXT, Inkable INTEGER,
            Lore INTEGER, Name TEXT, Rarity TEXT, Set_ID TEXT, Set_Name TEXT,
            Set_Num INTEGER, Strength INTEGER, Type TEXT, Unique_ID TEXT UNIQUE,
            Willpower INTEGER, price_usd TEXT, price_usd_foil TEXT,
            last_updated TEXT, collected INTEGER DEFAULT 0
        );`);

        await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_collections (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            total_value REAL DEFAULT 0,
            card_count INTEGER DEFAULT 0,
            set_code TEXT,
            set_number INTEGER
        );`);

        await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_collection_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_id TEXT NOT NULL,
            card_id TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            added_at TEXT NOT NULL,
            FOREIGN KEY (collection_id) REFERENCES lorcana_collections(id) ON DELETE CASCADE
        );`);

        await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_card_prices (
            card_id TEXT PRIMARY KEY NOT NULL,
            usd REAL,
            usd_foil REAL,
            tcgplayer_id INTEGER,
            last_updated TEXT NOT NULL,
            FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
        );`);

        await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_name ON lorcana_cards(Name);');
        await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_unique_id ON lorcana_cards(Unique_ID);');
        await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_collection_cards_collection_id ON lorcana_collection_cards(collection_id);');
        await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_collection_cards_card_id ON lorcana_collection_cards(card_id);');

        console.log('[LorcanaService] Lorcana database tables created successfully');
    } catch (error) {
        console.error('[LorcanaService] Error ensuring Lorcana database is initialized:', error);
        throw error;
    }
};

export const updateLorcanaCollectionPrices = async (
    collectionId: string,
    forceRefresh: boolean = false
): Promise<{ updated: number; skipped: number }> => {
    if (!collectionId) {
        console.error('[LorcanaService] Collection ID is required to update prices.');
        return { updated: 0, skipped: 0 };
    }

    try {
        const db = await getDB();
        const cacheTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24-hour cache
        let updatedCount = 0;
        let skippedCount = 0;

        const [cardsInCollection] = await db.executeSql(
            `SELECT lc.* 
             FROM lorcana_cards lc
             JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
             LEFT JOIN lorcana_card_prices lcp ON lc.Unique_ID = lcp.card_id
             WHERE lcc.collection_id = ?
             AND (
                ? = 1 OR -- Parameter for forceRefresh
                lcp.card_id IS NULL OR 
                lcp.last_updated IS NULL OR 
                lcp.last_updated < ?
             )
            `,
            [collectionId, forceRefresh ? 1 : 0, cacheTime]
        );

        if (cardsInCollection.rows.length === 0) {
            console.log(`[LorcanaService] No cards in collection ${collectionId} require price updates.`);
            return { updated: 0, skipped: 0 };
        }

        console.log(`[LorcanaService] Found ${cardsInCollection.rows.length} cards in collection ${collectionId} to update prices for.`);

        for (let i = 0; i < cardsInCollection.rows.length; i++) {
            const card = cardsInCollection.rows.item(i);
            if (card.Name && card.Set_Num !== undefined && card.Rarity) {
                try {
                    debugCardData(card, 'updateLorcanaCollectionPrices');
                    await getLorcanaCardPrice({
                        Name: card.Name,
                        Set_Num: card.Set_Num,
                        Card_Num: card.Card_Num,
                        Rarity: card.Rarity,
                        Unique_ID: card.Unique_ID,
                    });
                    updatedCount++;
                    // Add a small delay to be respectful to the API
                    if ((i + 1) % 5 === 0 && i < cardsInCollection.rows.length -1 ) { // Every 5 cards
                        await new Promise(resolve => setTimeout(resolve, 500)); 
                    }
                } catch (priceError) {
                    console.error(`[LorcanaService] Error updating price for card ${card.Name} (${card.Unique_ID}):`, priceError);
                    skippedCount++;
                }
            } else {
                console.warn(`[LorcanaService] Skipping card due to missing essential data: ${card.Unique_ID}`);
                skippedCount++;
            }
        }

        console.log(`[LorcanaService] Price update for collection ${collectionId} complete. Updated: ${updatedCount}, Skipped: ${skippedCount}`);
        return { updated: updatedCount, skipped: skippedCount };
    } catch (error) {
        console.error(`[LorcanaService] Error updating prices for collection ${collectionId}:`, error);
        return { updated: 0, skipped: 0 };
    }
};    

// Function to get cards from a Lorcana collection
export const getLorcanaCollectionCards = async (collectionId: string, page: number = 1, pageSize: number = 20): Promise<PartialLorcanaCardWithPrice[]> => {
    if (!collectionId) {
        console.error('[LorcanaService] Invalid collectionId provided to getLorcanaCollectionCards');
        return [];
    }

    try {
        const db = await getDB();
        await backfillMissingCardColors(db);
        const offset = (page - 1) * pageSize;

        // First check if the lorcana_card_prices table exists
        const [tableResult] = await db.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='lorcana_card_prices'");
        
        let query = '';
        if (tableResult.rows.length > 0) {
            // If the prices table exists, use the full query with price data
            query = `
                SELECT c.*, cc.quantity_normal, cc.quantity_foil, p.usd, p.usd_foil, p.tcgplayer_id, p.last_updated
                FROM lorcana_cards c
                INNER JOIN lorcana_collection_cards cc ON c.Unique_ID = cc.card_id
                LEFT JOIN lorcana_card_prices p ON c.Unique_ID = p.card_id
                WHERE cc.collection_id = ?
                ORDER BY c.Name
            `;
            
            // Only add LIMIT if pageSize > 0
            if (pageSize > 0) {
                query += ` LIMIT ? OFFSET ?`;
            }
        } else {
            // If the prices table doesn't exist, use a simpler query without joining to the prices table
            console.log('[LorcanaService] lorcana_card_prices table not found, using simpler query');
            query = `
                SELECT c.*, cc.quantity_normal, cc.quantity_foil
                FROM lorcana_cards c
                INNER JOIN lorcana_collection_cards cc ON c.Unique_ID = cc.card_id
                WHERE cc.collection_id = ?
                ORDER BY c.Name
            `;
            
            // Only add LIMIT if pageSize > 0
            if (pageSize > 0) {
                query += ` LIMIT ? OFFSET ?`;
            }
        }

        let results: any;
        if (pageSize > 0) {
            [results] = await db.executeSql(query, [collectionId, pageSize, offset]);
        } else {
            [results] = await db.executeSql(query, [collectionId]);
        }
        
        if (!results || !results.rows) {
            console.error('[LorcanaService] No results returned from getLorcanaCollectionCards query');
            return [];
        }

        const cards: PartialLorcanaCardWithPrice[] = [];
        for (let i = 0; i < results.rows.length; i++) {
            try {
                const item = results.rows.item(i);
                // Ensure we have a valid item with required fields
                if (!item || !item.Unique_ID) {
                    console.warn('[LorcanaService] Invalid card item in results', item);
                    continue;
                }
                
                // Create a card object with necessary safety checks
                const card: PartialLorcanaCardWithPrice = {
                    Unique_ID: item.Unique_ID,
                    Name: item.Name || 'Unknown Card',
                    Set_Name: item.Set_Name || 'Unknown Set',
                    Set_Num: item.Set_Num,
                    Card_Num: item.Card_Num,
                    Rarity: item.Rarity,
                    Color: item.Color,
                    Cost: item.Cost,
                    Strength: item.Strength,
                    Willpower: item.Willpower,
                    Type: item.Type || 'Unknown',
                    Classifications: item.Classifications,
                    Body_Text: item.Body_Text,
                    Flavor_Text: item.Flavor_Text,
                    Image: item.Image,
                    collected: true, // Since it's in a collection, set collected to true
                    // Add price information - either from the joined prices table or from the card itself
                    quantity_normal: item.quantity_normal ?? 0,
                    quantity_foil: item.quantity_foil ?? 0,
                    prices: {
                        usd: item.usd || item.price_usd || null,
                        usd_foil: item.usd_foil || item.price_usd_foil || null,
                        tcgplayer_id: item.tcgplayer_id || null
                    },
                    last_updated: item.last_updated
                };
                cards.push(card);
            } catch (error) {
                console.error('[LorcanaService] Error processing card in getLorcanaCollectionCards:', error);
            }
        }
        
        return cards;
    } catch (error) {
        console.error('[LorcanaService] Error in getLorcanaCollectionCards:', error);
        throw error;
    }
};

// Add function to delete a card from a collection
export const deleteLorcanaCardFromCollection = async (cardId: string, collectionId: string): Promise<void> => {
    try {
        const db = await getDB();
        await db.executeSql(
            'UPDATE lorcana_cards SET collected = 0 WHERE Unique_ID = ?',
            [cardId]
        );
    } catch (error) {
        handleError('Error deleting card from collection', error);
    }
};

// Add this new function to get missing cards for a set
// Helper function to convert text set codes to numeric IDs
const getNumericSetId = (textSetId: string): string => {
    const setNumber = getSetNumberFromIdentifier(textSetId);
    return setNumber !== null ? String(setNumber) : textSetId;
};

export const getLorcanaSetMissingCards = async (setId: string, collectionId: string): Promise<LorcanaCardWithPrice[]> => {
    try {
        const db = await getDB();

        // Convert set identifier to both numeric and text forms for legacy compatibility.
        const numericSetId = getNumericSetId(setId);
        const setNumber = getSetNumberFromIdentifier(setId);
        const setCode = getSetCodeFromIdentifier(setId);

        // Get all cards from the set, and check if they are in the specified collection
        const [results] = await db.executeSql(`
            SELECT lc.*,
                   CASE
                       WHEN lcc.card_id IS NOT NULL THEN 1
                       ELSE 0
                   END as collected,
                   COALESCE(lcc.quantity_normal, 0) as quantity_normal,
                   COALESCE(lcc.quantity_foil, 0) as quantity_foil
            FROM lorcana_cards lc
            LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id AND lcc.collection_id = ?
            WHERE (
                lc.Set_ID = ?
                OR (? IS NOT NULL AND lc.Set_Num = ?)
                OR (? IS NOT NULL AND UPPER(lc.Set_ID) = ?)
            )
            AND lc.Unique_ID IS NOT NULL
            AND lc.Name IS NOT NULL
            ORDER BY lc.Card_Num ASC;
        `, [collectionId, numericSetId, setNumber, setNumber, setCode, setCode]);

        const cards: LorcanaCardWithPrice[] = [];
        for (let i = 0; i < results.rows.length; i++) {
            const card = results.rows.item(i);
            if (card.Unique_ID) {  // Only add cards with a valid Unique_ID
                cards.push({
                    ...card,
                    Unique_ID: card.Unique_ID, // Ensure this is explicitly set
                    prices: {
                        usd: card.price_usd,
                        usd_foil: card.price_usd_foil,
                        tcgplayer_id: null
                    },
                    collected: Boolean(card.collected),
                    quantity_normal: card.quantity_normal || 0,
                    quantity_foil: card.quantity_foil || 0
                });
            }
        }

        return cards;
    } catch (error) {
        console.error('Error getting Lorcana set missing cards:', error);
        throw error;
    }
};

// Add function to delete a Lorcana collection
export const deleteLorcanaCollection = async (collectionId: string): Promise<void> => {
    try {
        const db = await getDB();
        await db.executeSql(
            'DELETE FROM lorcana_collections WHERE id = ?',
            [collectionId]
        );
    } catch (error) {
        console.error('[LorcanaService] Error deleting Lorcana collection:', error);
        throw error;
    }
};

// Function to fetch and store enchanted cards from Lorcast API
export const fetchAndStoreEnchantedCards = async () => {
    try {
        console.log('[EnchantedImport] Fetching enchanted cards from Lorcast API');
        const response = await fetch('https://api.lorcast.com/v0/cards/search?q=rarity:enchanted');
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[EnchantedImport] API returned ${data?.results?.length ?? 0} cards`);
        
        const db = await getDB();

        // Insert cards in batches
        const batchSize = 20;
        for (let i = 0; i < data.results.length; i += batchSize) {
            const batch = data.results.slice(i, Math.min(i + batchSize, data.results.length));
            console.log(`[EnchantedImport] Processing batch ${i / batchSize + 1} – ${batch.length} cards`);
            await db.transaction((tx) => {
                batch.forEach((card: any) => {
                    if (!card || !card.name || !card.set?.code) return;

                    // Prefer canonical set IDs, while remaining forward-compatible with unknown future sets.
                    const setId =
                        mapLorcastSetCodeToSetId(card.set.code) ||
                        getSetCodeFromIdentifier(card.set.id) ||
                        getCanonicalSetCodeForStorage(card.set.code) ||
                        null;
                    if (!setId) {
                        console.log('[EnchantedImport] Skipping card (no setId):', card.name, card.set.code);
                        return;
                    }

                    const setNumber =
                        getSetNumberFromIdentifier(setId) ||
                        getSetNumberFromIdentifier(card.set.id) ||
                        getSetNumberFromIdentifier(card.set.code);
                    const uniqueId = buildLorcanaUniqueId(setId, card.collector_number) || card.id || null;

                    console.log(`[EnchantedImport] Inserting card ${card.name} (#${card.collector_number}) into set ${setId}`);

                    tx.executeSql(
                        `INSERT OR REPLACE INTO lorcana_cards (
                            Artist, Body_Text, Card_Num, Classifications, Color, Cost,
                            Date_Added, Date_Modified, Flavor_Text, Franchise, Image, Inkable,
                            Lore, Name, Rarity, Set_ID, Set_Name, Set_Num, Strength, Type,
                            Unique_ID, Willpower, collected, last_updated, price_usd, price_usd_foil
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            card.illustrators ? card.illustrators[0] : null,
                            card.text || null,
                            parseInt(card.collector_number) || null,
                            card.classifications ? card.classifications.join(', ') : null,
                            buildLorcanaColorString(card),
                            card.cost || null,
                            card.released_at || new Date().toISOString(),
                            new Date().toISOString(),
                            card.flavor_text || null,
                            '',
                            getPreferredLorcastImageUrl(card),
                            card.inkwell ? 1 : 0,
                            card.lore || null,
                            card.name,
                            card.rarity || null,
                            setId,
                            card.set.name || null,
                            setNumber,
                            card.strength || null,
                            card.type?.join(', ') || null,
                            uniqueId,
                            card.willpower || null,
                            0, // collected
                            new Date().toISOString(), // last_updated
                            null, // price_usd
                            card.prices?.usd_foil ? card.prices.usd_foil.toString() : null,
                        ]
                    );
                    console.log('[EnchantedImport] Inserted/updated', card.id);
                });
            });
            console.log('[EnchantedImport] Batch committed');
        }

        console.log('[EnchantedImport] All batches processed');
    } catch (error) {
        console.error('[LorcanaService] Error fetching and storing enchanted cards:', error);
        throw error;
    }
};
// Function to update all card images
export const updateAllCardImages = async (batchSize = 25, startIndex = 0) => {
    try {
        // Get database connection
        const db = await getDB();
        
        // Get all cards that need image URL updates
        const [cardsResult] = await db.executeSql(
            `SELECT Unique_ID, Name, Set_Num, Card_Num, Rarity, Image
             FROM lorcana_cards 
             WHERE Image IS NULL 
                OR Image LIKE '%lorcana-api.com%'  
                OR Image LIKE '%.heif%' 
                OR Image LIKE '%.heic%'
                OR Image LIKE '%image/heif%'
                OR Image LIKE '%image/heic%'
             ORDER BY collected DESC
             LIMIT ? OFFSET ?`,
            [batchSize, startIndex]
        );
        
        const totalCards = cardsResult.rows.length;
        let updatedCount = 0;
        let failedCount = 0;
        
        // Process each card
        for (let i = 0; i < totalCards; i++) {
            const card = cardsResult.rows.item(i);
            
            try {
                // Debug card data
                debugCardData(card, 'updateAllCardImages');
                
                // Attempt to get price and image data
                await getLorcanaCardPrice({
                    Unique_ID: card.Unique_ID,
                    Name: card.Name,
                    Set_Num: card.Set_Num,
                    Card_Num: card.Card_Num,
                    Rarity: card.Rarity
                });
                
                // Check if the image was updated by comparing it with the previous value
                const [updatedCard] = await db.executeSql(
                    'SELECT Image FROM lorcana_cards WHERE Unique_ID = ?',
                    [card.Unique_ID]
                );
                
                const newImage = updatedCard.rows.item(0).Image;
                if (newImage !== card.Image) {
                    updatedCount++;
                }
                
                // Add short delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                failedCount++;
            }
        }
        
        // Return stats
        return {
            processed: totalCards,
            updated: updatedCount,
            failed: failedCount,
            hasMore: totalCards === batchSize // If we got a full batch, there might be more
        };
        
    } catch (error) {
        console.error('[LorcanaService] Error in batch update of card images:', error);
        throw error;
    }
};

 /**
     * Updates all Lorcana card image URLs in the database, converting lorcana-api.com to lorcast.io
     */
    export const updateLorcanaImageUrls = async (): Promise<void> => {
    try {
        const db = await getDB();
        if (!db) {
            console.error('[DatabaseService] Database not initialized for URL updates');
            return;
        }
        
        console.log('[DatabaseService] Checking for and fixing Lorcana image URLs in database...');
        const updatedCount = await updateAllImageUrlsInDatabase(db);
        console.log(`[DatabaseService] Fixed ${updatedCount} Lorcana image URLs in database`);
    } catch (error) {
        console.error('[DatabaseService] Error updating Lorcana image URLs:', error);
    }
}




/**
 * UPDATED: Now uses the new CardImportService
 * Safely refresh all Lorcana cards from Lorcast API
 * This will fetch ALL sets and ALL cards including Enchanted, Epic, and Iconic
 */
export const safeRefreshLorcanaCards = async (): Promise<{ updated: number, added: number }> => {
    try {
        console.log('[LorcanaService] Starting safeRefreshLorcanaCards using force refresh path...');

        const result = await forceRefreshAllLorcanaCards((progress) => {
            console.log(`[LorcanaService] Progress: Set ${progress.currentSet}/${progress.totalSets} - ${progress.setName}: ${progress.processedCards}/${progress.totalCards} cards`);
        });

        isInitialized = true;
        return {
            updated: result.updatedCards,
            added: result.addedCards
        };
    } catch (error) {
        console.error('[LorcanaService] Error in safeRefreshLorcanaCards:', error);
        return handleError('Error safely refreshing Lorcana cards', error);
    }
};

export const forceRefreshAllLorcanaCards = async (
    onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> => {
    console.log('[LorcanaService] Starting force refresh of all Lorcana card data...');
    console.log('[LorcanaService] This will re-pull every set and overwrite existing card fields in lorcana_cards');

    const result = await cardImportService.importAllSets(onProgress);
    const db = await getDB();
    const sets = await lorcastAPI.fetchAllSets();
    const importedAt = new Date().toISOString();

    await upsertLorcanaSetMetadata(sets, db);

    for (const set of sets) {
        try {
            const totalCardsInDb = await updateSetImportMetadata(set.code, db, importedAt);
            console.log(
                `[LorcanaService] Force refresh metadata updated for ${set.name} (${set.code}): ${totalCardsInDb} cards in DB`
            );
        } catch (error) {
            console.error(
                `[LorcanaService] Failed to update force refresh metadata for ${set.name} (${set.code}):`,
                error
            );
        }
    }

    isInitialized = true;
    console.log('[LorcanaService] Force refresh complete:', result.summary);
    return result;
};


/**
 * UPDATED: Now uses the new CardImportService
 * Fetch and import all cards for a specific set including Enchanted, Epic, and Iconic cards
 */
export const getNewSetCards = async (setNumber: number = 10, forceUpdate: boolean = false) => {
    try {
        console.log(`[LorcanaService] Fetching set ${setNumber} cards using new CardImportService...`);

        // Use the new import service to import this specific set
        const result = await cardImportService.importSet(setNumber, (progress) => {
            console.log(`[LorcanaService] Progress: ${progress.processedCards}/${progress.totalCards} cards processed`);
        });

        const summary = `Set ${setNumber} import complete: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped`;
        console.log(`[LorcanaService] ${summary}`);

        return {
            added: result.added,
            existing: 0, // Not tracked in new system
            updated: result.updated,
            skipped: result.skipped,
            cards: [], // Cards not returned to reduce memory usage
            summary
        };
    } catch (error) {
        console.error('[LorcanaService] Error fetching new set cards:', error);
        throw error;
    }
};

/**
 * Fetch a single card by set number and collector number from the Lorcast API
 * This is used to get special/iconic cards that aren't included in the bulk set endpoint
 */
const fetchSingleCardFromLorcast = async (setNumber: number, collectorNumber: number): Promise<any | null> => {
    try {
        const url = `https://api.lorcast.com/v0/cards/${setNumber}/${collectorNumber}`;
        console.log(`[LorcanaService] Fetching single card: set ${setNumber}, number ${collectorNumber}`);

        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`[LorcanaService] Card not found: set ${setNumber}, number ${collectorNumber}`);
                return null;
            }
            throw new Error(`API request failed: ${response.status}`);
        }

        const cardData = await response.json();
        console.log(`[LorcanaService] Successfully fetched card: ${cardData.name} - ${cardData.version}`);
        return cardData;
    } catch (error) {
        console.error(`[LorcanaService] Error fetching card ${setNumber}/${collectorNumber}:`, error);
        return null;
    }
};

export const resolveMissingCardColor = async (card: {
    Unique_ID?: string | null;
    Set_ID?: string | null;
    Set_Num?: number | null;
    Card_Num?: number | null;
    Color?: string | null;
}): Promise<string | null> => {
    try {
        if (typeof card.Color === 'string' && card.Color.trim().length > 0) {
            return card.Color.trim();
        }

        const cardNum = Number(card.Card_Num);
        if (!Number.isFinite(cardNum) || cardNum <= 0) {
            return null;
        }

        const setIdentifier = card.Set_ID ?? card.Set_Num ?? null;
        const setNumber =
            getSetNumberFromIdentifier(setIdentifier) ||
            (typeof card.Set_Num === 'number' ? card.Set_Num : null);

        if (!setNumber) {
            return null;
        }

        const apiCard = await fetchSingleCardFromLorcast(setNumber, cardNum);
        if (!apiCard) {
            return null;
        }

        const resolvedColor = buildLorcanaColorString(apiCard);
        if (!resolvedColor) {
            return null;
        }

        const db = await getDB();
        const canonicalSetCode =
            getSetCodeFromIdentifier(setIdentifier) ||
            (typeof card.Set_ID === 'string' && card.Set_ID.trim().length > 0
                ? card.Set_ID.trim().toUpperCase()
                : null);

        const uniqueId =
            typeof card.Unique_ID === 'string' && card.Unique_ID.trim().length > 0
                ? card.Unique_ID.trim()
                : null;

        await db.executeSql(
            `UPDATE lorcana_cards
             SET Color = ?
             WHERE (Color IS NULL OR TRIM(Color) = '')
               AND Card_Num = ?
               AND (
                   (? IS NOT NULL AND UPPER(Set_ID) = UPPER(?))
                   OR (? IS NOT NULL AND Set_Num = ?)
                   OR (? IS NOT NULL AND Unique_ID = ?)
               )`,
            [
                resolvedColor,
                cardNum,
                canonicalSetCode,
                canonicalSetCode,
                setNumber,
                setNumber,
                uniqueId,
                uniqueId,
            ]
        );

        return resolvedColor;
    } catch (error) {
        console.error('[LorcanaService] Error resolving missing card color:', error);
        return null;
    }
};

/**
 * Fetch and import special/iconic cards (241-242) for sets that have them
 * These cards are not included in the bulk /sets/:id/cards endpoint
 */
export const fetchSpecialIconicCards = async (setNumber: number): Promise<{ added: number, updated: number }> => {
    try {
        console.log(`[LorcanaService] Fetching special iconic cards for set ${setNumber}...`);

        const db = await getDB();
        let addedCount = 0;
        let updatedCount = 0;

        // Iconic cards are numbered 241 and 242 in sets 9 and 10
        const iconicCardNumbers = [241, 242];

        for (const collectorNum of iconicCardNumbers) {
            const apiCard = await fetchSingleCardFromLorcast(setNumber, collectorNum);

            if (!apiCard) {
                console.log(`[LorcanaService] No iconic card found at ${collectorNum} for set ${setNumber}`);
                continue;
            }

            // Get the proper set code from our mapping
            const numericSetCode = apiCard.set.code;
            const properSetCode =
                mapLorcastSetCodeToSetId(numericSetCode) ||
                getSetCodeFromIdentifier(numericSetCode) ||
                getCanonicalSetCodeForStorage(numericSetCode) ||
                String(numericSetCode).trim().toUpperCase();
            const uniqueId =
                buildLorcanaUniqueId(properSetCode, apiCard.collector_number) ||
                `${properSetCode}-${apiCard.collector_number}`;
            const resolvedSetNumber =
                getSetNumberFromIdentifier(properSetCode) ||
                getSetNumberFromIdentifier(numericSetCode);
            const cardNum = Number(apiCard.collector_number);

            // Check if card already exists
            const [existingCard] = await db.executeSql(
                'SELECT Unique_ID FROM lorcana_cards WHERE Unique_ID = ?',
                [uniqueId]
            );

            if (existingCard.rows.length === 0) {
                // Insert new card
                console.log(`[LorcanaService] Adding new iconic card: ${apiCard.name} - ${apiCard.version} (${uniqueId})`);
                await db.executeSql(`
                    INSERT INTO lorcana_cards (
                        Artist, Body_Text, Card_Num, Classifications, Color, Cost,
                        Date_Added, Date_Modified, Flavor_Text, Franchise, Image, Inkable,
                        Lore, Name, Rarity, Set_ID, Set_Name, Set_Num, Strength, Type,
                        Unique_ID, Willpower, collected, last_updated, price_usd, price_usd_foil
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        apiCard.illustrators ? apiCard.illustrators[0] : null,
                        apiCard.text || null,
                        cardNum,
                        apiCard.classifications ? apiCard.classifications.join(', ') : null,
                        buildLorcanaColorString(apiCard),
                        apiCard.cost || null,
                        apiCard.released_at || new Date().toISOString(),
                        apiCard.flavor_text || null,
                        '',
                        getPreferredLorcastImageUrl(apiCard),
                        apiCard.inkwell ? 1 : 0,
                        apiCard.lore || null,
                        `${apiCard.name}${apiCard.version ? ` - ${apiCard.version}` : ''}`,
                        apiCard.rarity || null,
                        properSetCode,
                        apiCard.set.name || null,
                        resolvedSetNumber,
                        apiCard.strength || null,
                        apiCard.type && apiCard.type.length > 0 ? apiCard.type[0] : null,
                        uniqueId,
                        apiCard.willpower || null,
                        0, // collected
                        new Date().toISOString(),
                        apiCard.prices?.usd || null,
                        apiCard.prices?.usd_foil || null
                    ]
                );
                addedCount++;
            } else {
                // Update existing card
                console.log(`[LorcanaService] Updating existing iconic card: ${apiCard.name} - ${apiCard.version} (${uniqueId})`);
                await db.executeSql(`
                    UPDATE lorcana_cards SET
                        Artist = ?, Body_Text = ?, Card_Num = ?, Classifications = ?,
                        Color = ?, Cost = ?, Date_Modified = datetime('now'),
                        Flavor_Text = ?, Image = ?, Inkable = ?, Lore = ?,
                        Name = ?, Rarity = ?, Set_ID = ?, Set_Name = ?,
                        Set_Num = ?, Strength = ?, Type = ?, Willpower = ?,
                        last_updated = datetime('now'), price_usd = ?, price_usd_foil = ?
                    WHERE Unique_ID = ?`,
                    [
                        apiCard.illustrators ? apiCard.illustrators[0] : null,
                        apiCard.text || null,
                        cardNum,
                        apiCard.classifications ? apiCard.classifications.join(', ') : null,
                        buildLorcanaColorString(apiCard),
                        apiCard.cost || null,
                        apiCard.flavor_text || null,
                        getPreferredLorcastImageUrl(apiCard),
                        apiCard.inkwell ? 1 : 0,
                        apiCard.lore || null,
                        `${apiCard.name}${apiCard.version ? ` - ${apiCard.version}` : ''}`,
                        apiCard.rarity || null,
                        properSetCode,
                        apiCard.set.name || null,
                        resolvedSetNumber,
                        apiCard.strength || null,
                        apiCard.type && apiCard.type.length > 0 ? apiCard.type[0] : null,
                        apiCard.willpower || null,
                        apiCard.prices?.usd || null,
                        apiCard.prices?.usd_foil || null,
                        uniqueId
                    ]
                );
                updatedCount++;
            }

            // Update price table
            if ((apiCard.prices?.usd || apiCard.prices?.usd_foil) && uniqueId) {
                await db.executeSql(
                    `INSERT OR REPLACE INTO lorcana_card_prices
                    (card_id, usd, usd_foil, tcgplayer_id, last_updated)
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        uniqueId,
                        apiCard.prices?.usd || null,
                        apiCard.prices?.usd_foil || null,
                        apiCard.tcgplayer_id || null,
                        new Date().toISOString()
                    ]
                );
            }
        }

        console.log(`[LorcanaService] Iconic cards import complete for set ${setNumber}: ${addedCount} added, ${updatedCount} updated`);
        return { added: addedCount, updated: updatedCount };
    } catch (error) {
        console.error(`[LorcanaService] Error fetching iconic cards for set ${setNumber}:`, error);
        throw error;
    }
};

export const fetchCardVersionsByName = async (cardName: string): Promise<LorcanaCardWithPrice[]> => {
    try {
        const db = await getDB();
        const [results] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE Name = ?',
            [cardName]
        );
        
        const versions: LorcanaCardWithPrice[] = [];
        for (let i = 0; i < results.rows.length; i++) {
            const card = results.rows.item(i);
            
            // Fetch price data if available
            try {
                const priceData = await getLorcanaCardPrice(card);
                versions.push({
                    ...card,
                    prices: priceData || null,
                    collected: !!card.collected
                });
            } catch (error) {
                // If price fetch fails, still include the card without price data
                console.warn(`[LorcanaService] Failed to fetch price for card version ${card.Name} (${card.Unique_ID}):`, error);
                versions.push({
                    ...card,
                    prices: null,
                    collected: !!card.collected
                });
            }
        }
        
        return versions;
    } catch (error) {
        handleError(`Failed to fetch card versions for "${cardName}"`, error);
        return [];
    }
};

// Function to specifically fix cards with "Name - undefined" issue
export const fixCardNames = async (): Promise<number> => {
    try {
        const db = await getDB();
        let fixedCount = 0;

        // Find all cards with "Name - undefined" in their name
        const [results] = await db.executeSql(
            "SELECT * FROM lorcana_cards WHERE Name LIKE '% - undefined'",
            []
        );

        if (results.rows.length === 0) {
            console.log('No cards with "Name - undefined" found in the database.');
            return 0;
        }

        console.log(`Found ${results.rows.length} cards with "Name - undefined" to fix.`);

        // Fix each card by removing the " - undefined" part
        for (let i = 0; i < results.rows.length; i++) {
            const card = results.rows.item(i);
            const fixedName = card.Name.replace(' - undefined', '');
            await db.executeSql(
                'UPDATE lorcana_cards SET Name = ? WHERE Unique_ID = ?',
                [fixedName, card.Unique_ID]
            );
            fixedCount++;
        }

        console.log(`Fixed ${fixedCount} card names.`);
        return fixedCount;
    } catch (error) {
        return handleError('Error fixing card names', error);
    }
};

/**
 * Checks if a Lorcana card is in a specific set collection
 * @param cardId The Unique_ID of the Lorcana card to check
 * @param setId The Set_ID to check against
 * @returns Promise resolving to {isInCollection: boolean, setName: string} with the collection check result and actual set name
 */
export const isLorcanaCardInSetCollection = async (cardId: string, setId: string): Promise<{isInCollection: boolean, setName: string}> => {
    try {
        if (!cardId || !setId) {
            console.error('[LorcanaService] Invalid card ID or set ID:', { cardId, setId });
            return {isInCollection: false, setName: setId};
        }

        console.log('[LorcanaService] Checking if card is in collection:', { cardId, setId });
        const db = await getDB();
        await backfillLorcanaCollectionSetCodes(db);
        const normalizedSetCode = getNormalizedSetCode(setId);
        
        // First get the collection ID for this set
        console.log('[LorcanaService] Searching for collection with set_code:', normalizedSetCode);
        const [collectionResult] = await db.executeSql(
            `SELECT id, name
             FROM lorcana_collections
             WHERE UPPER(set_code) = UPPER(?)`,
            [normalizedSetCode]
        );
        
        console.log('[LorcanaService] Collection search found:', collectionResult.rows.length, 'results');
        
        // If we couldn't find the collection, the card can't be in it
        if (collectionResult.rows.length === 0) {
            console.log('[LorcanaService] Collection not found');
            
            // Try to find by different naming pattern
            console.log('[LorcanaService] Trying alternative collection naming patterns...');
            const [altCollectionResult] = await db.executeSql(
                "SELECT id, name FROM lorcana_collections WHERE name LIKE ?",
                [`%${setId}%`]
            );
            
            let setName = setId;
            
            if (altCollectionResult.rows.length > 0) {
                console.log('[LorcanaService] Found possible matching collections:');
                for (let i = 0; i < altCollectionResult.rows.length; i++) {
                    const row = altCollectionResult.rows.item(i);
                    console.log(`- ${row.id}: ${row.name}`);
                    
                    // Extract the set name from "Set: [SetName]" format if possible
                    if (row.name.startsWith('Set: ')) {
                        setName = row.name.substring(5);
                    }
                }
            }
            
            return {isInCollection: false, setName};
        }
        
        const collectionId = collectionResult.rows.item(0).id;
        console.log('[LorcanaService] Found collection ID:', collectionId);
        
        // Extract the set name from collection name (usually in "Set: [SetName]" format)
        let setName = setId;
        const collectionName = collectionResult.rows.item(0).name;
        if (collectionName && collectionName.startsWith('Set: ')) {
            setName = collectionName.substring(5);
        }
        
        // Check if the card exists in the collection
        console.log('[LorcanaService] Checking if card exists in collection:', { collectionId, cardId });
        const [cardResult] = await db.executeSql(
            "SELECT * FROM lorcana_collection_cards WHERE collection_id = ? AND card_id = ?",
            [collectionId, cardId]
        );
        
        console.log('[LorcanaService] Card search found:', cardResult.rows.length, 'results');
        
        // If we found at least one row, the card is in the collection
        const isInCollection = cardResult.rows.length > 0;
        
        return {isInCollection, setName};
    } catch (error) {
        console.error('[LorcanaService] Error checking if Lorcana card is in set collection:', error);
        return {isInCollection: false, setName: setId};
    }
};

/**
 * Downloads and adds the newest set cards to the database
 * @param forceUpdate If true, will update existing cards with the latest data
 * @returns Summary of the operation
 */
export const downloadLatestSetCards = async (forceUpdate: boolean = false) => {
    try {
        await ensureLorcanaInitialized();
        console.log(`[LorcanaService] Starting download of latest set cards (forceUpdate: ${forceUpdate})`);

        // Download both sets 9 (Fabled) and 10 (Whispers in the Well) to ensure completeness
        const setsToDownload = [9, 10];
        let totalAdded = 0;
        let totalExisting = 0;
        let totalUpdated = 0;
        let totalSkipped = 0;
        let totalProcessed = 0;

        for (const setNumber of setsToDownload) {
            console.log(`[LorcanaService] Downloading set ${setNumber}...`);
            try {
                const result = await getNewSetCards(setNumber, forceUpdate); // Don't fetch iconic cards here, we'll do it after all sets

                totalAdded += result.added;
                totalExisting += result.existing;
                totalUpdated += result.updated;
                totalSkipped += result.skipped;
                totalProcessed += result.cards.length;

                console.log(`[LorcanaService] Set ${setNumber} download completed:
                - ${result.added} new cards added
                - ${result.existing} cards already in database
                - ${result.updated} cards updated
                - ${result.skipped} cards skipped
                - ${result.cards.length} total cards processed`);
            } catch (setError) {
                console.error(`[LorcanaService] Error downloading set ${setNumber}:`, setError);
                // Continue with other sets even if one fails
            }
        }

        console.log(`[LorcanaService] All set downloads completed successfully:
        - ${totalAdded} new cards added
        - ${totalExisting} cards already in database
        - ${totalUpdated} cards updated
        - ${totalSkipped} cards skipped due to missing data
        - ${totalProcessed} total cards processed
        `);

        // After downloading the new sets, also fetch enchanted cards to ensure we have the latest enchanted versions
        console.log('[LorcanaService] Fetching enchanted cards to ensure completeness...');
        try {
            const enchantedResult = await fetchAndStoreEnchantedCards();
            console.log('[LorcanaService] Enchanted cards fetch completed');
        } catch (enchantedError) {
            console.error('[LorcanaService] Error fetching enchanted cards:', enchantedError);
            // Don't fail the entire operation if enchanted cards fetch fails
        }

        // Also fetch special/iconic cards for sets that have them (sets 9 and 10)
        console.log('[LorcanaService] Fetching special iconic cards for sets 9 and 10...');
        for (const setNum of [9, 10]) {
            try {
                const iconicResult = await fetchSpecialIconicCards(setNum);
                console.log(`[LorcanaService] Iconic cards for set ${setNum}: ${iconicResult.added} added, ${iconicResult.updated} updated`);
            } catch (iconicError) {
                console.error(`[LorcanaService] Error fetching iconic cards for set ${setNum}:`, iconicError);
                // Don't fail the entire operation if iconic cards fetch fails
            }
        }

        // Return user-friendly result object
        return {
            success: true,
            added: totalAdded,
            existing: totalExisting,
            updated: totalUpdated,
            skipped: totalSkipped,
            cards: [], // Array of all cards processed across sets
            message: forceUpdate
                ? `Downloaded latest set data. ${totalAdded} new cards added and ${totalUpdated} cards updated.`
                : `Downloaded latest set data. ${totalAdded} new cards added.`
        };
    } catch (error) {
        console.error('[LorcanaService] Error downloading latest set cards:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            message: 'Failed to download latest set cards. Please try again later.'
        };
    }
};

export const deleteAllSet10Cards = async () => {
    await ensureLorcanaInitialized();
    const db = await getDB();
    await db.executeSql('DELETE FROM lorcana_cards WHERE Set_ID = ?', ['WHI']);
};

/**
 * Fixes incorrectly formatted set IDs and unique IDs for cards
 * @param setCode The numeric set code to fix (e.g., '7')
 * @returns Summary of the operation
 */
export const fixCardSetIdentifiers = async (setCode: string): Promise<{
    updated: number;
    skipped: number;
    message: string;
}> => {
    try {
        await ensureLorcanaInitialized();
        console.log(`[LorcanaService] Starting set identifier fixes for set ${setCode}`);
        
        // Get database connection
        const db = await getDB();
        let updatedCount = 0;
        let skippedCount = 0;
        
        // Map the numeric set code to its text equivalent
        const properSetCode = mapLorcastSetCodeToSetId(setCode) || setCode;
        
        // First find all cards with the numeric set ID
        const [cardsResult] = await db.executeSql(
            'SELECT Unique_ID, Card_Num FROM lorcana_cards WHERE Set_ID = ?',
            [setCode]
        );
        
        console.log(`[LorcanaService] Found ${cardsResult.rows.length} cards with numeric set ID "${setCode}"`);
        
        for (let i = 0; i < cardsResult.rows.length; i++) {
            const card = cardsResult.rows.item(i);
            const oldUniqueId = card.Unique_ID;
            const cardNum = card.Card_Num;
                
                // Skip if card number is invalid
                if (!cardNum) {
                    console.log(`[LorcanaService] Skipping card with invalid card number: ${oldUniqueId}`);
                    skippedCount++;
                    continue;
                }
                
                // Create the new unique ID with the proper set code and padded card number
                const newUniqueId = `${properSetCode}-${String(cardNum).padStart(3, '0')}`;
                
                // Update the card with the new set ID and unique ID
                await db.executeSql(
                    'UPDATE lorcana_cards SET Set_ID = ?, Unique_ID = ? WHERE Unique_ID = ?',
                    [properSetCode, newUniqueId, oldUniqueId]
                );
                
                // Also update any references in the price table
                await db.executeSql(
                    'UPDATE lorcana_card_prices SET card_id = ? WHERE card_id = ?',
                    [newUniqueId, oldUniqueId]
                );
                
                // And update collection references
                await db.executeSql(
                    'UPDATE lorcana_collection_cards SET card_id = ? WHERE card_id = ?',
                    [newUniqueId, oldUniqueId]
                );
                
                console.log(`[LorcanaService] Fixed card identifiers: ${oldUniqueId} -> ${newUniqueId}`);
                updatedCount++;
            }

        const message = `Fixed ${updatedCount} cards with incorrect set identifiers for set ${setCode} (${properSetCode})`;
        console.log(`[LorcanaService] ${message}`);
        
        return {
            updated: updatedCount,
            skipped: skippedCount,
            message
        };
    } catch (error) {
        console.error('[LorcanaService] Error fixing card set identifiers:', error);
        return {
            updated: 0,
            skipped: 0,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
};

/**
 * Fixes all incorrectly formatted set IDs and unique IDs across all sets
 * @returns Summary of the operation
 */
export const fixAllCardSetIdentifiers = async (): Promise<{
    totalUpdated: number;
    totalSkipped: number;
    message: string;
}> => {
    try {
        console.log('[LorcanaService] Starting to fix all card set identifiers');
        
        let totalUpdated = 0;
        let totalSkipped = 0;
        
        // Process each set in our mapping
        for (let i = 1; i <= 7; i++) {
            const setCode = String(i);
            const result = await fixCardSetIdentifiers(setCode);
            
            totalUpdated += result.updated;
            totalSkipped += result.skipped;
        }
        
        const message = `Fixed ${totalUpdated} cards with incorrect set identifiers across all sets`;
        console.log(`[LorcanaService] ${message}`);
        
        return {
            totalUpdated,
            totalSkipped,
            message
        };
    } catch (error) {
        console.error('[LorcanaService] Error fixing all card set identifiers:', error);
        return {
            totalUpdated: 0,
            totalSkipped: 0,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
};

// Interface for price history entry
export interface LorcanaPriceHistoryEntry {
    id: number;
    card_id: string;
    usd: string | null;
    usd_foil: string | null;
    tcgplayer_id: string | null;
    recorded_at: string;
}

// Interface for price history statistics
export interface LorcanaPriceHistoryStats {
    maxPrice: number;
    minPrice: number;
    avgPrice: number;
    priceChange7d: number;
    priceChange30d: number;
    maxFoilPrice: number;
    minFoilPrice: number;
    avgFoilPrice: number;
    foilPriceChange7d: number;
    foilPriceChange30d: number;
}

// Get price history for a card
export const getLorcanaPriceHistory = async (cardId: string): Promise<LorcanaPriceHistoryEntry[]> => {
    if (!cardId) {
        console.error('[LorcanaService] Cannot get price history without card ID');
        return [];
    }
    
    try {
        const db = await getDB();
        const [results] = await db.executeSql(
            `SELECT * FROM lorcana_price_history
             WHERE card_id = ?
             ORDER BY recorded_at DESC
             LIMIT 90`,
            [cardId]
        );
        
        const history: LorcanaPriceHistoryEntry[] = [];
        for (let i = 0; i < results.rows.length; i++) {
            history.push(results.rows.item(i));
        }
        
        return history;
    } catch (error) {
        console.error('[LorcanaService] Error getting price history:', error);
        return [];
    }
};

// Get price statistics for a card
export const getLorcanaPriceHistoryStats = async (cardId: string): Promise<LorcanaPriceHistoryStats> => {
    if (!cardId) {
        console.error('[LorcanaService] Cannot get price statistics without card ID');
        return {
            maxPrice: 0,
            minPrice: 0,
            avgPrice: 0,
            priceChange7d: 0,
            priceChange30d: 0,
            maxFoilPrice: 0,
            minFoilPrice: 0,
            avgFoilPrice: 0,
            foilPriceChange7d: 0,
            foilPriceChange30d: 0
        };
    }
    
    try {
        const db = await getDB();
        
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString();

        // Single query for all aggregate stats (normal + foil)
        const [statsResults] = await db.executeSql(
            `SELECT
                MAX(CASE WHEN usd IS NOT NULL THEN CAST(usd AS REAL) END) as max_price,
                MIN(CASE WHEN usd IS NOT NULL THEN CAST(usd AS REAL) END) as min_price,
                AVG(CASE WHEN usd IS NOT NULL THEN CAST(usd AS REAL) END) as avg_price,
                MAX(CASE WHEN usd_foil IS NOT NULL THEN CAST(usd_foil AS REAL) END) as max_foil_price,
                MIN(CASE WHEN usd_foil IS NOT NULL THEN CAST(usd_foil AS REAL) END) as min_foil_price,
                AVG(CASE WHEN usd_foil IS NOT NULL THEN CAST(usd_foil AS REAL) END) as avg_foil_price
             FROM lorcana_price_history
             WHERE card_id = ?`,
            [cardId]
        );

        // Single query for current price + 7d + 30d historical snapshots
        const [pointInTimeResults] = await db.executeSql(
            `SELECT
                (SELECT usd FROM lorcana_card_prices WHERE card_id = ?) as current_usd,
                (SELECT usd_foil FROM lorcana_card_prices WHERE card_id = ?) as current_usd_foil,
                (SELECT usd FROM lorcana_price_history WHERE card_id = ? AND recorded_at <= ? ORDER BY recorded_at DESC LIMIT 1) as usd_7d,
                (SELECT usd_foil FROM lorcana_price_history WHERE card_id = ? AND recorded_at <= ? ORDER BY recorded_at DESC LIMIT 1) as usd_foil_7d,
                (SELECT usd FROM lorcana_price_history WHERE card_id = ? AND recorded_at <= ? ORDER BY recorded_at DESC LIMIT 1) as usd_30d,
                (SELECT usd_foil FROM lorcana_price_history WHERE card_id = ? AND recorded_at <= ? ORDER BY recorded_at DESC LIMIT 1) as usd_foil_30d`,
            [cardId, cardId, cardId, sevenDaysAgo, cardId, sevenDaysAgo, cardId, thirtyDaysAgo, cardId, thirtyDaysAgo]
        );

        const stats = statsResults.rows.item(0);
        const pit = pointInTimeResults.rows.length > 0 ? pointInTimeResults.rows.item(0) : {} as any;

        const currentPrice = parseFloat(pit.current_usd || '0');
        const currentFoilPrice = parseFloat(pit.current_usd_foil || '0');
        const sevenDayPrice = pit.usd_7d != null ? parseFloat(pit.usd_7d) : currentPrice;
        const sevenDayFoilPrice = pit.usd_foil_7d != null ? parseFloat(pit.usd_foil_7d) : currentFoilPrice;
        const thirtyDayPrice = pit.usd_30d != null ? parseFloat(pit.usd_30d) : currentPrice;
        const thirtyDayFoilPrice = pit.usd_foil_30d != null ? parseFloat(pit.usd_foil_30d) : currentFoilPrice;

        const priceChange7d = sevenDayPrice === 0 ? 0 : ((currentPrice - sevenDayPrice) / sevenDayPrice) * 100;
        const priceChange30d = thirtyDayPrice === 0 ? 0 : ((currentPrice - thirtyDayPrice) / thirtyDayPrice) * 100;
        const foilPriceChange7d = sevenDayFoilPrice === 0 ? 0 : ((currentFoilPrice - sevenDayFoilPrice) / sevenDayFoilPrice) * 100;
        const foilPriceChange30d = thirtyDayFoilPrice === 0 ? 0 : ((currentFoilPrice - thirtyDayFoilPrice) / thirtyDayFoilPrice) * 100;

        return {
            maxPrice: stats.max_price || 0,
            minPrice: stats.min_price || 0,
            avgPrice: stats.avg_price || 0,
            priceChange7d,
            priceChange30d,
            maxFoilPrice: stats.max_foil_price || 0,
            minFoilPrice: stats.min_foil_price || 0,
            avgFoilPrice: stats.avg_foil_price || 0,
            foilPriceChange7d,
            foilPriceChange30d
        };
    } catch (error) {
        console.error('[LorcanaService] Error getting price statistics:', error);
        return {
            maxPrice: 0,
            minPrice: 0,
            avgPrice: 0,
            priceChange7d: 0,
            priceChange30d: 0,
            maxFoilPrice: 0,
            minFoilPrice: 0,
            avgFoilPrice: 0,
            foilPriceChange7d: 0,
            foilPriceChange30d: 0
        };
    }
};

// Function to get cards with significant price changes (movers and shakers)
export const getLorcanaSignificantPriceChanges = async (
    timeframe: '7d' | '30d' = '7d', 
    limit: number = 10,
    minChangePercent: number = 10
): Promise<{card: LorcanaCard, priceChange: number, foilPriceChange: number}[]> => {
    try {
        const db = await getDB();
        
        // Calculate the date threshold
        const now = new Date();
        const daysAgo = timeframe === '7d' ? 7 : 30;
        const thresholdDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000)).toISOString();
        
        // First get all cards that have price history
        const [cardIdsWithHistory] = await db.executeSql(
            `SELECT DISTINCT card_id FROM lorcana_price_history`
        );
        
        // For each card, calculate the price change
        const results: {card: LorcanaCard, priceChange: number, foilPriceChange: number}[] = [];
        
        for (let i = 0; i < cardIdsWithHistory.rows.length; i++) {
            const cardId = cardIdsWithHistory.rows.item(i).card_id;
            
            // Get current price
            const [currentPrice] = await db.executeSql(
                `SELECT usd, usd_foil FROM lorcana_card_prices WHERE card_id = ?`,
                [cardId]
            );
            
            // Get historical price
            const [historicalPrice] = await db.executeSql(
                `SELECT usd, usd_foil 
                 FROM lorcana_price_history 
                 WHERE card_id = ? AND recorded_at <= ?
                 ORDER BY recorded_at DESC
                 LIMIT 1`,
                [cardId, thresholdDate]
            );
            
            if (currentPrice.rows.length > 0 && historicalPrice.rows.length > 0) {
                const current = currentPrice.rows.item(0);
                const historical = historicalPrice.rows.item(0);
                
                const currentUsd = parseFloat(current.usd || '0');
                const historicalUsd = parseFloat(historical.usd || '0');
                
                const currentUsdFoil = parseFloat(current.usd_foil || '0');
                const historicalUsdFoil = parseFloat(historical.usd_foil || '0');
                
                let normalPriceChange = 0;
                if (historicalUsd > 0) {
                    normalPriceChange = ((currentUsd - historicalUsd) / historicalUsd) * 100;
                }
                
                let foilPriceChange = 0;
                if (historicalUsdFoil > 0) {
                    foilPriceChange = ((currentUsdFoil - historicalUsdFoil) / historicalUsdFoil) * 100;
                }
                
                // If either price change exceeds the threshold, include this card
                if (Math.abs(normalPriceChange) >= minChangePercent || Math.abs(foilPriceChange) >= minChangePercent) {
                    // Get the card details
                    const [cardResult] = await db.executeSql(
                        `SELECT * FROM lorcana_cards WHERE Unique_ID = ?`,
                        [cardId]
                    );
                    
                    if (cardResult.rows.length > 0) {
                        results.push({
                            card: cardResult.rows.item(0),
                            priceChange: normalPriceChange,
                            foilPriceChange: foilPriceChange
                        });
                    }
                }
            }
        }
        
        // Sort by absolute price change (descending)
        results.sort((a, b) => {
            const aMaxChange = Math.max(Math.abs(a.priceChange), Math.abs(a.foilPriceChange));
            const bMaxChange = Math.max(Math.abs(b.priceChange), Math.abs(b.foilPriceChange));
            return bMaxChange - aMaxChange;
        });
        
        // Return the top N results
        return results.slice(0, limit);
    } catch (error) {
        console.error('[LorcanaService] Error getting significant price changes:', error);
        return [];
    }
};

// Function to clean up old price history records, keeping first_scan records and recent records
export const cleanupLorcanaPriceHistory = async (daysToKeep: number = 15) => {
    try {
        console.log(`[LorcanaService] Cleaning up lorcana_price_history older than ${daysToKeep} days`);
        const db = await getDB();
        
        // Calculate the cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffDateString = cutoffDate.toISOString();
        
        // Count records before deletion
        const [countBefore] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_price_history');
        const beforeCount = countBefore.rows.item(0).count;
        
        // Delete records older than the cutoff date, but keep first_scan records
        await db.executeSql(
            `DELETE FROM lorcana_price_history 
             WHERE recorded_at < ? 
             AND first_scan = 0`,
            [cutoffDateString]
        );
        
        // Count records after deletion
        const [countAfter] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_price_history');
        const afterCount = countAfter.rows.item(0).count;
        
        console.log(`[LorcanaService] Price history cleanup complete. Removed ${beforeCount - afterCount} records.`);
        return beforeCount - afterCount; // Return the number of records removed
    } catch (error) {
        console.error('[LorcanaService] Error cleaning up price history:', error);
        return 0;
    }
};

// Function to update prices for all cards in collections or watchlists
export const updateAllLorcanaPrices = async (daysThreshold: number = 1): Promise<{ updated: number, skipped: number }> => {
    try {
        console.log('[LorcanaService] Delegating full price refresh to PriceService...');
        return await priceService.updateAllPrices(daysThreshold);
    } catch (error) {
        console.error('[LorcanaService] Error updating all prices:', error);
        return { updated: 0, skipped: 0 };
    }
};

// Add function to create lorcana_app_settings table
const createLorcanaAppSettingsTable = async () => {
    try {
        console.log('[LorcanaService] Checking lorcana_app_settings table...');
        const db = await getDB();
        
        // First check if the table exists
        const [tableResult] = await db.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='lorcana_app_settings'");
        
        if (tableResult.rows.length === 0) {
            console.log('[LorcanaService] lorcana_app_settings table not found, creating it...');
            await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_app_settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT
            )`);
            
            console.log('[LorcanaService] lorcana_app_settings table created successfully');
        } else {
            console.log('[LorcanaService] lorcana_app_settings table already exists');
        }
    } catch (error) {
        console.error('[LorcanaService] Error creating lorcana_app_settings table:', error);
    }
};

const createLorcanaCardApiTimestampsTable = async () => {
    try {
        const db = await getDB();
        await db.executeSql(
            `CREATE TABLE IF NOT EXISTS lorcana_card_api_timestamps (
                card_id TEXT PRIMARY KEY NOT NULL,
                last_fetched_timestamp INTEGER NOT NULL
            )`
        );
    } catch (error) {
        console.error('[LorcanaService] Error creating lorcana_card_api_timestamps table:', error);
    }
};

// ---------------------------------------------------------------------------
// Legacy helper kept for backward-compatibility with initialization routine.
// It now delegates to the generic fixCardSetIdentifiers('4') logic (JAF→ROJ).
// ---------------------------------------------------------------------------
export const fixJAFtoROJSetIdentifiers = async () => {
  try {
    const result = await fixCardSetIdentifiers('8'); // numeric code 8 (old JAF/ROJ set) → ROJ
    return result;
  } catch (err) {
    console.error('[LorcanaService] fixJAFtoROJSetIdentifiers error', err);
    return { updated: 0, skipped: 0, message: 'failed' };
  }
};

export type LorcanaDataIntegrityReport = {
    numericSetIds: number;
    prefixedSetIds: number;
    mismatchedSetNums: number;
    uniqueIdPrefixMismatches: number;
    unresolvedSetCollections: number;
};

export const getLorcanaDataIntegrityReport = async (): Promise<LorcanaDataIntegrityReport> => {
    const db = await getDB();

    const [numericSetIdsResult] = await db.executeSql(
        "SELECT COUNT(*) as count FROM lorcana_cards WHERE Set_ID GLOB '[0-9]*'"
    );
    const [prefixedSetIdsResult] = await db.executeSql(
        "SELECT COUNT(*) as count FROM lorcana_cards WHERE Set_ID LIKE 'set_%'"
    );
    const [mismatchedSetNumsResult] = await db.executeSql(`
        SELECT COUNT(*) as count
        FROM lorcana_cards
        WHERE Set_Num IS NOT NULL
          AND UPPER(Set_ID) IN ('TFC','ROF','INK','URS','SSK','AZS','ARI','ROJ','FAB','WHI')
          AND Set_Num != CASE UPPER(Set_ID)
              WHEN 'TFC' THEN 1
              WHEN 'ROF' THEN 2
              WHEN 'INK' THEN 3
              WHEN 'URS' THEN 4
              WHEN 'SSK' THEN 5
              WHEN 'AZS' THEN 6
              WHEN 'ARI' THEN 7
              WHEN 'ROJ' THEN 8
              WHEN 'FAB' THEN 9
              WHEN 'WHI' THEN 10
          END
    `);
    const [uniqueIdPrefixMismatchResult] = await db.executeSql(`
        SELECT COUNT(*) as count
        FROM lorcana_cards
        WHERE Unique_ID IS NOT NULL
          AND Set_ID IS NOT NULL
          AND INSTR(Unique_ID, '-') > 1
          AND UPPER(SUBSTR(Unique_ID, 1, INSTR(Unique_ID, '-') - 1)) != UPPER(Set_ID)
    `);
    const [unresolvedCollectionsResult] = await db.executeSql(`
        SELECT COUNT(*) as count
        FROM lorcana_collections
        WHERE name LIKE 'Set: %'
          AND (set_number IS NULL OR set_number = 0)
    `);

    return {
        numericSetIds: Number(numericSetIdsResult.rows.item(0).count) || 0,
        prefixedSetIds: Number(prefixedSetIdsResult.rows.item(0).count) || 0,
        mismatchedSetNums: Number(mismatchedSetNumsResult.rows.item(0).count) || 0,
        uniqueIdPrefixMismatches: Number(uniqueIdPrefixMismatchResult.rows.item(0).count) || 0,
        unresolvedSetCollections: Number(unresolvedCollectionsResult.rows.item(0).count) || 0,
    };
};

// ---------------------------------------------------------------------------
// New helper functions for caching Lorcana card API fetch timestamps
// ---------------------------------------------------------------------------
export const getLorcanaCardApiTimestamp = async (cardId: string): Promise<number | null> => {
    try {
        if (!cardId) return null;
        const db = await getDB();
        const [result] = await db.executeSql(
            'SELECT last_fetched_timestamp FROM lorcana_card_api_timestamps WHERE card_id = ?',
            [cardId]
        );
        if (result.rows.length > 0) {
            const ts = result.rows.item(0).last_fetched_timestamp;
            // SQLite may return numbers as strings; coerce to number
            return ts !== null && ts !== undefined ? Number(ts) : null;
        }
        return null;
    } catch (error) {
        console.error('[LorcanaService] Error getting Lorcana card API timestamp:', error);
        return null;
    }
};

export const setLorcanaCardApiTimestamp = async (cardId: string, timestamp: number): Promise<void> => {
    try {
        if (!cardId) return;
        const db = await getDB();
        await db.executeSql(
            `INSERT OR REPLACE INTO lorcana_card_api_timestamps (card_id, last_fetched_timestamp) VALUES (?, ?)`,
            [cardId, timestamp]
        );
    } catch (error) {
        console.error('[LorcanaService] Error setting Lorcana card API timestamp:', error);
    }
};

// ---------------------------------------------------------------------------
// Quantity Management Helper Functions
// ---------------------------------------------------------------------------

/**
 * Updates the quantity of a card in a collection
 * @param cardId - The unique ID of the card
 * @param collectionId - The ID of the collection
 * @param quantityNormal - The new quantity of normal (non-foil) cards
 * @param quantityFoil - The new quantity of foil cards
 */
export const updateLorcanaCardQuantity = async (
    cardId: string,
    collectionId: string,
    quantityNormal: number,
    quantityFoil: number
): Promise<void> => {
    try {
        const db = await getDB();
        const now = new Date().toISOString();

        // Ensure quantities are non-negative
        const normalQty = Math.max(0, quantityNormal);
        const foilQty = Math.max(0, quantityFoil);

        // If both quantities are 0, remove the card from the collection
        if (normalQty === 0 && foilQty === 0) {
            await db.executeSql(
                'DELETE FROM lorcana_collection_cards WHERE card_id = ? AND collection_id = ?',
                [cardId, collectionId]
            );

            // Update collection timestamp
            await db.executeSql(
                'UPDATE lorcana_collections SET updated_at = ? WHERE id = ?',
                [now, collectionId]
            );
            return;
        }

        // Check if the card exists in the collection
        const [result] = await db.executeSql(
            'SELECT * FROM lorcana_collection_cards WHERE card_id = ? AND collection_id = ?',
            [cardId, collectionId]
        );

        if (result.rows.length > 0) {
            // Update existing record
            await db.executeSql(
                `UPDATE lorcana_collection_cards
                 SET quantity_normal = ?, quantity_foil = ?, added_at = ?
                 WHERE card_id = ? AND collection_id = ?`,
                [normalQty, foilQty, now, cardId, collectionId]
            );
        } else {
            // Insert new record
            await db.executeSql(
                `INSERT INTO lorcana_collection_cards (collection_id, card_id, quantity_normal, quantity_foil, added_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [collectionId, cardId, normalQty, foilQty, now]
            );
        }

        // Update collection timestamp
        await db.executeSql(
            'UPDATE lorcana_collections SET updated_at = ? WHERE id = ?',
            [now, collectionId]
        );

        console.log(`[LorcanaService] Updated card ${cardId} quantities in collection ${collectionId}: normal=${normalQty}, foil=${foilQty}`);
    } catch (error) {
        console.error('[LorcanaService] Error updating card quantity:', error);
        throw error;
    }
};

/**
 * Decrements the quantity of a card in a collection
 * @param cardId - The unique ID of the card
 * @param collectionId - The ID of the collection
 * @param quantity - The amount to decrement
 * @param isFoil - Whether to decrement foil or normal quantity
 */
export const decrementLorcanaCardQuantity = async (
    cardId: string,
    collectionId: string,
    quantity: number = 1,
    isFoil: boolean = false
): Promise<void> => {
    try {
        const db = await getDB();

        // Get current quantities
        const [result] = await db.executeSql(
            'SELECT quantity_normal, quantity_foil FROM lorcana_collection_cards WHERE card_id = ? AND collection_id = ?',
            [cardId, collectionId]
        );

        if (result.rows.length === 0) {
            console.warn(`[LorcanaService] Card ${cardId} not found in collection ${collectionId}`);
            return;
        }

        const currentNormal = result.rows.item(0).quantity_normal || 0;
        const currentFoil = result.rows.item(0).quantity_foil || 0;

        // Calculate new quantities
        const newNormal = isFoil ? currentNormal : Math.max(0, currentNormal - quantity);
        const newFoil = isFoil ? Math.max(0, currentFoil - quantity) : currentFoil;

        // Update the quantities
        await updateLorcanaCardQuantity(cardId, collectionId, newNormal, newFoil);

        console.log(`[LorcanaService] Decremented ${isFoil ? 'foil' : 'normal'} quantity for card ${cardId} by ${quantity}`);
    } catch (error) {
        console.error('[LorcanaService] Error decrementing card quantity:', error);
        throw error;
    }
};

/**
 * Gets the current quantities of a card in a collection
 * @param cardId - The unique ID of the card
 * @param collectionId - The ID of the collection
 * @returns Object with quantity_normal and quantity_foil, or null if not found
 */
export const getTopExpensiveOwnedCards = async (limit: number = 10): Promise<PartialLorcanaCardWithPrice[]> => {
    try {
        const db = await getDB();
        const [results] = await db.executeSql(
            `SELECT
                lc.*,
                lcp.usd,
                lcp.usd_foil,
                SUM(lcc.quantity_normal) AS total_normal,
                SUM(lcc.quantity_foil) AS total_foil,
                CAST(COALESCE(lcp.usd, lcp.usd_foil, lc.price_usd, lc.price_usd_foil, '0') AS FLOAT) AS effective_price
            FROM lorcana_collection_cards lcc
            JOIN lorcana_cards lc ON lcc.card_id = lc.Unique_ID
            LEFT JOIN lorcana_card_prices lcp ON lc.Unique_ID = lcp.card_id
            WHERE (COALESCE(lcc.quantity_normal, 0) + COALESCE(lcc.quantity_foil, 0)) > 0
            GROUP BY lc.Unique_ID
            ORDER BY effective_price DESC
            LIMIT ?`,
            [limit]
        );

        const cards: PartialLorcanaCardWithPrice[] = [];
        for (let i = 0; i < results.rows.length; i++) {
            const item = results.rows.item(i);
            cards.push({
                ...item,
                quantity_normal: item.total_normal ?? 0,
                quantity_foil: item.total_foil ?? 0,
                prices: {
                    usd: item.usd || item.price_usd || null,
                    usd_foil: item.usd_foil || item.price_usd_foil || null,
                },
            });
        }
        return cards;
    } catch (error) {
        console.error('[LorcanaService] Error getting top expensive owned cards:', error);
        return [];
    }
};

export const getLorcanaCardQuantity = async (
    cardId: string,
    collectionId: string
): Promise<{ quantity_normal: number; quantity_foil: number } | null> => {
    try {
        const db = await getDB();
        const [result] = await db.executeSql(
            'SELECT quantity_normal, quantity_foil FROM lorcana_collection_cards WHERE card_id = ? AND collection_id = ?',
            [cardId, collectionId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return {
            quantity_normal: result.rows.item(0).quantity_normal || 0,
            quantity_foil: result.rows.item(0).quantity_foil || 0
        };
    } catch (error) {
        console.error('[LorcanaService] Error getting card quantity:', error);
        throw error;
    }
};
