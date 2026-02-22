import { openDatabase, SQLiteDatabase, enablePromise } from 'react-native-sqlite-storage'
import RNFS from 'react-native-fs'
import { updateAllImageUrlsInDatabase } from '../utils/imageUtils'
import { LorcanaCard, LorcanaCardWithPrice, PartialLorcanaCardWithPrice } from '../types/lorcana'
import DatabaseInitializer from './DatabaseInitializer'
import { Logger } from '../utils/logger'
import { cardImportService } from './CardImportService'
import { lorcastAPI } from './LorcastAPIService'

// Enable promise support for SQLite
enablePromise(true)

const LorcanaBulkCardApi = 'https://api.lorcana-api.com/bulk/cards'
const LorcastPriceApi = 'https://api.lorcast.com/v0/cards/search'

// Function to get the latest set API URL dynamically
const getLatestSetApiUrl = (setNumber: number = 10): string => {
    return `https://api.lorcast.com/v0/sets/${setNumber}/cards`;
};

// Function to get set API URL for a specific set
const getSetApiUrl = (setNumber: number): string => {
    return `https://api.lorcast.com/v0/sets/${setNumber}/cards`;
};

let dbInstance: SQLiteDatabase | null = null
let isInitialized = false
let initializationPromise: Promise<boolean> | null = null

// Utility function for standardized error handling
const handleError = (message: string, error: any) => {
    console.error(`[LorcanaService] ${message}:`, error);
    throw error;
};

// Export getDB function
export const getDB = async () => {
    try {
        return await DatabaseInitializer.getDatabase('lorcana');
    } catch (error) {
        console.error('[LorcanaService] Error getting database:', error);
        throw error;
    }
};

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
        
        // Update image URLs
        console.log('[LorcanaService] Updating image URLs...');
        await updateLorcanaImageUrls();
        console.log('[LorcanaService] Image URLs updated successfully');
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
                set_number INTEGER
            );
        `);

        // Add set_number column if it was missing in an existing DB
        const [colInfo] = await db.executeSql('PRAGMA table_info(lorcana_collections)');
        const colNames = new Set<string>();
        for (let i = 0; i < colInfo.rows.length; i++) {
            colNames.add(colInfo.rows.item(i).name);
        }
        if (!colNames.has('set_number')) {
            await db.executeSql('ALTER TABLE lorcana_collections ADD COLUMN set_number INTEGER');
        }

        console.log('[LorcanaService] Ensured lorcana_collections table exists with set_number column.');

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

// Add this mapping function
const mapLorcastSetCodeToSetId = (setCode: string): string | null => {
    const setMapping: { [key: string]: string } = {
        '1': 'TFC',  // The First Chapter
        '2': 'ROF',  // Rise of the Floodborn
        '3': 'INK',  // Into the Inklands
        '4': 'URS',   // Ursula's Return
        '5': 'SSK',   // Shimmering Skies
        '6': 'AZS',   // Azurite Sea
        '7': 'ARI',    // Archazia's Island
        '8': 'ROJ',    // Reign of Jafar
        '9': 'FAB',    // Fabled
        '10': 'WHI',    // Whispers in the Well
    };
    return setMapping[setCode] || null;
};

export const initializeLorcanaDatabase = async (): Promise<boolean> => {
    // ------------------------------------------------------------------
    // Concurrency guard: if initialization is already complete, or a
    // previous invocation is still in-flight, just wait/return instead of
    // kicking off a brand-new run.  This prevents the "Initializing
    // Lorcana database…" log spam seen in the console.
    // ------------------------------------------------------------------
    

    if (initializationPromise) {
        try {
            await initializationPromise;
            return isInitialized;
        } catch (err) {
            console.error('[LorcanaService] Previous initialization failed, retrying…');
            // fall through to retry
        }
    }

    initializationPromise = (async () => {
        try {
            console.log('[LorcanaService] Initializing Lorcana database...');
            isInitialized = false;
            
            // Use DatabaseInitializer to ensure database is initialized
            await DatabaseInitializer.initializeAllDatabases();
            
            // Ensure core Lorcana tables are created, in case DatabaseInitializer skipped them
            await ensureTablesCreated();
            
            // Check if we need to populate the database with card data
            const db = await getDB();
            const [cardCount] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards');
            const totalCards = cardCount.rows.item(0).count;
            
            console.log(`[LorcanaService] Found ${totalCards} cards in lorcana_cards table`);
            
            if (totalCards === 0) {
                console.log('[LorcanaService] No cards found, attempting to load card data...');
                try {
                    // Try to load card data from the bulk API
                    const result = await safeRefreshLorcanaCards();
                    console.log(`[LorcanaService] Loaded ${result.added} new cards and updated ${result.updated} cards from bulk API`);
                } catch (error) {
                    console.error('[LorcanaService] Error loading card data from bulk API:', error);
                    console.log('[LorcanaService] Continuing with empty database - collections will be created when cards are scanned');
                }
            }

            // Create and populate tables specific to our implementation
            await populateLorcanaCardPricesTable();
            await createLorcanaPriceHistoryTable();
            await createLorcanaAppSettingsTable();
            await createLorcanaCardApiTimestampsTable();
            
            console.log('[LorcanaService] All tables created, starting JAF → ROJ fix...');
            
            // Run JAF ➔ ROJ set code fix once (non-blocking)
            try {
                await fixJAFtoROJSetIdentifiers();
                console.log('[LorcanaService] JAF → ROJ fix completed');
            } catch (err) {
                console.error('[LorcanaService] Error running JAF ➔ ROJ fix:', err);
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
            
            // The database and tables will be ready after calling initializeAllDatabases
            console.log('[LorcanaService] Lorcana database initialized successfully');
            isInitialized = true;
            console.log('[LorcanaService] initializeLorcanaDatabase returning true');
            return true;
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
            return false;
        }
    })();

    return initializationPromise!;
};

// Add function to populate the lorcana_card_prices table from existing data
const populateLorcanaCardPricesTable = async () => {
    try {
        console.log('[LorcanaService] Checking lorcana_card_prices table...');
        const db = await getDB();
        
        // First check if the table exists
        const [tableResult] = await db.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='lorcana_card_prices'");
        
        if (tableResult.rows.length === 0) {
            console.log('[LorcanaService] lorcana_card_prices table not found, creating it...');
            await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_card_prices (
                card_id TEXT PRIMARY KEY NOT NULL,
                usd TEXT,
                usd_foil TEXT,
                tcgplayer_id TEXT,
                last_updated TEXT,
                FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
            )`);
            
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_card_prices_card_id ON lorcana_card_prices(card_id)');
        }
        
        // Check if we need to populate the table
        const [countResult] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_card_prices');
        const priceCount = countResult.rows.item(0).count;
        
        // Count cards with price data in the lorcana_cards table
        const [cardCountResult] = await db.executeSql(
            "SELECT COUNT(*) as count FROM lorcana_cards WHERE price_usd IS NOT NULL OR price_usd_foil IS NOT NULL");
        const cardsWithPriceCount = cardCountResult.rows.item(0).count;
        
        console.log(`[LorcanaService] Found ${priceCount} price entries and ${cardsWithPriceCount} cards with price data`);
        
        if (priceCount === 0 && cardsWithPriceCount > 0) {
            console.log('[LorcanaService] Populating lorcana_card_prices table from existing card data...');
            
            // Copy price data from lorcana_cards to lorcana_card_prices
            await db.executeSql(`
                INSERT OR IGNORE INTO lorcana_card_prices (card_id, usd, usd_foil, last_updated)
                SELECT Unique_ID, price_usd, price_usd_foil, last_updated FROM lorcana_cards
                WHERE Unique_ID IS NOT NULL AND (price_usd IS NOT NULL OR price_usd_foil IS NOT NULL)
            `);
            
            // Check if the population was successful
            const [newCountResult] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_card_prices');
            console.log(`[LorcanaService] Successfully populated lorcana_card_prices table with ${newCountResult.rows.item(0).count} entries`);
        } else {
            console.log('[LorcanaService] lorcana_card_prices table already populated or no price data available');
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

const insertTcgplayerId = async (cardId: string, tcgplayerId: string) => {
    try {
        const db = await getDB();
        await db.executeSql(
            'INSERT OR REPLACE INTO lorcana_card_prices (card_id, tcgplayer_id, last_updated) VALUES (?, ?, ?)',    
            [cardId, tcgplayerId, new Date().toISOString()]
        );
    } catch (error) {
        console.error('[LorcanaService] Error inserting TCGPlayer ID:', error);
        throw error;
    }
};

// Function to save price history data
const saveLorcanaPriceHistory = async (
    cardId: string, 
    normalPrice: string | null, 
    foilPrice: string | null,
    tcgplayerId: string | null,
    isFirstScan: boolean = false
) => {
    // Early return if cardId is missing
    if (!cardId) {
        console.log('[LorcanaService] Cannot save price history without card ID');
        return;
    }

    try {
        const db = await getDB();

        // If this is potentially a first scan, validate against existing history
        if (isFirstScan) {
            const [existingRecords] = await db.executeSql(
                'SELECT COUNT(*) as count FROM lorcana_price_history WHERE card_id = ?',
                [cardId]
            );

            if (existingRecords.rows.item(0).count > 0) {
                isFirstScan = false;
            }
        }

        // ************************* NEW DEDUPLICATION LOGIC *************************
        // Avoid saving duplicate entries that have identical prices within the last hour
        const [lastRecordResult] = await db.executeSql(
            `SELECT usd, usd_foil, recorded_at FROM lorcana_price_history 
             WHERE card_id = ? ORDER BY recorded_at DESC LIMIT 1`,
            [cardId]
        );

        if (lastRecordResult.rows.length > 0) {
            const lastRecord = lastRecordResult.rows.item(0);
            const lastRecordedAt = new Date(lastRecord.recorded_at);
            const now = new Date();
            const oneHourMs = 60 * 60 * 1000;

            const pricesUnchanged = lastRecord.usd === normalPrice && lastRecord.usd_foil === foilPrice;
            const withinTimeWindow = now.getTime() - lastRecordedAt.getTime() < oneHourMs;

            if (pricesUnchanged && withinTimeWindow) {
                console.log(`[LorcanaService] Skipping duplicate price history entry for card ID: ${cardId}`);
                return;
            }
        }
        // ***************************************************************************

        const timestamp = new Date().toISOString();

        await db.executeSql(
            `INSERT INTO lorcana_price_history (card_id, usd, usd_foil, tcgplayer_id, recorded_at, first_scan) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cardId, normalPrice, foilPrice, tcgplayerId, timestamp, isFirstScan ? 1 : 0]
        );

        console.log(`[LorcanaService] Price history saved for card ID: ${cardId}${isFirstScan ? ' (first scan)' : ''}`);
    } catch (error) {
        console.error(`[LorcanaService] Error saving price history: ${error}`);
    }
};

// Function to fetch current price for a card
export const getLorcanaCardPrice = async (card: { Name: string; Set_Num?: number; Rarity?: string; Card_Num?: number; Unique_ID?: string }) => {
    try {
        // Log the card details we're searching for
        console.log(`[LorcanaService] Fetching price for card: ${card.Name}, Set_Num: ${card.Set_Num}, Card_Num: ${card.Card_Num}, Rarity: ${card.Rarity}, Unique_ID: ${card.Unique_ID}`);

        const db = await getDB(); // Fetch DB connection once

        // First, check if we have recent price data in the database (within last 24 hours)
        if (card.Unique_ID) {
            try {
                const [existingPrice] = await db.executeSql(
                    `SELECT usd, usd_foil, last_updated FROM lorcana_card_prices
                     WHERE card_id = ? AND last_updated IS NOT NULL`,
                    [card.Unique_ID]
                );

                if (existingPrice.rows.length > 0) {
                    const priceData = existingPrice.rows.item(0);
                    const lastUpdated = new Date(priceData.last_updated);
                    const now = new Date();
                    const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

                    // If price data is less than 24 hours old, return it
                    if (hoursSinceUpdate < 24) {
                        console.log(`[LorcanaService] Using cached price data for card ${card.Unique_ID} (${hoursSinceUpdate.toFixed(1)} hours old)`);
                        return {
                            usd: priceData.usd,
                            usd_foil: priceData.usd_foil,
                            tcgplayer_id: null // We don't store this in the cached version
                        };
                    }
                }
            } catch (error) {
                console.log(`[LorcanaService] Error checking cached prices: ${error}`);
                // Continue to API fetch if database check fails
            }
        }

        // Check if this is a first scan by looking for existing price history
        let isFirstScan = false;
        if (card.Unique_ID) {
            try {
                // const db = await getDB(); // Removed
                const [existingHistory] = await db.executeSql(
                    'SELECT COUNT(*) as count FROM lorcana_price_history WHERE card_id = ?', 
                    [card.Unique_ID]
                );
                
                isFirstScan = existingHistory.rows.item(0).count === 0;
                console.log(`[LorcanaService] Card ID ${card.Unique_ID} first scan: ${isFirstScan}`);
            } catch (error) {
                console.error('[LorcanaService] Error checking for existing price history:', error);
            }
        }
        
        // First try using Unique_ID if available (prioritize this for enchanted cards)
        const isEnchanted = card.Rarity === 'Enchanted';
        
        if (card.Unique_ID && isEnchanted) {
            const enchantedUrl = `https://api.lorcast.com/v0/cards/${card.Unique_ID}`;
            console.log(`[LorcanaService] Trying unique ID search: ${enchantedUrl}`);
            
            try {
                const enchantedResponse = await fetch(enchantedUrl);
                
                if (enchantedResponse.ok) {
                    const enchantedData = await enchantedResponse.json();
                    console.log(`[LorcanaService] Unique ID search successful:`, enchantedData?.name || 'No name');
                    
                    if (enchantedData) {
                        // Check if we have an image_uris object with a digital.normal URL
                        if (enchantedData.image_uris?.digital?.normal && card.Unique_ID) {
                            await updateCardImageUrl(card.Unique_ID, enchantedData.image_uris.digital.normal);
                        }
                        
                        // For enchanted cards, which only come in foil, use the foil price as the regular price too
                        const foilPrice = enchantedData.prices?.usd_foil || enchantedData.prices?.foil || null;
                        const normalPrice = isEnchanted ? foilPrice : (enchantedData.prices?.regular || enchantedData.prices?.usd || null);
                        
                        // Save the price data to the lorcana_card_prices table if we have a Unique_ID
                        if (card.Unique_ID) {
                            try {
                                // const db = await getDB(); // Removed
                                await db.executeSql(
                                    `INSERT OR REPLACE INTO lorcana_card_prices (card_id, usd, usd_foil, tcgplayer_id, last_updated) 
                                     VALUES (?, ?, ?, ?, ?)`,
                                    [
                                        card.Unique_ID,
                                        normalPrice,
                                        foilPrice,
                                        enchantedData.tcgplayer_id || null,
                                        new Date().toISOString()
                                    ]
                                );
                                console.log(`[LorcanaService] Price data saved to database for card ID: ${card.Unique_ID}`);
                                
                                // Save price history
                                await saveLorcanaPriceHistory(
                                    card.Unique_ID,
                                    normalPrice,
                                    foilPrice,
                                    enchantedData.tcgplayer_id || null,
                                    isFirstScan
                                );
                            } catch (err) {
                                console.error(`[LorcanaService] Error saving price data to database: ${err}`);
                            }
                        }
                        
                        return {
                            usd: normalPrice,
                            usd_foil: foilPrice,
                            tcgplayer_id: enchantedData.tcgplayer_id || null
                        };
                    }
                } else {
                    console.log(`[LorcanaService] Unique ID search failed with status: ${enchantedResponse.status}`);
                }
            } catch (error) {
                console.log(`[LorcanaService] Error during unique ID search:`, error);
                // Continue to next method
            }
        }
        
        // Next, check if we have both Set_Num and Card_Num to use the direct endpoint
        if (card.Set_Num !== undefined && card.Card_Num !== undefined) {
            // Use the direct card retrieval endpoint
            const directUrl = `https://api.lorcast.com/v0/cards/${card.Set_Num}/${card.Card_Num}`;
            console.log(`[LorcanaService] Trying set/number search: ${directUrl}`);
            
            try {
                const response = await fetch(directUrl);
                
                if (response.ok) {
                    const cardData = await response.json();
                    console.log(`[LorcanaService] Set/number search successful:`, cardData?.name || 'No name');
                    
                    if (cardData) {
                        // Check if we have an image_uris object with a digital.normal URL
                        if (cardData.image_uris?.digital?.normal && card.Unique_ID) {
                            await updateCardImageUrl(card.Unique_ID, cardData.image_uris.digital.normal);
                        }
                        
                        
                        // For enchanted cards, which only come in foil, use the foil price as the regular price too
                        const foilPrice = cardData.prices?.usd_foil || cardData.prices?.foil || null;
                        const normalPrice = isEnchanted ? foilPrice : (cardData.prices?.regular || cardData.prices?.usd || null);
                        
                        // Save the price data to the lorcana_card_prices table if we have a Unique_ID
                        if (card.Unique_ID) {
                            try {
                                // const db = await getDB(); // Removed
                                await db.executeSql(
                                    `INSERT OR REPLACE INTO lorcana_card_prices (card_id, usd, usd_foil, tcgplayer_id, last_updated) 
                                     VALUES (?, ?, ?, ?, ?)`,
                                    [
                                        card.Unique_ID,
                                        normalPrice,
                                        foilPrice,
                                        cardData.tcgplayer_id || null,
                                        new Date().toISOString()
                                    ]
                                );
                                console.log(`[LorcanaService] Price data saved to database for card ID: ${card.Unique_ID} (set/number search)`);
                                
                                // Save price history
                                await saveLorcanaPriceHistory(
                                    card.Unique_ID,
                                    normalPrice,
                                    foilPrice,
                                    cardData.tcgplayer_id || null,
                                    isFirstScan
                                );
                            } catch (err) {
                                console.error(`[LorcanaService] Error saving price data to database (set/number search): ${err}`);
                            }
                        }
                        
                        return {
                            usd: normalPrice,
                            usd_foil: foilPrice,
                            tcgplayer_id: cardData.tcgplayer_id || null
                        };
                    }
                } else {
                    console.log(`[LorcanaService] Set/number search failed with status: ${response.status}`);
                }
            } catch (error) {
                console.log(`[LorcanaService] Error during set/number search:`, error);
                // Continue to fallback search
            }
        }
        
        // Fall back to search approach if both direct methods fail
        console.log(`[LorcanaService] Direct lookup methods failed, falling back to search API`);
        const searchResult = await getLorcanaCardPriceBySearch(card);
        
        // Try to update the image URL from the search result if available
        if (card.Unique_ID && searchResult?.searchResponse?.results?.length > 0) {
            const foundCard = searchResult.searchResponse.results[0];
            if (foundCard.image_uris?.digital?.normal) {
                await updateCardImageUrl(card.Unique_ID, foundCard.image_uris.digital.normal);
            }
        }
        
        // Save price history for results from the search method too
        if (card.Unique_ID && searchResult?.usd !== undefined) {
            await saveLorcanaPriceHistory(
                card.Unique_ID,
                searchResult.usd,
                searchResult.usd_foil,
                searchResult.tcgplayer_id,
                isFirstScan
            );
        }
        
        // Return only the price data to maintain backward compatibility
        const { searchResponse, ...priceData } = searchResult;
        return priceData;
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
    
    const hasName = Boolean(card.Name);
    const hasSetNum = card.Set_Num !== undefined;
    const hasCardNum = card.Card_Num !== undefined;
    const hasUniqueId = Boolean(card.Unique_ID);
    const hasRarity = Boolean(card.Rarity);
    
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

/**
 * Updates the image URL for a card in the database
 */
const updateCardImageUrl = async (cardId: string, imageUrl: string) => {
    try {
        // Skip if the image URL is null or empty
        if (!imageUrl) return;
        
       
        
        // Attempt to get a better URL if this is a HEIF image
        let finalImageUrl = imageUrl;        
        // Get database connection
        const db = await getDB();
        
        // First check if the current image URL is different
        const [result] = await db.executeSql(
            'SELECT Image FROM lorcana_cards WHERE Unique_ID = ?',
            [cardId]
        );
        
        if (result.rows.length > 0) {
            const currentImage = result.rows.item(0).Image;
            
            // Only update if the URLs are different
            if (currentImage !== finalImageUrl) {
                await db.executeSql(
                    'UPDATE lorcana_cards SET Image = ? WHERE Unique_ID = ?',
                    [finalImageUrl, cardId]
                );
            }
        }
    } catch (error) {
        // Don't throw the error as this is not critical functionality
        console.error(`[LorcanaService] Error updating image URL:`, error);
    }
};

// Original search-based implementation extracted as a fallback method
const getLorcanaCardPriceBySearch = async (card: { Name: string; Set_Num?: number; Rarity?: string; Card_Num?: number }) => {
    try {
        // Split name into base name and version at " - " (space-hyphen-space)
        // This preserves hyphens within names like "Happy-Go-Lucky"
        const parts = card.Name.split(" - ");
        const baseName = parts[0].trim();
        const version = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";

        // Format rarity to lowercase after underscore
        const formattedRarity = card.Rarity
            ? card.Rarity
                .trim()
                .replace(/[\s-]+/g, '_')
                .toLowerCase()
            : '';
        console.log('[LorcanaService] Formatted rarity:', formattedRarity);

        // Build search query using card details and properly encode each part
        // Only include set if the card is not enchanted
        const queryParts = [
            `name:"${baseName.replace(/"/g, '\\"')}"`, // Escape quotes in name
            version ? `version:"${version.replace(/"/g, '\\"')}"` : '',
            card.Set_Num && card.Rarity !== 'Enchanted' ? `set:${card.Set_Num}` : '',
            formattedRarity ? `rarity:${formattedRarity}` : ''
        ].filter(Boolean);
        
        // Encode the entire query string after building it
        const query = `q=${encodeURIComponent(queryParts.join(' '))}`;
        console.log('[LorcanaService] Fetching price with query:', LorcastPriceApi + '?' + query);
        
        const response = await fetch(`${LorcastPriceApi}?${query}`);
        const data = await response.json();
        console.log('[LorcanaService] API response:', data);
        
        let searchResponse = data;

        if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
            // Try a more lenient search if exact match fails
            const lenientQuery = `q=${encodeURIComponent(`name:"${baseName.replace(/"/g, '\\"')}"`)}`;
            console.log('[LorcanaService] Trying lenient search:', LorcastPriceApi + '?' + lenientQuery);
            
            const lenientResponse = await fetch(`${LorcastPriceApi}?${lenientQuery}`);
            const lenientData = await lenientResponse.json();
            searchResponse = lenientData;
            
            if (!lenientData.results || !Array.isArray(lenientData.results) || lenientData.results.length === 0) {
                console.log('[LorcanaService] No results found for card:', card.Name);
                return {
                    usd: null,
                    usd_foil: null,
                    tcgplayer_id: null,
                    searchResponse: null
                };
            }
            
            // Find the best match from lenient results
            const exactMatch = lenientData.results.find((result: { name: string; version?: string }) => {
                const nameMatches = result.name.toLowerCase() === baseName.toLowerCase();
                if (!version || !result.version) return nameMatches;
                
                // Normalize versions by removing extra spaces, converting to lowercase, and removing special characters
                const normalizeVersion = (str: string) => str
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .replace(/[^a-z0-9 ]/g, '')
                    .trim();
                
                const normalizedVersion = normalizeVersion(version);
                const normalizedResultVersion = normalizeVersion(result.version);
                
                // Log the comparison for debugging
                console.log('[LorcanaService] Version comparison:', {
                    original: version,
                    normalized: normalizedVersion,
                    resultOriginal: result.version,
                    resultNormalized: normalizedResultVersion
                });
                
                // Check for exact match first
                if (normalizedVersion === normalizedResultVersion) return nameMatches;
                
                // Check for substring match (in case our version is partial)
                if (normalizedResultVersion.includes(normalizedVersion) || 
                    normalizedVersion.includes(normalizedResultVersion)) {
                    return nameMatches;
                }
                
                // Calculate similarity (allow for small typos)
                const distance = levenshteinDistance(normalizedVersion, normalizedResultVersion);
                const maxLength = Math.max(normalizedVersion.length, normalizedResultVersion.length);
                const similarity = 1 - (distance / maxLength);
                
                // Accept if similarity is high enough (90% similar)
                return nameMatches && similarity > 0.9;
            });
            
            if (!exactMatch) {
                console.log('[LorcanaService] No exact match found in lenient results');
                return {
                    usd: null,
                    usd_foil: null,
                    tcgplayer_id: null,
                    searchResponse: null
                };
            }
            
            data.results = [exactMatch];
        }

        // Use the first result from the results array
        const cardData = data.results[0];
        console.log('[LorcanaService] Card prices data:', cardData.prices);

        // For enchanted cards, which only come in foil, use the foil price as the regular price too
        const isEnchanted = card.Rarity === 'Enchanted';
        const foilPrice = cardData.prices?.usd_foil || cardData.prices?.foil || null;

        const prices = {
            usd: isEnchanted ? foilPrice : (cardData.prices?.regular || cardData.prices?.usd || null),
            usd_foil: foilPrice,
            tcgplayer_id: cardData.tcgplayer_id || null,
            searchResponse: searchResponse
        };

        return prices;
    } catch (error) {
        console.error('[LorcanaService] Error fetching Lorcana card price by search:', error);
        throw error;
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

        // Try to find existing collection
        const collectionName = `Set: ${setName}`;
        console.log(`[LorcanaService] Looking for existing collection with name: "${collectionName}" or description containing: "${setId})"`);
        const [existingCollection] = await db.executeSql(
            'SELECT id FROM lorcana_collections WHERE name = ? OR description LIKE ?',
            [collectionName, `%${setId})`]
        );

        if (existingCollection.rows.length > 0) {
            const collectionId = existingCollection.rows.item(0).id;
            console.log(`[LorcanaService] Found existing collection: ${collectionId}`);
            return collectionId;
        }
        
        console.log(`[LorcanaService] No existing collection found, creating new one...`);

        // Create new collection
        const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const now = new Date().toISOString();
        const description = `Collection for ${setName} (${setId})`;

        // Try to parse numeric component from setId (e.g., 'ROJ' is 8, 'ARI' is 7)
        let numericSetNum: number | null = null;
        const numericMatch = setId.match(/^(\d+)$/);
        if (numericMatch) {
            numericSetNum = parseInt(numericMatch[1], 10);
        } else {
            // fallback lookup via reverse mapping of mapLorcastSetCodeToSetId
            const reverseMap: { [k: string]: number } = { TFC:1, ROF:2, INK:3, URS:4, SSK:5, AZS:6, ARI:7, ROJ:8, FAB:9, WHI:10 };
            numericSetNum = reverseMap[setId.toUpperCase()] ?? null;
        }

        console.log(`[LorcanaService] Inserting collection with:`, {
            id, 
            collectionName, 
            description, 
            numericSetNum
        });
        
        await db.executeSql(
            `INSERT INTO lorcana_collections (id, name, description, created_at, updated_at, set_number)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, collectionName, description, now, now, numericSetNum]
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

        // Use a transaction to ensure all write operations complete atomically
        await db.transaction(async (tx) => {
            // No need to query inside the transaction – we already have the
            // current quantities.

            if (!rowExists) {
                // Insert new row with proper quantities
                const qNormal = isFoil ? 0 : quantity;
                const qFoil = isFoil ? quantity : 0;
                await tx.executeSql(
                    `INSERT INTO lorcana_collection_cards (collection_id, card_id, quantity_normal, quantity_foil, added_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [collectionId, cardId, qNormal, qFoil, now]
                );
            } else {
                // Increment appropriate quantity column
                const newNormal = currentNormal + (isFoil ? 0 : quantity);
                const newFoil = currentFoil + (isFoil ? quantity : 0);
                await tx.executeSql(
                    `UPDATE lorcana_collection_cards SET quantity_normal = ?, quantity_foil = ?, added_at = ?
                     WHERE collection_id = ? AND card_id = ?`,
                    [newNormal, newFoil, now, collectionId, cardId]
                );
            }

            // Update collection timestamp
            await tx.executeSql(
                'UPDATE lorcana_collections SET updated_at = ? WHERE id = ?',
                [now, collectionId]
            );

            // Mark card as collected and update prices
            await tx.executeSql(
                'UPDATE lorcana_cards SET collected = 1, price_usd = ?, price_usd_foil = ?, last_updated = ? WHERE Unique_ID = ?',
                [prices.usd, prices.usd_foil, now, cardId]
            );
        });

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
    console.log(`[LorcanaService] getLorcanaSetCollections called with forceRefresh: ${forceRefresh}`);
    try {
        const db = await getDB();
        console.log('[LorcanaService] Database connection obtained for getLorcanaSetCollections');
        // Auto-create missing set collections on first run ------------------
        // If there are currently no Lorcana set collections, we create one for
        // every distinct Set_ID in the master card table so the Set Completion
        // screen always has something to display (even before the user scans
        // any cards).
        // -------------------------------------------------------------------
        const [existingSetCollections] = await db.executeSql(
            "SELECT COUNT(*) as cnt FROM lorcana_collections WHERE name LIKE 'Set: %'"
        );

        console.log(`[LorcanaService] Found ${existingSetCollections.rows.item(0).cnt} existing Lorcana set collections`);

        // Always ensure all sets have collections (not just when count is 0)
        console.log('[LorcanaService] Checking for sets without collections...');

        // Get distinct sets from cards
        const [distinctSets] = await db.executeSql(
            `SELECT DISTINCT Set_ID, Set_Name, Set_Num FROM lorcana_cards
             WHERE Set_ID IS NOT NULL AND Set_Name IS NOT NULL
             ORDER BY Set_Num ASC`
        );

        console.log(`[LorcanaService] Found ${distinctSets.rows.length} distinct sets in database`);

        // Create collections for each set that doesn't have one
        for (let i = 0; i < distinctSets.rows.length; i++) {
            const row = distinctSets.rows.item(i);
            const setId = row.Set_ID;
            const setName = row.Set_Name;
            const setNum = row.Set_Num;

            try {
                // Check if collection already exists for this set
                const [existingSetCollection] = await db.executeSql(
                    'SELECT id FROM lorcana_collections WHERE name = ? OR description LIKE ?',
                    [`Set: ${setName}`, `%${setId})`]
                );

                if (existingSetCollection.rows.length === 0) {
                    // Create collection
                    const collectionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
                    const now = new Date().toISOString();
                    const description = `Collection for ${setName} (${setId})`;

                    await db.executeSql(
                        `INSERT INTO lorcana_collections (id, name, description, created_at, updated_at, set_number)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [collectionId, `Set: ${setName}`, description, now, now, setNum]
                    );

                    console.log(`[LorcanaService] Created collection for ${setName} (${setId})`);
                } else {
                    console.log(`[LorcanaService] Collection already exists for ${setName} (${setId})`);
                }
            } catch (error) {
                console.error(`[LorcanaService] Failed to create collection for ${setName}:`, error);
            }
        }
        // -------------------------------------------------------------------
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

        // Ensure all collections have set_number set for proper ordering
        await db.executeSql(`
            UPDATE lorcana_collections
            SET set_number = CASE
                WHEN description LIKE '%(TFC)' THEN 1
                WHEN description LIKE '%(ROF)' THEN 2
                WHEN description LIKE '%(INK)' THEN 3
                WHEN description LIKE '%(URS)' THEN 4
                WHEN description LIKE '%(SSK)' THEN 5
                WHEN description LIKE '%(AZS)' THEN 6
                WHEN description LIKE '%(ARI)' THEN 7
                WHEN description LIKE '%(ROJ)' THEN 8
                WHEN description LIKE '%(FAB)' THEN 9
                WHEN description LIKE '%(WHI)' THEN 10
                ELSE set_number
            END
            WHERE name LIKE 'Set: %' AND (set_number IS NULL OR set_number = 0)
        `);

        // Get all collections with their updated stats
        console.log('[LorcanaService] Executing main collection stats query...');


        // First check if lorcana_collection_cards table exists
        let collectionCardsTableExists = false;
        try {
            await db.executeSql("SELECT 1 FROM lorcana_collection_cards LIMIT 1");
            collectionCardsTableExists = true;
            console.log('[LorcanaService] lorcana_collection_cards table exists');
        } catch (error) {
            console.log('[LorcanaService] lorcana_collection_cards table does not exist, will use simplified query');
        }

        let results;
        try {
            if (collectionCardsTableExists) {
                // Use full query with collection cards - map text codes to numeric IDs
                const mappedQuery = `
            WITH CollectionStats AS (
                SELECT
                    c.id,
                    c.name,
                    c.description,
                    c.created_at,
                    c.updated_at,
                    COALESCE(cc.collected_count, 0) as collected_cards,
                    (
                        SELECT COUNT(DISTINCT lc.Unique_ID)
                        FROM lorcana_cards lc
                        WHERE lc.Set_ID = RTRIM(SUBSTR(c.description, INSTR(c.description, '(') + 1), ')')
                        AND lc.Unique_ID IS NOT NULL
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
                    c.set_number
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
            ORDER BY set_number ASC
            `;

                [results] = await db.executeSql(mappedQuery);
            } else {
                // Simplified query without collection cards table - map text codes to numeric IDs
                const simplifiedQuery = `
            SELECT
                c.id,
                c.name,
                c.description,
                c.created_at,
                c.updated_at,
                0 as collected_cards,
                (
                    SELECT COUNT(DISTINCT lc.Unique_ID)
                    FROM lorcana_cards lc
                    WHERE lc.Set_ID = RTRIM(SUBSTR(c.description, INSTR(c.description, '(') + 1), ')')
                    AND lc.Unique_ID IS NOT NULL
                ) as total_cards,
                0 as total_value,
                c.set_number,
                0 as completion_percentage
            FROM lorcana_collections c
            WHERE c.name LIKE 'Set: %'
            ORDER BY c.set_number ASC
            `;

                [results] = await db.executeSql(simplifiedQuery);
            }
            console.log(`[LorcanaService] Main query returned ${results.rows.length} rows`);
        } catch (queryError) {
            console.error('[LorcanaService] Main collection stats query failed:', queryError);
            throw queryError;
        }

        // If for some reason we still have zero collections (e.g. first run
        // where card data arrived a little later), try one more time to create
        // them and re-query.
        if (results.rows.length === 0) {
            console.log('[LorcanaService] No Lorcana collections found after primary query – attempting auto-creation fallback');

            // Check again if we have any cards
            const [cardCountFallback] = await db.executeSql('SELECT COUNT(*) as cnt FROM lorcana_cards');
            console.log(`[LorcanaService] Fallback: Found ${cardCountFallback.rows.item(0).cnt} total Lorcana cards in database`);

            const [distinctAgain] = await db.executeSql(
                `SELECT DISTINCT Set_ID, Set_Name FROM lorcana_cards
                 WHERE Set_ID IS NOT NULL AND Set_Name IS NOT NULL`
            );
            console.log(`[LorcanaService] Fallback: Found ${distinctAgain.rows.length} distinct sets in lorcana_cards table`);
            
            for (let i = 0; i < distinctAgain.rows.length; i++) {
                const row = distinctAgain.rows.item(i);
                console.log(`[LorcanaService] Fallback: Creating collection for set: ${row.Set_ID} - ${row.Set_Name}`);
                await getOrCreateLorcanaSetCollection(row.Set_ID, row.Set_Name);
            }

            // Re-run the main query
            [results] = await db.executeSql(`
                WITH CollectionStats AS (
                    SELECT 
                        c.id,
                        c.name,
                        c.description,
                        c.created_at,
                        c.updated_at,
                        COALESCE(cc.collected_count, 0) as collected_cards,
                        (
                            SELECT COUNT(DISTINCT lc.Unique_ID)
                            FROM lorcana_cards lc
                            WHERE lc.Set_ID = RTRIM(SUBSTR(c.description, INSTR(c.description, '(') + 1), ')')
                            AND lc.Unique_ID IS NOT NULL
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
                        c.set_number
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
            ;`);
        }

        const collections = Array.from({length: results.rows.length}, (_, i) => {
            const row = results.rows.item(i);
            return {
                id: row.id,
                name: row.name,
                cardCount: row.total_cards,
                description: row.description,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                totalCards: row.total_cards,
                collectedCards: row.collected_cards,
                completionPercentage: row.completion_percentage,
                totalValue: row.total_value || 0,
                set_number: row.set_number
            };
        });
        console.log(`[LorcanaService] Returning ${collections.length} collections`);
        return collections;
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
        await db.transaction(async (tx) => {
            // Lorcana cards table
            await tx.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                Artist TEXT, Body_Text TEXT, Card_Num INTEGER, Classifications TEXT,
                Color TEXT, Cost INTEGER, Date_Added TEXT, Date_Modified TEXT,
                Flavor_Text TEXT, Franchise TEXT, Image TEXT, Inkable INTEGER,
                Lore INTEGER, Name TEXT, Rarity TEXT, Set_ID TEXT, Set_Name TEXT,
                Set_Num INTEGER, Strength INTEGER, Type TEXT, Unique_ID TEXT UNIQUE,
                Willpower INTEGER, price_usd TEXT, price_usd_foil TEXT,
                last_updated TEXT, collected INTEGER DEFAULT 0
            );`);

            // Lorcana collections table
            await tx.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_collections (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                total_value REAL DEFAULT 0,
                card_count INTEGER DEFAULT 0,
                set_number INTEGER
            );`);

            // Lorcana collection cards table
            await tx.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_collection_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                collection_id TEXT NOT NULL,
                card_id TEXT NOT NULL,
                quantity INTEGER DEFAULT 1,
                added_at TEXT NOT NULL,
                FOREIGN KEY (collection_id) REFERENCES lorcana_collections(id) ON DELETE CASCADE
            );`);

            // Lorcana card prices table
            await tx.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_card_prices (
                card_id TEXT PRIMARY KEY NOT NULL,
                usd REAL,
                usd_foil REAL,
                tcgplayer_id INTEGER,
                last_updated TEXT NOT NULL,
                FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
            );`);

            // Create indices for better performance
            await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_name ON lorcana_cards(Name);');
            await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_unique_id ON lorcana_cards(Unique_ID);');
            await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_collection_cards_collection_id ON lorcana_collection_cards(collection_id);');
            await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_collection_cards_card_id ON lorcana_collection_cards(card_id);');
        });

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
    const mapping: { [key: string]: string } = {
        'TFC': '1',   // The First Chapter
        'ROF': '2',   // Rise of the Floodborn
        'INK': '3',   // Into the Inklands
        'URS': '4',   // Ursula's Return
        'SSK': '5',   // Shimmering Skies
        'AZS': '6',   // Azurite Sea
        'ARI': '7',   // Archazia's Island
        'ROJ': '8',   // Reign of Jafar
        'FAB': '9',   // Fabled
        'WHI': '10'   // Whispers in the Well
    };
    return mapping[textSetId] || textSetId; // Return original if not found
};

export const getLorcanaSetMissingCards = async (setId: string, collectionId: string): Promise<LorcanaCardWithPrice[]> => {
    try {
        const db = await getDB();

        // Convert text set code to numeric ID for database lookup
        const numericSetId = getNumericSetId(setId);

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
            WHERE lc.Set_ID = ?
            AND lc.Unique_ID IS NOT NULL
            AND lc.Name IS NOT NULL
            ORDER BY lc.Card_Num ASC;
        `, [collectionId, numericSetId]);

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
        await db.transaction(async (tx) => {
            // Due to foreign key constraints and ON DELETE CASCADE, this will automatically
            // delete associated records in lorcana_collection_cards
            await tx.executeSql(
                'DELETE FROM lorcana_collections WHERE id = ?',
                [collectionId]
            );
        });
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

                    // Prefer our internal mapping; fall back to API-provided IDs if unknown
                    const setId = mapLorcastSetCodeToSetId(card.set.code) || card.set.id || card.set.code;
                    if (!setId) {
                        console.log('[EnchantedImport] Skipping card (no setId):', card.name, card.set.code);
                        return;
                    }

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
                            card.ink || null,
                            card.cost || null,
                            card.released_at || new Date().toISOString(),
                            new Date().toISOString(),
                            card.flavor_text || null,
                            '',
                            card.image_uris?.digital?.normal || null,
                            card.inkwell ? 1 : 0,
                            card.lore || null,
                            card.name,
                            card.rarity || null,
                            setId,
                            card.set.name || null,
                            parseInt(card.collector_number) || null,
                            card.strength || null,
                            card.type?.join(', ') || null,
                            card.id || null,
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

// Add this helper function for calculating string similarity
function levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1,  // substitution
                    dp[i - 1][j] + 1,      // deletion
                    dp[i][j - 1] + 1       // insertion
                );
            }
        }
    }
    return dp[m][n];
}

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
        console.log('[LorcanaService] Starting safeRefreshLorcanaCards using new CardImportService...');

        // Use the new import service to import all sets
        const result = await cardImportService.importAllSets((progress) => {
            console.log(`[LorcanaService] Progress: Set ${progress.currentSet}/${progress.totalSets} - ${progress.setName}: ${progress.processedCards}/${progress.totalCards} cards`);
        });

        // Force re-initialization
        isInitialized = true;

        console.log(`[LorcanaService] Refresh complete using new system:`, result.summary);
        return {
            updated: result.updatedCards,
            added: result.addedCards
        };
    } catch (error) {
        console.error('[LorcanaService] Error in safeRefreshLorcanaCards:', error);
        return handleError('Error safely refreshing Lorcana cards', error);
    }
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
            const properSetCode = mapLorcastSetCodeToSetId(numericSetCode) || apiCard.set.code;
            const uniqueId = `${properSetCode}-${apiCard.collector_number}`;
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
                        apiCard.inks && apiCard.inks.length > 0 ? apiCard.inks[0] : null,
                        apiCard.cost || null,
                        apiCard.released_at || new Date().toISOString(),
                        apiCard.flavor_text || null,
                        '',
                        apiCard.image_uris?.digital?.normal || null,
                        apiCard.inkwell ? 1 : 0,
                        apiCard.lore || null,
                        `${apiCard.name}${apiCard.version ? ` - ${apiCard.version}` : ''}`,
                        apiCard.rarity || null,
                        properSetCode,
                        apiCard.set.name || null,
                        Number(numericSetCode) || null,
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
                        apiCard.inks && apiCard.inks.length > 0 ? apiCard.inks[0] : null,
                        apiCard.cost || null,
                        apiCard.flavor_text || null,
                        apiCard.image_uris?.digital?.normal || null,
                        apiCard.inkwell ? 1 : 0,
                        apiCard.lore || null,
                        `${apiCard.name}${apiCard.version ? ` - ${apiCard.version}` : ''}`,
                        apiCard.rarity || null,
                        properSetCode,
                        apiCard.set.name || null,
                        Number(numericSetCode) || null,
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
        await db.transaction(async (tx) => {
            for (let i = 0; i < results.rows.length; i++) {
                const card = results.rows.item(i);
                const fixedName = card.Name.replace(' - undefined', '');
                
                await tx.executeSql(
                    'UPDATE lorcana_cards SET Name = ? WHERE Unique_ID = ?',
                    [fixedName, card.Unique_ID]
                );
                fixedCount++;
            }
        });

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
        
        // First get the collection ID for this set
        console.log('[LorcanaService] Searching for collection with name:', `Set: ${setId}`, `or Set: ${setId.toUpperCase()}`);
        const [collectionResult] = await db.executeSql(
            "SELECT id, name FROM lorcana_collections WHERE name = ? OR name = ?",
            [`Set: ${setId}`, `Set: ${setId.toUpperCase()}`]
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
        
        // Fix the cards in a transaction
        await db.transaction(async (tx) => {
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
        });
        
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
             ORDER BY recorded_at DESC`,
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
        
        // Get statistics for normal prices (non-null values only)
        const [normalResults] = await db.executeSql(
            `SELECT 
                MAX(CAST(usd AS REAL)) as max_price,
                MIN(CAST(usd AS REAL)) as min_price,
                AVG(CAST(usd AS REAL)) as avg_price
             FROM lorcana_price_history
             WHERE card_id = ? AND usd IS NOT NULL`,
            [cardId]
        );
        
        // Get statistics for foil prices (non-null values only)
        const [foilResults] = await db.executeSql(
            `SELECT 
                MAX(CAST(usd_foil AS REAL)) as max_price,
                MIN(CAST(usd_foil AS REAL)) as min_price,
                AVG(CAST(usd_foil AS REAL)) as avg_price
             FROM lorcana_price_history
             WHERE card_id = ? AND usd_foil IS NOT NULL`,
            [cardId]
        );
        
        // Get the most recent price
        const [currentResults] = await db.executeSql(
            `SELECT usd, usd_foil
             FROM lorcana_card_prices
             WHERE card_id = ?`,
            [cardId]
        );
        
        // Calculate dates for historical comparisons
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString();
        
        // Get price from 7 days ago
        const [sevenDayResults] = await db.executeSql(
            `SELECT usd, usd_foil
             FROM lorcana_price_history
             WHERE card_id = ? AND recorded_at <= ?
             ORDER BY recorded_at DESC
             LIMIT 1`,
            [cardId, sevenDaysAgo]
        );
        
        // Get price from 30 days ago
        const [thirtyDayResults] = await db.executeSql(
            `SELECT usd, usd_foil
             FROM lorcana_price_history
             WHERE card_id = ? AND recorded_at <= ?
             ORDER BY recorded_at DESC
             LIMIT 1`,
            [cardId, thirtyDaysAgo]
        );
        
        // Extract values with appropriate defaults
        const currentPrice = currentResults.rows.length > 0 
            ? parseFloat(currentResults.rows.item(0).usd || '0') 
            : 0;
            
        const currentFoilPrice = currentResults.rows.length > 0 
            ? parseFloat(currentResults.rows.item(0).usd_foil || '0') 
            : 0;
            
        const sevenDayPrice = sevenDayResults.rows.length > 0 
            ? parseFloat(sevenDayResults.rows.item(0).usd || '0') 
            : currentPrice;
            
        const sevenDayFoilPrice = sevenDayResults.rows.length > 0 
            ? parseFloat(sevenDayResults.rows.item(0).usd_foil || '0') 
            : currentFoilPrice;
            
        const thirtyDayPrice = thirtyDayResults.rows.length > 0 
            ? parseFloat(thirtyDayResults.rows.item(0).usd || '0') 
            : currentPrice;
            
        const thirtyDayFoilPrice = thirtyDayResults.rows.length > 0 
            ? parseFloat(thirtyDayResults.rows.item(0).usd_foil || '0') 
            : currentFoilPrice;
        
        // Calculate price changes (percentage)
        const priceChange7d = sevenDayPrice === 0 
            ? 0 
            : ((currentPrice - sevenDayPrice) / sevenDayPrice) * 100;
            
        const priceChange30d = thirtyDayPrice === 0 
            ? 0 
            : ((currentPrice - thirtyDayPrice) / thirtyDayPrice) * 100;
            
        const foilPriceChange7d = sevenDayFoilPrice === 0 
            ? 0 
            : ((currentFoilPrice - sevenDayFoilPrice) / sevenDayFoilPrice) * 100;
            
        const foilPriceChange30d = thirtyDayFoilPrice === 0 
            ? 0 
            : ((currentFoilPrice - thirtyDayFoilPrice) / thirtyDayFoilPrice) * 100;
        
        return {
            maxPrice: normalResults.rows.item(0).max_price || 0,
            minPrice: normalResults.rows.item(0).min_price || 0,
            avgPrice: normalResults.rows.item(0).avg_price || 0,
            priceChange7d,
            priceChange30d,
            maxFoilPrice: foilResults.rows.item(0).max_price || 0,
            minFoilPrice: foilResults.rows.item(0).min_price || 0,
            avgFoilPrice: foilResults.rows.item(0).avg_price || 0,
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
        console.log('[LorcanaService] Starting price update for all Lorcana cards...');
        const db = await getDB();
        
        // Get the current timestamp
        const now = new Date();
        
        // Calculate the cutoff date for updates (default 1 day)
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);
        const cutoffDateString = cutoffDate.toISOString();
        
        // Get all cards that need updates (no price or last updated before cutoff)
        const [cardsToUpdate] = await db.executeSql(
            `SELECT lc.* FROM lorcana_cards lc
             LEFT JOIN lorcana_card_prices lcp ON lc.Unique_ID = lcp.card_id
             WHERE lcp.card_id IS NULL OR lcp.last_updated < ?
             ORDER BY lc.Name`,
            [cutoffDateString]
        );
        
        console.log(`[LorcanaService] Found ${cardsToUpdate.rows.length} cards that need price updates`);
        
        let updated = 0;
        let skipped = 0;
        
        // Update prices in batches to avoid overloading the API
        const batchSize = 10;
        for (let i = 0; i < cardsToUpdate.rows.length; i += batchSize) {
            const batch = [];
            
            for (let j = 0; j < batchSize && i + j < cardsToUpdate.rows.length; j++) {
                batch.push(cardsToUpdate.rows.item(i + j));
            }
            
            console.log(`[LorcanaService] Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(cardsToUpdate.rows.length / batchSize)}`);
            
            await Promise.all(batch.map(async (card) => {
                try {
                    await getLorcanaCardPrice({
                        Name: card.Name,
                        Set_Num: card.Set_Num,
                        Card_Num: card.Card_Num,
                        Rarity: card.Rarity,
                        Unique_ID: card.Unique_ID
                    });
                    updated++;
                } catch (error) {
                    console.error(`[LorcanaService] Error updating price for card: ${card.Name}`, error);
                    skipped++;
                }
            }));
            
            // Add a delay between batches to avoid rate limiting
            if (i + batchSize < cardsToUpdate.rows.length) {
                console.log('[LorcanaService] Waiting between batches...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // Clean up old price history after updates
        console.log('[LorcanaService] Running price history cleanup...');
        const removedRecords = await cleanupLorcanaPriceHistory(15);
        console.log(`[LorcanaService] Price update complete. Updated: ${updated}, Skipped: ${skipped}, Removed history records: ${removedRecords}`);
        
        return { updated, skipped };
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
    const result = await fixCardSetIdentifiers('4'); // numeric code 4 → ROJ
    return result;
  } catch (err) {
    console.error('[LorcanaService] fixJAFtoROJSetIdentifiers error', err);
    return { updated: 0, skipped: 0, message: 'failed' };
  }
};

// ---------------------------------------------------------------------------
// New helper functions for caching Lorcana card API fetch timestamps
// ---------------------------------------------------------------------------
export const getLorcanaCardApiTimestamp = async (cardId: string): Promise<number | null> => {
    try {
        if (!cardId) return null;
        // Ensure the timestamps table exists
        await createLorcanaCardApiTimestampsTable();
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
        // Ensure the timestamps table exists
        await createLorcanaCardApiTimestampsTable();
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
