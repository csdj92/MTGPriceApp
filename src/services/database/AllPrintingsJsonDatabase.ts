import SQLite from 'react-native-sqlite-storage';   
import RNFS from 'react-native-fs';
import { InteractionManager } from 'react-native';
import { DataMerger } from '../../database/DataMerger';
import { MigrationManager } from '../../database/migrations/MigrationManager';
import { SetInfo } from '../../types/database';
import type { ExtendedCard } from '../../types/card';

export class AllPrintingsJsonDatabase {
    private static instance: AllPrintingsJsonDatabase;
    private db: SQLite.SQLiteDatabase | null = null;
    private initialized = false;
    private migrationManager: MigrationManager | null = null;
    private dataMerger: DataMerger | null = null;
    private setListCache: SetInfo[] | null = null;
    private setListLastUpdate = 0;
    private readonly EXPENSIVE_CARDS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    private readonly SET_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    private setCardsCache: { [key: string]: { cards: any[]; timestamp: number } } = {};
    private readonly CARDS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
    private expensiveCardsCache: {
        [key: string]: {
            cards: any[];
            timestamp: number;
        };
    } = {};
    private static readonly DB_PATH = '/data/data/com.mtgpriceapp/files/AllPrintings.sqlite';

    private constructor() {
        this.db = null;
    }

    public static getInstance(): AllPrintingsJsonDatabase {
        if (!AllPrintingsJsonDatabase.instance) {
            AllPrintingsJsonDatabase.instance = new AllPrintingsJsonDatabase();
        }
        return AllPrintingsJsonDatabase.instance;
    }

    /**
     * Verifies if the critical 'cards' table exists in the currently open database.
     * Throws an error if the table is not found.
     */
    private async verifyCardsTableExists(): Promise<void> {
        if (!this.db) {
            throw new Error("[AllPrintingsJsonDatabase] Database not open for verification.");
        }
        try {
            const [result] = await this.db.executeSql("SELECT name FROM sqlite_master WHERE type='table' AND name='cards'");
            if (result.rows.length === 0) {
                throw new Error("[AllPrintingsJsonDatabase] Critical table 'cards' missing from the database.");
            }
            console.log('[AllPrintingsJsonDatabase] Verified "cards" table exists.');
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Error verifying "cards" table:', error);
            // Attempt to close the problematic DB connection
            if (this.db) {
                try { await this.db.close(); } catch (e) { console.warn('[AllPrintingsJsonDatabase] Error closing DB during verification failure:', e); }
            }
            this.db = null; // Nullify DB object
            this.initialized = false; // Reset initialization state
            throw error; // Re-throw to be handled by the calling function
        }
    }

    /**
     * Initialize the database connection
     * This should be called before any database operations
     */
    public async initialize(): Promise<void> {
        if (this.initialized && this.db) {
            console.log('[AllPrintingsJsonDatabase] Already initialized.');
            return;
        }

        try {
            console.log('[AllPrintingsJsonDatabase] Attempting to initialize database connection...');
            let needsDownload = false;
            const dbExists = await this.databaseExists();

            if (dbExists) {
                console.log('[AllPrintingsJsonDatabase] Database file found. Attempting to open and verify...');
                try {
                    this.db = await SQLite.openDatabase({
                        name: AllPrintingsJsonDatabase.DB_PATH,
                        location: 'default', // Assuming this is correct for an absolute path in 'name'
                    });
                    await this.verifyCardsTableExists(); // Throws on failure
                    this.initialized = true;
                    console.log('[AllPrintingsJsonDatabase] Existing database opened and verified successfully.');
                } catch (verificationError) {
                    console.warn('[AllPrintingsJsonDatabase] Existing database failed verification or open:', verificationError);
                    if (this.db) {
                        try { await this.db.close(); } catch (e) { /* ignore closing error */ }
                        this.db = null;
                    }
                    this.initialized = false;
                    needsDownload = true; 
                    console.log('[AllPrintingsJsonDatabase] Deleting problematic existing database file...');
                    try {
                        await RNFS.unlink(AllPrintingsJsonDatabase.DB_PATH);
                    } catch (unlinkError) {
                        console.error('[AllPrintingsJsonDatabase] Failed to delete problematic database file:', unlinkError);
                    }
                }
            } else {
                console.log('[AllPrintingsJsonDatabase] Database file not found.');
                needsDownload = true;
            }

            if (needsDownload) {
                console.log('[AllPrintingsJsonDatabase] Proceeding with database download.');
                await this.downloadMTGJsonDatabase(); // This method now also verifies and sets this.initialized
            }

            if (!this.initialized || !this.db) {
                // This path suggests that even after attempting existing or download, we failed.
                throw new Error('[AllPrintingsJsonDatabase] Failed to initialize database after all attempts (DB not set or not initialized).');
            }
            console.log('[AllPrintingsJsonDatabase] Database initialization process complete.');

        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Critical error during database initialization routine:', error);
            this.initialized = false; 
            if (this.db) {
                try { await this.db.close(); } catch(e) { /* ignore */ }
            }
            this.db = null;
            throw error; 
        }
    }

    /**
     * Get the database instance
     * @returns The SQLite database instance or null if not initialized
     */
    public getDatabase(): SQLite.SQLiteDatabase | null {
        return this.db;
    }
     
    public async getCardRulings(cardUuid: string): Promise<{date: string, text: string}[]> {
        try {
            // Ensure database is initialized
            if (!this.db) {
                await this.initialize();
                if (!this.db) {
                    throw new Error('Database not initialized');
                }
            }

            const [results] = await this.db!.executeSql(`
                SELECT date, text FROM cardRulings
                WHERE uuid = ?
                ORDER BY date ASC
            `, [cardUuid]);

            const rulings: {date: string, text: string}[] = [];
            for (let i = 0; i < results.rows.length; i++) {
                rulings.push(results.rows.item(i));
            }

            return rulings;
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Error getting card rulings:', error);
            return [];
        }
    }

    // Add a method to save card rulings to database
    public async saveCardRulings(cardUuid: string, rulings: {date: string, text: string}[]): Promise<void> {
        try {
            // Ensure database is initialized
            if (!this.db) {
                await this.initialize();
                if (!this.db) {
                    throw new Error('Database not initialized');
                }
            }

            // Begin transaction
            await this.db.executeSql('BEGIN TRANSACTION');

            // Delete existing rulings
            await this.db.executeSql('DELETE FROM cardRulings WHERE cardUuid = ?', [cardUuid]);

            // Insert new rulings
            for (const ruling of rulings) {
                await this.db.executeSql(
                    'INSERT INTO cardRulings (cardUuid, date, text) VALUES (?, ?, ?)',
                    [cardUuid, ruling.date, ruling.text]
                );
            }

            // Commit transaction
            await this.db.executeSql('COMMIT');
        } catch (error) {
            // Rollback on error
            if (this.db) {
                await this.db.executeSql('ROLLBACK');
            }
            console.error('[AllPrintingsJsonDatabase] Error saving card rulings:', error);
            throw error;
        }
    }

    /**
     * Checks if the MTGJson database file exists
     * @returns Promise resolving to true if the database file exists, false otherwise
     */
    public async databaseExists(): Promise<boolean> {
        try {
            return await RNFS.exists(AllPrintingsJsonDatabase.DB_PATH);
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Error checking if database exists:', error);
            return false;
        }
    }

    async downloadMTGJsonDatabase(): Promise<boolean> {
        const mtgJsonUrl = 'https://mtgjson.com/api/v5/AllPrintings.sqlite';
        const mtgJsonPath = AllPrintingsJsonDatabase.DB_PATH;

        console.log('[AllPrintingsJsonDatabase] Starting download of MTGJson database');
        console.log(`[AllPrintingsJsonDatabase] Download URL: ${mtgJsonUrl}`);
        console.log(`[AllPrintingsJsonDatabase] Download path: ${mtgJsonPath}`);

        try {
            // Return a promise that won't resolve until the background work is complete
            return await new Promise((resolve, reject) => {
                // Move the entire operation to run after UI interactions are complete
                InteractionManager.runAfterInteractions(() => {
                    // Download the new database file
                    RNFS.downloadFile({
                        fromUrl: mtgJsonUrl,
                        toFile: mtgJsonPath,
                        background: true, // Ensure download happens in background thread
                        progressDivider: 5, // Report progress less frequently to reduce UI updates
                        progress: (response) => {
                            const progress = (response.bytesWritten / response.contentLength) * 100;
                            console.log(`[AllPrintingsJsonDatabase] Download progress: ${progress.toFixed(2)}%`);
                        },
                    })
                    .promise
                    .then(async () => {
                        console.log('[AllPrintingsJsonDatabase] Download completed successfully');
                        // After download is complete, open database in another interaction frame
                        InteractionManager.runAfterInteractions(async () => {
                            try {
                                console.log('[AllPrintingsJsonDatabase] Opening downloaded database');
                                // Open the new database
                                this.db = await SQLite.openDatabase({
                                    name: mtgJsonPath,
                                    location: 'default',
                                });

                                // Verify the newly downloaded database
                                await this.verifyCardsTableExists();
                                
                                if (this.dataMerger) {
                                    // Migrate price data from old database to new using the correct path
                                    await this.dataMerger.mergePriceDataToNewDb(mtgJsonPath);
                                }
                                
                                this.initialized = true;
                                console.log('[AllPrintingsJsonDatabase] Database opened and initialized successfully after download');
                                resolve(true);
                            } catch (error) {
                                console.error('[AllPrintingsJsonDatabase] Error opening or migrating database:', error);
                                reject(error);
                            }
                        });
                    })
                    .catch(error => {
                        console.error('[AllPrintingsJsonDatabase] Error downloading MTGJson database:', error);
                        reject(error);
                    });
                });
            });
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Error in downloadMTGJsonDatabase:', error);
            return false;
        }
    }

    async getPriceDataWithCardDetails(page: number, pageSize: number) {
        try {
            const offset = (page - 1) * pageSize;
            const [result] = await this.db!.executeSql(
                `SELECT p.*, c.name, c.setCode, c.number, c.rarity 
                 FROM price_data p 
                 LEFT JOIN cards c ON p.uuid = c.uuid 
                 ORDER BY p.last_updated DESC 
                 LIMIT ? OFFSET ?`,
                [pageSize, offset]
            );

            const prices = [];
            for (let i = 0; i < result.rows.length; i++) {
                const item = result.rows.item(i);
                if (!item.name && this.db) {
                    // If card details not in our local cache, fetch from MTGJson database
                    const cardDetails = await this.getCardDetailsByUuid(item.uuid);
                    if (cardDetails) {
                        // Cache the card details in our database
                        await this.db!.executeSql(
                            `INSERT OR REPLACE INTO cards 
                             (uuid, name, setCode, number, rarity) 
                             VALUES (?, ?, ?, ?, ?)`,
                            [item.uuid, cardDetails.name, cardDetails.setCode,
                            cardDetails.number, cardDetails.rarity]
                        );
                        Object.assign(item, cardDetails);
                    }
                }
                prices.push(item);
            }
            return prices;
        } catch (error) {
            console.error('Error getting price data with card details:', error);
            return [];
        }
    }

    async getCardDetailsByUuid(uuid: string): Promise<any> {
        if (!this.db) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await this.db!.executeSql(
                `SELECT name, setCode, number, rarity, types 
                 FROM cards 
                 WHERE uuid = ?`,
                [uuid]
            );

            if (result.rows.length > 0) {
                return result.rows.item(0);
            }
            return null;
        } catch (error) {
            console.error('Error getting card details:', error);
            return null;
        }
    }

    async getAllCardsBySet(setCode: string, pageSize: number, offset: number): Promise<any[]> {
        if (!this.db) {
            throw new Error('MTGJson database not initialized');
        }

        // Check cache first
        const cacheKey = `${setCode}_${pageSize}_${offset}`;
        const cached = this.setCardsCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp) < this.CARDS_CACHE_DURATION) {
            return cached.cards;
        }

        try {
            // Optimize the query by using a single JOIN and avoiding subqueries
            const [result] = await this.db!.executeSql(`
                SELECT 
                    c.uuid, 
                    c.name, 
                    c.setCode,
                    c.number, 
                    c.rarity,
                    c.layout,
                    c.side,
                    COALESCE(p.normal_price, 0) as normal_price,
                    COALESCE(p.foil_price, 0) as foil_price,
                    COALESCE(p.tcg_normal_price, 0) as tcg_normal_price,
                    COALESCE(p.tcg_foil_price, 0) as tcg_foil_price,
                    COALESCE(p.cardmarket_normal_price, 0) as cardmarket_normal_price,
                    COALESCE(p.cardmarket_foil_price, 0) as cardmarket_foil_price,
                    COALESCE(p.cardkingdom_normal_price, 0) as cardkingdom_normal_price,
                    COALESCE(p.cardkingdom_foil_price, 0) as cardkingdom_foil_price,
                    COALESCE(p.cardsphere_normal_price, 0) as cardsphere_normal_price,
                    COALESCE(p.cardsphere_foil_price, 0) as cardsphere_foil_price,
                    p.last_updated
                FROM cards c
                LEFT JOIN prices p ON c.uuid = p.uuid
                WHERE UPPER(c.setCode) = ?
                ORDER BY c.number ASC, c.side ASC
                LIMIT ? OFFSET ?
            `, [setCode.toUpperCase(), pageSize, offset]);

            const rawCards = result.rows.raw();
            
            // Group double-sided cards
            const cardMap = new Map();
            
            for (const card of rawCards) {
                // Check if this is a double-sided card by side property
                if (card.side === 'b') {
                    // This is a back face, find the corresponding front face
                    const baseNumber = card.number.replace(/b$/, '').replace(/\d+b$/, (match: string) => match.slice(0, -1));
                    
                    // Look for the matching front face card in our processed cards
                    for (const [key, frontCard] of cardMap.entries()) {
                        // If the card numbers match (ignoring a/b suffix)
                        const frontNumber = frontCard.number.replace(/a$/, '').replace(/\d+a$/, (match: string) => match.slice(0, -1));
                        
                        if (frontNumber === baseNumber && frontCard.setCode === card.setCode) {
                            // Add back face information to the front face card
                            frontCard.otherSide = {
                                uuid: card.uuid,
                                name: card.name
                            };
                            frontCard.otherSideName = card.name;
                            frontCard.layout = 'transform'; // Mark as double-sided
                            break;
                        }
                    }
                    
                    // Skip adding the back face as a separate card
                    continue;
                }
                
                // For front face cards or single-sided cards
                const cardKey = `${card.setCode}_${card.number}`;
                
                cardMap.set(cardKey, {
                    uuid: card.uuid,
                    name: card.name,
                    setCode: card.setCode,
                    number: card.number,
                    rarity: card.rarity,
                    side: card.side || 'a', // Default to 'a' if no side is specified
                    layout: card.layout || 'normal',
                    normal_price: parseFloat(card.normal_price) || 0,
                    foil_price: parseFloat(card.foil_price) || 0,
                    prices: {
                        tcgplayer: {
                            normal: parseFloat(card.tcg_normal_price) || 0,
                            foil: parseFloat(card.tcg_foil_price) || 0
                        },
                        cardmarket: {
                            normal: parseFloat(card.cardmarket_normal_price) || 0,
                            foil: parseFloat(card.cardmarket_foil_price) || 0
                        },
                        cardkingdom: {
                            normal: parseFloat(card.cardkingdom_normal_price) || 0,
                            foil: parseFloat(card.cardkingdom_foil_price) || 0
                        },
                        cardsphere: {
                            normal: parseFloat(card.cardsphere_normal_price) || 0,
                            foil: parseFloat(card.cardsphere_foil_price) || 0
                        }
                    },
                    last_updated: card.last_updated ? new Date(card.last_updated).getTime() : null
                });
            }
            
            // Convert map back to array
            const cards = Array.from(cardMap.values());

            // Cache the results
            this.setCardsCache[cacheKey] = {
                cards,
                timestamp: Date.now()
            };

            return cards;
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Error getting cards by set:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                setCode,
                pageSize,
                offset
            });
            return [];
        }
    }

    async getMostExpensiveCards(pageSize: number, offset: number, sortBy: 'normal_price' | 'foil_price'): Promise<any[]> {
        if (!this.db) {
            throw new Error('MTGJson database not initialized');
        }

        // Check cache first
        const cacheKey = `${pageSize}_${offset}_${sortBy}`;
        const cached = this.expensiveCardsCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp) < this.EXPENSIVE_CARDS_CACHE_DURATION) {
            return cached.cards;
        }

        try {
            // Create indexes if they don't exist
            await this.db!.executeSql(`
                CREATE INDEX IF NOT EXISTS idx_prices_normal ON prices(normal_price);
                CREATE INDEX IF NOT EXISTS idx_prices_foil ON prices(foil_price);
            `);

            const [result] = await this.db!.executeSql(`
                SELECT 
                    c.uuid,
                    c.name,
                    c.setCode,
                    c.number,
                    c.rarity,
                    c.layout,
                    c.side,
                    COALESCE(p.normal_price, 0) as normal_price,
                    COALESCE(p.foil_price, 0) as foil_price,
                    COALESCE(p.tcg_normal_price, 0) as tcg_normal_price,
                    COALESCE(p.tcg_foil_price, 0) as tcg_foil_price,
                    COALESCE(p.cardmarket_normal_price, 0) as cardmarket_normal_price,
                    COALESCE(p.cardmarket_foil_price, 0) as cardmarket_foil_price,
                    COALESCE(p.cardkingdom_normal_price, 0) as cardkingdom_normal_price,
                    COALESCE(p.cardkingdom_foil_price, 0) as cardkingdom_foil_price,
                    COALESCE(p.cardsphere_normal_price, 0) as cardsphere_normal_price,
                    COALESCE(p.cardsphere_foil_price, 0) as cardsphere_foil_price,
                    p.last_updated
                FROM cards c
                LEFT JOIN prices p ON c.uuid = p.uuid
                WHERE p.${sortBy} > 0
                ORDER BY p.${sortBy} DESC
                LIMIT ? OFFSET ?
            `, [pageSize * 2, offset]); // Get more rows to account for filtering out back faces

            const rawCards = result.rows.raw();
            
            // Group double-sided cards
            const cardMap = new Map();
            
            for (const card of rawCards) {
                // Check if this is a double-sided card by side property
                if (card.side === 'b') {
                    // This is a back face, find the corresponding front face
                    const baseNumber = card.number.replace(/b$/, '').replace(/\d+b$/, (match: string) => match.slice(0, -1));
                    
                    // Look for the matching front face card in our processed cards
                    for (const [key, frontCard] of cardMap.entries()) {
                        // If the card numbers match (ignoring a/b suffix)
                        const frontNumber = frontCard.number.replace(/a$/, '').replace(/\d+a$/, (match: string) => match.slice(0, -1));
                        
                        if (frontNumber === baseNumber && frontCard.setCode === card.setCode) {
                            // Add back face information to the front face card
                            frontCard.otherSide = {
                                uuid: card.uuid,
                                name: card.name
                            };
                            frontCard.otherSideName = card.name;
                            frontCard.layout = 'transform'; // Mark as double-sided
                            break;
                        }
                    }
                    
                    // Skip adding the back face as a separate card
                    continue;
                }
                
                // For front face cards or single-sided cards
                const cardKey = `${card.setCode}_${card.number}`;
                
                cardMap.set(cardKey, {
                    uuid: card.uuid,
                    name: card.name,
                    setCode: card.setCode,
                    number: card.number,
                    rarity: card.rarity,
                    side: card.side || 'a', // Default to 'a' if no side is specified
                    layout: card.layout || 'normal',
                    normal_price: parseFloat(card.normal_price) || 0,
                    foil_price: parseFloat(card.foil_price) || 0,
                    prices: {
                        tcgplayer: {
                            normal: parseFloat(card.tcg_normal_price) || 0,
                            foil: parseFloat(card.tcg_foil_price) || 0
                        },
                        cardmarket: {
                            normal: parseFloat(card.cardmarket_normal_price) || 0,
                            foil: parseFloat(card.cardmarket_foil_price) || 0
                        },
                        cardkingdom: {
                            normal: parseFloat(card.cardkingdom_normal_price) || 0,
                            foil: parseFloat(card.cardkingdom_foil_price) || 0
                        },
                        cardsphere: {
                            normal: parseFloat(card.cardsphere_normal_price) || 0,
                            foil: parseFloat(card.cardsphere_foil_price) || 0
                        }
                    },
                    last_updated: card.last_updated ? new Date(card.last_updated).getTime() : null
                });
            }
            
            // Convert map back to array
            let cards = Array.from(cardMap.values());
            
            // Re-sort by price since we might have modified the order while processing
            cards.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
            
            // Trim back to requested pageSize
            cards = cards.slice(0, pageSize);

            // Cache the results
            this.expensiveCardsCache[cacheKey] = {
                cards,
                timestamp: Date.now()
            };

            return cards;
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Error getting most expensive cards:', {
                errorObject: error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                pageSize,
                offset,
                sortBy
            });

            // Return cached data if available, even if expired
            if (this.expensiveCardsCache[cacheKey]) {
                return this.expensiveCardsCache[cacheKey].cards;
            }
            
            return [];
        }
    }

    async getSetList(): Promise<SetInfo[]> {
        // Return cached data if it's still valid
        if (this.setListCache && (Date.now() - this.setListLastUpdate) < this.SET_CACHE_DURATION) {
            return this.setListCache;
        }

        if (!this.db) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            // Use a more efficient JOIN instead of a subquery
            // Add indexes if they don't exist
            await this.db!.executeSql(`
                CREATE INDEX IF NOT EXISTS idx_cards_setcode ON cards(setCode);
                CREATE INDEX IF NOT EXISTS idx_sets_code ON sets(code);
                CREATE INDEX IF NOT EXISTS idx_sets_releasedate ON sets(releaseDate);
            `);

            const [result] = await this.db!.executeSql(`
                SELECT 
                    s.code as setCode,
                    s.name as setName,
                    s.releaseDate,
                    COUNT(c.uuid) as cardCount,
                    s.type as type
                FROM sets s
                LEFT JOIN cards c ON s.code = c.setCode
                GROUP BY s.code, s.name, s.releaseDate
                ORDER BY s.releaseDate DESC, s.name ASC
            `);

            const sets: SetInfo[] = result.rows.raw().map(row => ({
                code: row.setCode || '',
                name: row.setName || row.setCode || '',
                releaseDate: row.releaseDate,
                cardCount: row.cardCount,
                totalCards: row.cardCount, // Add missing totalCards property
                type: row.type || 'expansion' // Add missing type property with default value
            }));

            // Update cache with a longer duration since set data rarely changes
            this.setListCache = sets;
            this.setListLastUpdate = Date.now();

            return sets;
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Error getting set list:', error);
            // Return cached data even if expired in case of error
            if (this.setListCache) {
                return this.setListCache;
            }
            return [];
        }
    }

    async reinitializePrices(): Promise<void> {
        try {
            console.log('[AllPrintingsJsonDatabase] Starting price database reinitialization...');

            // Ensure MTGJson database is initialized
            if (!this.db) {
                console.log('[AllPrintingsJsonDatabase] MTGJson database not initialized, initializing...');
                await this.initialize();
                if (!this.db) {
                    throw new Error('Failed to initialize MTGJson database');
                }
            }

            // Use the safe operation pattern
            try {
                // Drop existing price-related tables
               
                // Recreate tables
                console.log('[AllPrintingsJsonDatabase] Recreating price tables...');
                await this.safeMTGJsonOperation(async (db) => {
                    // Use a transaction for the price tables creation
                    await db.transaction(async (tx) => {
                        // Current prices table
                        await tx.executeSql(`
                            CREATE TABLE IF NOT EXISTS current_prices (
                                uuid TEXT PRIMARY KEY NOT NULL,
                                normal_price REAL DEFAULT 0,
                                foil_price REAL DEFAULT 0,
                                tcg_normal_price REAL DEFAULT 0,
                                tcg_foil_price REAL DEFAULT 0,
                                cardmarket_normal_price REAL DEFAULT 0,
                                cardmarket_foil_price REAL DEFAULT 0,
                                cardkingdom_normal_price REAL DEFAULT 0,
                                cardkingdom_foil_price REAL DEFAULT 0,
                                cardsphere_normal_price REAL DEFAULT 0,
                                cardsphere_foil_price REAL DEFAULT 0,
                                cardhoarder_normal_price REAL DEFAULT 0,
                                cardhoarder_foil_price REAL DEFAULT 0,
                                last_updated INTEGER NOT NULL
                            );
                        `);

                        // Price history table
                        await tx.executeSql(`
                            CREATE TABLE IF NOT EXISTS price_history (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                uuid TEXT NOT NULL,
                                timestamp INTEGER NOT NULL,
                                normal_price REAL DEFAULT 0,
                                foil_price REAL DEFAULT 0,
                                tcg_normal_price REAL DEFAULT 0,
                                tcg_foil_price REAL DEFAULT 0,
                                cardmarket_normal_price REAL DEFAULT 0,
                                cardmarket_foil_price REAL DEFAULT 0,
                                cardkingdom_normal_price REAL DEFAULT 0,
                                cardkingdom_foil_price REAL DEFAULT 0,
                                cardsphere_normal_price REAL DEFAULT 0,
                                cardsphere_foil_price REAL DEFAULT 0,
                                cardhoarder_normal_price REAL DEFAULT 0,
                                cardhoarder_foil_price REAL DEFAULT 0,
                                recorded_at INTEGER NOT NULL
                            );
                        `);

                        await tx.executeSql(`
                            CREATE TABLE IF NOT EXISTS prices (
                                uuid TEXT PRIMARY KEY NOT NULL,
                                normal_price REAL DEFAULT 0,
                                foil_price REAL DEFAULT 0,
                                tcg_normal_price REAL DEFAULT 0,
                                tcg_foil_price REAL DEFAULT 0,
                                cardmarket_normal_price REAL DEFAULT 0,
                                cardmarket_foil_price REAL DEFAULT 0,
                                cardkingdom_normal_price REAL DEFAULT 0,
                                cardkingdom_foil_price REAL DEFAULT 0,
                                cardsphere_normal_price REAL DEFAULT 0,
                                cardsphere_foil_price REAL DEFAULT 0,
                                cardhoarder_normal_price REAL DEFAULT 0,
                                cardhoarder_foil_price REAL DEFAULT 0,
                                last_updated INTEGER NOT NULL
                            );
                        `);

                        // Last price update timestamp table
                        await tx.executeSql(`
                            CREATE TABLE IF NOT EXISTS price_update_timestamp (
                                id INTEGER PRIMARY KEY CHECK (id = 1),
                                last_update INTEGER NOT NULL
                            );
                        `);

                        // Create indices for price tables
                        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_price_history_uuid ON price_history(uuid);');
                        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp);');
                    });
                });
            } catch (error) {
                // If we get here, attempt recovery
                console.error('[AllPrintingsJsonDatabase] Error during price reinitialization, attempting recovery:', error);
                // Try to reopen the database
                await this.reopenMTGJsonDatabase();
                
                // Retry the operation
                await this.safeMTGJsonOperation(async (db) => {
                    await db.executeSql('DROP TABLE IF EXISTS price_history');
                    await db.executeSql('DROP TABLE IF EXISTS prices');
                    await db.executeSql('DROP TABLE IF EXISTS app_settings');
                });
                
                // Use a transaction to recreate tables
                await this.safeMTGJsonOperation(async (db) => {
                    await db.transaction(async (tx) => {
                        // Current prices table
                        await tx.executeSql(`
                            CREATE TABLE IF NOT EXISTS current_prices (
                                uuid TEXT PRIMARY KEY NOT NULL,
                                normal_price REAL DEFAULT 0,
                                foil_price REAL DEFAULT 0,
                                tcg_normal_price REAL DEFAULT 0,
                                tcg_foil_price REAL DEFAULT 0,
                                cardmarket_normal_price REAL DEFAULT 0,
                                cardmarket_foil_price REAL DEFAULT 0,
                                cardkingdom_normal_price REAL DEFAULT 0,
                                cardkingdom_foil_price REAL DEFAULT 0,
                                cardsphere_normal_price REAL DEFAULT 0,
                                cardsphere_foil_price REAL DEFAULT 0,
                                cardhoarder_normal_price REAL DEFAULT 0,
                                cardhoarder_foil_price REAL DEFAULT 0,
                                last_updated INTEGER NOT NULL
                            );
                        `);

                        // Price history table
                        await tx.executeSql(`
                            CREATE TABLE IF NOT EXISTS price_history (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                uuid TEXT NOT NULL,
                                timestamp INTEGER NOT NULL,
                                normal_price REAL DEFAULT 0,
                                foil_price REAL DEFAULT 0,
                                tcg_normal_price REAL DEFAULT 0,
                                tcg_foil_price REAL DEFAULT 0,
                                cardmarket_normal_price REAL DEFAULT 0,
                                cardmarket_foil_price REAL DEFAULT 0,
                                cardkingdom_normal_price REAL DEFAULT 0,
                                cardkingdom_foil_price REAL DEFAULT 0,
                                cardsphere_normal_price REAL DEFAULT 0,
                                cardsphere_foil_price REAL DEFAULT 0,
                                cardhoarder_normal_price REAL DEFAULT 0,
                                cardhoarder_foil_price REAL DEFAULT 0,
                                recorded_at INTEGER NOT NULL
                            );
                        `);

                        // Last price update timestamp table
                        await tx.executeSql(`
                            CREATE TABLE IF NOT EXISTS price_update_timestamp (
                                id INTEGER PRIMARY KEY CHECK (id = 1),
                                last_update INTEGER NOT NULL
                            );
                        `);

                        // Create indices for price tables
                        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_price_history_uuid ON price_history(uuid);');
                        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp);');
                    });
                });
            }

            console.log('[AllPrintingsJsonDatabase] Price database successfully reinitialized');
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Failed to reinitialize price database:', error);
            if (error instanceof Error) {
                console.error('[AllPrintingsJsonDatabase] Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            throw error;
        }
    }

    async getCardVariants(cardName: string): Promise<ExtendedCard[]> {
        try {
            if (!this.db) {
                console.log('[AllPrintingsJsonDatabase] Database not initialized');
                return [];
            }
            
            // Get the cards with the given name, joining with sets and prices tables
            const cards = await new Promise<any[]>((resolve, reject) => {
                this.db!.transaction(tx => {
                    tx.executeSql(
                        `SELECT c.*, 
                         s.name as setName, 
                         s.code as setCode,
                         s.releaseDate as releaseDate,
                         p.normal_price, 
                         p.foil_price,
                         p.tcg_normal_price,
                         p.tcg_foil_price,
                         p.cardmarket_normal_price,
                         p.cardmarket_foil_price,
                         p.cardkingdom_normal_price,
                         p.cardkingdom_foil_price
                         FROM cards c
                         LEFT JOIN sets s ON c.setCode = s.code
                         LEFT JOIN prices p ON c.uuid = p.uuid
                         WHERE c.name = ?
                         ORDER BY s.releaseDate DESC, c.number ASC`,
                        [cardName],
                        (_, results) => {
                            const foundCards: any[] = [];
                            for (let i = 0; i < results.rows.length; i++) {
                                foundCards.push(results.rows.item(i));
                            }
                            resolve(foundCards);
                        },
                        (_, error) => {
                            console.error(`[AllPrintingsJsonDatabase] Error fetching cards by name: ${error}`);
                            reject(error);
                            return true;
                        }
                    );
                });
            });
            
            // Helper function to safely parse JSON or comma-separated strings
            const safeJsonParse = (jsonString: any, defaultValue: any = []) => {
                if (!jsonString) return defaultValue;
                if (typeof jsonString !== 'string') return jsonString;
                
                // First try to parse as JSON
                try {
                    if (jsonString.trim().startsWith('[')) {
                        return JSON.parse(jsonString);
                    }
                } catch (error) {
                    // JSON parsing failed, we'll handle below
                }
                
                // If it's not JSON or parsing failed, try to split by comma
                if (jsonString.includes(',')) {
                    return jsonString.split(',').map(item => item.trim());
                }
                
                // If it's a single value, return as a single-element array
                return [jsonString.trim()];
            };
            
            // Transform the raw cards into ExtendedCard objects
            return cards.map(card => {
                // Create prices object
                const prices = {
                    normal: card.normal_price || 0,
                    foil: card.foil_price || 0,
                    tcgplayer: {
                        normal: card.tcg_normal_price || 0,
                        foil: card.tcg_foil_price || 0
                    },
                    cardmarket: {
                        normal: card.cardmarket_normal_price || 0,
                        foil: card.cardmarket_foil_price || 0
                    }
                };
                
                // Get image URL or construct fallbacks in order of preference
                let imageUrl = card.imageUrl || '';
                
                // If no image URL is available, try constructing from scryfallId
                if (!imageUrl && card.scryfallId) {
                    imageUrl = `https://api.scryfall.com/cards/${card.scryfallId}?format=image`;
                } 
                // If still no URL, try constructing from setCode and number
                else if (!imageUrl && card.setCode && card.number) {
                    imageUrl = `https://api.scryfall.com/cards/${card.setCode.toLowerCase()}/${card.number}?format=image`;
                }
                
                // Construct a descriptive set name with code in parentheses
                const setNameWithCode = card.setName ? 
                    `${card.setName} (${card.setCode})` : 
                    card.setCode || 'Unknown Set';
                
                // Create the ExtendedCard object
                const extendedCard: ExtendedCard = {
                    id: card.id || card.uuid || '',
                    uuid: card.uuid,
                    name: card.name,
                    setCode: card.setCode || '',
                    setName: setNameWithCode,
                    collectorNumber: card.number || '',
                    type: card.type || '',
                    manaCost: card.manaCost || '',
                    text: card.text || '',
                    rarity: card.rarity || '',
                    toughness: card.toughness || '',
                    power: card.power || '',
                    imageUrl: imageUrl,
                    imageUris: {
                        normal: imageUrl,
                        small: imageUrl,
                        large: imageUrl,
                        art_crop: imageUrl
                    },
                    prices: prices,
                    purchaseUrls: {},
                    legalities: {},
                    colorIdentity: safeJsonParse(card.colorIdentity, []),
                    keywords: safeJsonParse(card.keywords, []),
                    cmc: card.cmc || 0,
                    flavorText: card.flavorText || '',
                    frameEffects: safeJsonParse(card.frameEffects, []),
                    hasNonFoil: Boolean(card.hasNonFoil),
                    hasFoil: Boolean(card.hasFoil),
                    colors: safeJsonParse(card.colors, [])
                };
                
                return extendedCard;
            });
        } catch (error) {
            console.error(`[AllPrintingsJsonDatabase] Error getting card variants: ${error}`);
            return [];
        }
    }
    

    async reopenMTGJsonDatabase(): Promise<SQLite.SQLiteDatabase> {
        console.log('[AllPrintingsJsonDatabase] Attempting to reopen MTGJson database...');
        
        // Close the existing connection if it exists but is in an error state
        if (this.db) {
            try {
                await this.db.close();
            } catch (error) {
                console.log('[AllPrintingsJsonDatabase] Error closing existing database connection:', error);
                // Continue regardless of close error
            }
            this.db = null;
        }
        
        const mtgJsonPath = AllPrintingsJsonDatabase.DB_PATH;
        
        try {
            // Check if file exists and is valid
            const exists = await RNFS.exists(mtgJsonPath);
            if (!exists) {
                throw new Error('MTGJson database file not found');
            }
            
            // Try to open the database with error handling
            this.db = await SQLite.openDatabase({
                name: mtgJsonPath,
                location: 'default'
            });
            
            // Verify we can query the database
            const [tables] = await this.db!.executeSql(
                "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1"
            );
            
            if (tables.rows.length === 0) {
                throw new Error('MTGJson database appears to be empty or corrupted');
            }
            
            console.log('[AllPrintingsJsonDatabase] Successfully reopened MTGJson database');
            return this.db;
        } catch (error) {
            console.error('[AllPrintingsJsonDatabase] Error reopening MTGJson database:', error);
            throw error;
        }
    }

    async safeMTGJsonOperation<T>(operation: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
        try {
            if (!this.db) {
                this.db = await this.reopenMTGJsonDatabase();
            }
            return await operation(this.db);
        } catch (error) {
            // If we get "already-closed" error, try to reopen and retry once
            if (error instanceof Error && 
                (error.message.includes('already-closed') || 
                 error.message.includes('attempt to re-open an already-closed object'))) {
                console.log('[AllPrintingsJsonDatabase] Handling database closed error, reopening and retrying...');
                this.db = await this.reopenMTGJsonDatabase();
                return await operation(this.db);
            }
            throw error;
        }
    };
}

export default AllPrintingsJsonDatabase;
