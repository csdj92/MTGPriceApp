import SQLite, { SQLError, ResultSet, Transaction, openDatabase } from 'react-native-sqlite-storage';
import type { ExtendedCard } from '../types/card';
import RNFS from 'react-native-fs';

SQLite.enablePromise(true);
SQLite.DEBUG(false);

export interface Collection {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    totalValue: number;
    cardCount: number;
}

export interface Card {
    uuid: string;
    name: string;
    setCode: string;
    rarity: string;
    manaCost?: string;
    type?: string;
    text?: string;
    imageUrl?: string;
    price?: number;
    priceHistory?: {
        date: string;
        price: number;
    }[];
}

export type SetInfo = {
    code: string;
    name: string;
    cardCount: number;
    highestPrice?: number;
};

interface SetCollectionStats {
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
}

let mtgJsonDb: SQLite.SQLiteDatabase | null = null;

class DatabaseService {
    private db: SQLite.SQLiteDatabase | null = null;
    private setListCache: SetInfo[] | null = null;
    private setListLastUpdate = 0;
    private readonly SET_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    private setCardsCache: { [key: string]: { cards: any[]; timestamp: number } } = {};
    private readonly CARDS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
    private expensiveCardsCache: {
        [key: string]: {
            cards: any[];
            timestamp: number;
        };
    } = {};
    private readonly EXPENSIVE_CARDS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    constructor() {
        this.initializeDatabase();
    }

    private async ensureMTGJsonDatabaseExists(): Promise<void> {
        const mtgJsonPath = '/data/data/com.mtgpriceapp/files/AllPrintings.sqlite';
        
        try {
            // Check if the file exists
            const exists = await RNFS.exists(mtgJsonPath);
            console.log('[DatabaseService] MTGJson database exists:', exists);

            if (!exists) {
                console.log('[DatabaseService] MTGJson database not found, downloading...');
                const success = await this.downloadMTGJsonDatabase();
                if (!success) {
                    throw new Error('Failed to download MTGJson database');
                }
            }

            // Try to open the database to verify it's valid
            mtgJsonDb = await SQLite.openDatabase({
                name: mtgJsonPath,
                location: 'Library',
                createFromLocation: 1
            });

            if (!mtgJsonDb) {
                throw new Error('Failed to open MTGJson database');
            }

            // Verify we can query the database
            const [tables] = await mtgJsonDb.executeSql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            );

            if (tables.rows.length === 0) {
                console.log('[DatabaseService] MTGJson database appears empty, redownloading...');
                await RNFS.unlink(mtgJsonPath);
                const success = await this.downloadMTGJsonDatabase();
                if (!success) {
                    throw new Error('Failed to download MTGJson database');
                }
            } else {
                console.log('[DatabaseService] MTGJson database tables:', 
                    Array.from({length: tables.rows.length}, (_, i) => tables.rows.item(i).name));
            }
        } catch (error) {
            console.error('[DatabaseService] Error ensuring MTGJson database exists:', error);
            throw error;
        }
    }
    // double method we have initdatabase already
    private async initializeDatabase() {
        try {
            if (mtgJsonDb) {
                return;
            }

            await this.ensureMTGJsonDatabaseExists();
            console.log('[DatabaseService] MTGJson database initialized');


            // Create price tables if needed
            await this.createPriceTables();

        } catch (error) {
            console.error('[DatabaseService] Error initializing database:', error);
            throw error;
        }
    }

    async downloadMTGJsonDatabase() {
        const mtgJsonUrl = 'https://mtgjson.com/api/v5/AllPrintings.sqlite';
        const mtgJsonPath = `${RNFS.DocumentDirectoryPath}/AllPrintings.sqlite`;

        try {
            // Download the database file
            await RNFS.downloadFile({
                fromUrl: mtgJsonUrl,
                toFile: mtgJsonPath,
                progress: (response) => {
                    const progress = (response.bytesWritten / response.contentLength) * 100;
                    console.log(`Download progress: ${progress}%`);
                },
            }).promise;

            // Open the downloaded database
            mtgJsonDb = await SQLite.openDatabase({
                name: mtgJsonPath,
                location: 'default',
                createFromLocation: 1
            });

            // Create price tables
            await this.createPriceTables();

            return true;
        } catch (error) {
            console.error('Error downloading MTGJson database:', error);
            return false;
        }
    }

    async getAllTables(): Promise<{ local: string[], mtgjson: string[] }> {
        const local = await this.db!.executeSql('SELECT name FROM sqlite_master WHERE type="table"');
        const localTables = local[0].rows.raw().map(row => row.name);

        let mtgjsonTables: string[] = [];
        if (mtgJsonDb) {
            mtgjsonTables = await this.getMTGJsonTables();
        }

        return {
            local: localTables,
            mtgjson: mtgjsonTables
        };
    }

    async getMTGJsonTables(): Promise<string[]> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }
        const tables = await mtgJsonDb.executeSql('SELECT name FROM sqlite_master WHERE type="table"');
        return tables[0].rows.raw().map(row => row.name);
    }

    async getCardDetailsByUuid(uuid: string): Promise<any> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await mtgJsonDb.executeSql(
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
                if (!item.name && mtgJsonDb) {
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

    private async createTables() {
        if (!this.db) return;

        try {

            console.log('Creating collection_cards table with correct structure...');
            
            // Create the collection_cards table with the correct structure
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS collection_cards (
                    collection_id TEXT NOT NULL,
                    card_uuid TEXT NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    added_at TEXT NOT NULL,
                    PRIMARY KEY (collection_id, card_uuid),
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
                )
            `);

            // Verify the table was created with correct structure
            const [tableInfo] = await this.db.executeSql("PRAGMA table_info('collection_cards')");
            console.log('collection_cards table structure:', tableInfo.rows.raw());

            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS cards (
                    uuid TEXT PRIMARY KEY,
                    name TEXT,
                    setCode TEXT,
                    number TEXT,
                    rarity TEXT
                )
            `);

            // ... existing table creation code ...
        } catch (error) {
            console.error('Error creating tables:', error);
            throw error;
        }
    }

    async initDatabase(): Promise<void> {
        try {
            console.log('[DatabaseService] Initializing database...');

            // Close existing connection if any
            if (this.db) {
                try {
                    await this.db.close();
                } catch (closeError) {
                    console.warn('[DatabaseService] Error closing existing database connection:', closeError);
                }
                this.db = null;
            }

            // Open or create database with retries
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    console.log(`[DatabaseService] Attempting to open database (attempt ${retryCount + 1}/${maxRetries})...`);
                    this.db = await SQLite.openDatabase({
                        name: 'mtg.db',
                        location: 'default',
                    });
                    break;
                } catch (openError) {
                    retryCount++;
                    console.error(`[DatabaseService] Failed to open database (attempt ${retryCount}/${maxRetries}):`, openError);
                    if (retryCount === maxRetries) {
                        throw openError;
                    }
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (!this.db) {
                throw new Error('[DatabaseService] Failed to open database after multiple attempts');
            }

            console.log('[DatabaseService] Database connection established');

            // Enable foreign keys
            await this.db.executeSql('PRAGMA foreign_keys = ON;');
            console.log('[DatabaseService] Foreign key constraints enabled');

            // Verify and create database structure
            await this.verifyDatabaseStructure();
            console.log('[DatabaseService] Database structure verified');

            // Verify the connection is working
            const [tables] = await this.db.executeSql("SELECT name FROM sqlite_master WHERE type='table'");
            console.log('[DatabaseService] Existing tables:', tables.rows.raw());

        } catch (error) {
            console.error('[DatabaseService] Database initialization error:', error);
            if (error instanceof Error) {
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            // Reset the database connection on error
            this.db = null;
            throw error;
        }
    }

    private async verifyDatabaseStructure(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            console.log('Verifying database structure...');

            // Enable foreign key constraints
            await this.db.executeSql('PRAGMA foreign_keys = ON;');
            console.log('Foreign key constraints enabled');

            // Create collections table if it doesn't exist
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    total_value REAL DEFAULT 0,
                    card_count INTEGER DEFAULT 0
                )
            `);
            console.log('Collections table created/verified');

            // Create collection_cache table if it doesn't exist
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS collection_cache (
                    uuid TEXT PRIMARY KEY NOT NULL,
                    card_data TEXT NOT NULL,
                    last_updated INTEGER NOT NULL
                )
            `);
            console.log('Collection_cache table created/verified');

            // Create collection_cards table if it doesn't exist
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS collection_cards (
                    collection_id TEXT NOT NULL,
                    card_uuid TEXT NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    added_at TEXT NOT NULL,
                    PRIMARY KEY (collection_id, card_uuid),
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
                )
            `);
            console.log('Collection_cards table created/verified');

            // Create scan_history table if it doesn't exist
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS scan_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_id TEXT NOT NULL,
                    card_data TEXT NOT NULL,
                    scanned_at TEXT NOT NULL,
                    added_to_collection INTEGER DEFAULT 0,
                    collection_id TEXT,
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
                )
            `);
            console.log('Scan_history table created/verified');

            // Create prices table if it doesn't exist
            await this.db.executeSql(`
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
                )
            `);
            console.log('Prices table created/verified');

            // Create price_history table if it doesn't exist
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS price_history (
                    uuid TEXT NOT NULL,
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
                    recorded_at INTEGER NOT NULL,
                    PRIMARY KEY (uuid, recorded_at),
                    FOREIGN KEY (uuid) REFERENCES prices(uuid) ON DELETE CASCADE
                )
            `);
            console.log('Price history table created/verified');

            // Create app_settings table if it doesn't exist
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY NOT NULL,
                    value TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            `);
            console.log('App settings table created/verified');


        } catch (error) {
            console.error('Database verification error:', error);
            throw error;
        }
    }

    async createCollection(name: string, description?: string): Promise<Collection> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            // Ensure collections table exists
            await this.db!.executeSql(`
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            `);

            const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
            const now = new Date().toISOString();

            console.log('Creating collection with ID:', id);

            await this.db!.transaction(async (tx) => {
                console.log('Starting transaction for collection creation');
                await tx.executeSql(
                    `INSERT INTO collections (id, name, description, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [id, name, description || null, now, now]
                );
                console.log('Insert SQL executed successfully');
            });

            const collection = {
                id,
                name,
                description: description || null,
                createdAt: now,
                updatedAt: now,
                totalValue: 0,
                cardCount: 0
            };

            console.log('Collection created successfully:', collection);
            return collection;
        } catch (error) {
            console.error('Error in createCollection:', error);
            throw error;
        }
    }

    async getCollections(): Promise<Collection[]> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            // First get basic collection info
            const results = await this.db!.executeSql(`
                SELECT 
                    c.*,
                    COUNT(cc.card_uuid) as card_count
                FROM collections c
                LEFT JOIN collection_cards cc ON c.id = cc.collection_id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
            `);

            const collections: Collection[] = [];
            for (let i = 0; i < results[0].rows.length; i++) {
                const row = results[0].rows.item(i);
                collections.push({
                    id: row.id,
                    name: row.name,
                    description: row.description,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    totalValue: 0, // We'll calculate this separately
                    cardCount: row.card_count || 0
                });
            }

            // Now get total values for each collection
            for (const collection of collections) {
                const [valueResults] = await this.db!.executeSql(`
                    SELECT 
                        COALESCE(SUM(
                            CASE 
                                WHEN JSON_VALID(cache.card_data) 
                                THEN CAST(JSON_EXTRACT(cache.card_data, '$.prices.usd') AS REAL)
                                ELSE 0 
                            END
                        ), 0) as total_value
                    FROM collection_cards cc
                    LEFT JOIN collection_cache cache ON cc.card_uuid = cache.uuid
                    WHERE cc.collection_id = ?
                `, [collection.id]);

                if (valueResults.rows.length > 0) {
                    collection.totalValue = valueResults.rows.item(0).total_value || 0;
                }
            }

            console.log('Loaded collections:', collections);
            return collections;
        } catch (error) {
            console.error('Error getting collections:', error);
            return [];
        }
    }

    async saveCollectionCache(cards: ExtendedCard[]): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            // Instead of clearing the cache, update or insert new cards
            await this.db!.transaction(async (tx) => {
                const batchSize = 20;
                for (let i = 0; i < cards.length; i += batchSize) {
                    const batch = cards.slice(i, i + batchSize);
                    for (const card of batch) {
                        await tx.executeSql(
                            'INSERT OR REPLACE INTO collection_cache (uuid, card_data, last_updated) VALUES (?, ?, ?)',
                            [card.uuid, JSON.stringify(card), Date.now()]
                        );
                    }
                }
            });
            console.log(`Collection cache updated successfully with ${cards.length} cards`);
        } catch (error) {
            console.error('Error saving collection cache:', error);
            throw error;
        }
    }

    async getCollectionCache(): Promise<ExtendedCard[]> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const results = await this.db!.executeSql(
                'SELECT card_data FROM collection_cache'
            );

            if (!results[0].rows.length) {
                return [];
            }

            const cards: ExtendedCard[] = [];
            for (let i = 0; i < results[0].rows.length; i++) {
                const row = results[0].rows.item(i);
                cards.push(JSON.parse(row.card_data));
            }

            return cards;
        } catch (error) {
            console.error('Error getting collection cache:', error);
            throw error;
        }
    }

    async getFirst100Cards(): Promise<Card[]> {
        try {
            if (!this.db) {
                console.log('Database not initialized, initializing now...');
                await this.initDatabase();
            }

            console.log('Executing query to fetch cards...');
            const results = await this.db!.executeSql(
                'SELECT uuid, name, setCode, rarity, manaCost, type, text FROM cards LIMIT 100'
            );

            if (!results || !results[0] || !results[0].rows) {
                console.error('Query returned invalid results structure:', results);
                throw new Error('Invalid query results');
            }

            const cards: Card[] = [];
            const rows = results[0].rows;
            console.log(`Query returned ${rows.length} rows`);

            for (let i = 0; i < rows.length; i++) {
                const row = rows.item(i);
                cards.push(row);
            }

            console.log(`Successfully processed ${cards.length} cards`);
            return cards;
        } catch (error) {
            console.error('Error in getFirst100Cards:', error);
            if (error instanceof Error) {
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
            }
            throw error;
        }
    }

    async closeDatabase() {
        if (this.db) {
            try {
                console.log('Closing database connection');
                await this.db.close();
                this.db = null;
                console.log('Database connection closed successfully');
            } catch (error) {
                console.error('Error closing database:', error);
                throw error;
            }
        }
    }

    async getCollectionCards(collectionId: string, page = 1, pageSize = 20): Promise<ExtendedCard[]> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const offset = (page - 1) * pageSize;
            const results = await this.db!.executeSql(
                `SELECT cache.card_data
                 FROM collection_cards cc
                 JOIN collection_cache cache ON cc.card_uuid = cache.uuid
                 WHERE cc.collection_id = ?
                 LIMIT ? OFFSET ?`,
                [collectionId, pageSize, offset]
            );

            const cards: ExtendedCard[] = [];
            for (let i = 0; i < results[0].rows.length; i++) {
                const row = results[0].rows.item(i);
                cards.push(JSON.parse(row.card_data));
            }

            return cards;
        } catch (error) {
            console.error('Error getting collection cards:', error);
            return [];
        }
    }

    async addCardToCollection(cardUuid: string, collectionId: string): Promise<void> {
        if (!cardUuid) {
            throw new Error('Card UUID is required');
        }
        if (!collectionId) {
            throw new Error('Collection ID is required');
        }

        console.log(`[DatabaseService] Adding card ${cardUuid} to collection ${collectionId}`);

        try {
            // Ensure database is initialized
            if (!this.db) {
                console.log('[DatabaseService] Database not initialized, initializing now...');
                await this.initDatabase();
                if (!this.db) {
                    throw new Error('Failed to initialize database');
                }
            }

            // Ensure MTGJson database is initialized
            if (!mtgJsonDb) {
                console.log('[DatabaseService] MTGJson database not initialized, initializing now...');
                await this.initializeDatabase();
                if (!mtgJsonDb) {
                    throw new Error('Failed to initialize MTGJson database');
                }
            }

            const now = new Date().toISOString();

            // First check if the card exists and get its current quantity
            const [existingCardResult] = await this.db.executeSql(
                'SELECT quantity FROM collection_cards WHERE collection_id = ? AND card_uuid = ?',
                [collectionId, cardUuid]
            );

            await this.db.transaction(async (tx) => {
                if (existingCardResult.rows.length > 0) {
                    // Card exists, get current quantity and increment
                    const currentQuantity = existingCardResult.rows.item(0).quantity;
                    const newQuantity = currentQuantity + 1;
                    console.log(`[DatabaseService] Updating quantity from ${currentQuantity} to ${newQuantity}`);
                    
                    await tx.executeSql(
                        'UPDATE collection_cards SET quantity = ?, added_at = ? WHERE collection_id = ? AND card_uuid = ?',
                        [newQuantity, now, collectionId, cardUuid]
                    );
                    console.log(`[DatabaseService] Incremented quantity for existing card in collection`);
                } else {
                    // New card, add with quantity 1
                    await tx.executeSql(
                        'INSERT INTO collection_cards (collection_id, card_uuid, quantity, added_at) VALUES (?, ?, 1, ?)',
                        [collectionId, cardUuid, now]
                    );
                    console.log(`[DatabaseService] Added new card to collection_cards table`);
                }

                // Update collection stats
                await tx.executeSql(
                    'UPDATE collections SET updated_at = ? WHERE id = ?',
                    [now, collectionId]
                );
                console.log(`[DatabaseService] Collection stats updated`);
            });

            // Verify the update
            const [verifyResult] = await this.db.executeSql(
                'SELECT quantity FROM collection_cards WHERE collection_id = ? AND card_uuid = ?',
                [collectionId, cardUuid]
            );
            if (verifyResult.rows.length > 0) {
                console.log(`[DatabaseService] Card quantity is now: ${verifyResult.rows.item(0).quantity}`);
            }

            console.log(`[DatabaseService] Card successfully added to collection`);
        } catch (error) {
            console.error('[DatabaseService] Error adding card to collection:', error);
            if (error instanceof Error) {
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            throw error;
        }
    }

    async markScannedCardAddedToCollection(cardId: string, collectionId: string): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            await this.db!.executeSql(
                `UPDATE scan_history 
                 SET added_to_collection = ?, collection_id = ?
                 WHERE card_id = ?`,
                [1, collectionId, cardId]
            );
        } catch (error) {
            console.error('Error marking scanned card as added:', error);
            throw error;
        }
    }

    async addToScanHistory(card: ExtendedCard): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const now = new Date().toISOString();
            await this.db!.executeSql(
                `INSERT INTO scan_history (card_id, card_data, scanned_at)
                 VALUES (?, ?, ?)`,
                [card.id, JSON.stringify(card), now]
            );
        } catch (error) {
            console.error('Error adding to scan history:', error);
            throw error;
        }
    }

    async getScanHistory(): Promise<ExtendedCard[]> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const results = await this.db!.executeSql(
                `SELECT card_data FROM scan_history 
                 ORDER BY scanned_at DESC`
            );

            const cards: ExtendedCard[] = [];
            for (let i = 0; i < results[0].rows.length; i++) {
                const row = results[0].rows.item(i);
                cards.push(JSON.parse(row.card_data));
            }
            return cards;
        } catch (error) {
            console.error('Error getting scan history:', error);
            return [];
        }
    }

    async addToCache(card: ExtendedCard): Promise<ExtendedCard> {
        if (!this.db || !mtgJsonDb) {
            await this.initDatabase();
            await this.initializeDatabase();
            if (!this.db || !mtgJsonDb) {
                throw new Error('Failed to initialize databases');
            }
        }

        try {
            // First, try to find the card in MTGJson database to get the correct UUID
            const [mtgJsonCard] = await mtgJsonDb.executeSql(`
                SELECT uuid 
                FROM cards 
                WHERE name = ? AND setCode = ?
            `, [card.name, card.setCode]);

            if (mtgJsonCard.rows.length > 0) {
                // Use the UUID from MTGJson
                card.uuid = mtgJsonCard.rows.item(0).uuid;
            } else if (!card.uuid && card.id) {
                // Fallback to using id if MTGJson lookup fails
                card.uuid = card.id;
            }

            if (!card.uuid) {
                throw new Error('Card must have either uuid or id field');
            }

            await this.db.executeSql(
                'INSERT OR REPLACE INTO collection_cache (uuid, card_data, last_updated) VALUES (?, ?, ?)',
                [card.uuid, JSON.stringify(card), Date.now()]
            );

            return card;
        } catch (error) {
            console.error('[DatabaseService] Error adding card to cache:', error);
            throw error;
        }
    }

    private async cleanupOldPriceHistory(): Promise<void> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            await mtgJsonDb.executeSql(
                'DELETE FROM price_history WHERE recorded_at < ?',
                [thirtyDaysAgo]
            );
            console.log('[DatabaseService] Cleaned up price history older than 30 days');
        } catch (error) {
            console.error('[DatabaseService] Error cleaning up old price history:', error);
            throw error;
        }
    }

    async updatePrices(priceData: Record<string, { 
        normal: number; 
        foil: number;
        tcg_normal?: number;
        tcg_foil?: number;
        cardmarket_normal?: number;
        cardmarket_foil?: number;
        cardkingdom_normal?: number;
        cardkingdom_foil?: number;
        cardsphere_normal?: number;
        cardsphere_foil?: number;
        cardhoarder_normal?: number;
        cardhoarder_foil?: number;
    }>): Promise<void> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        const now = Date.now();
        const totalCards = Object.keys(priceData).length;
        console.log(`[DatabaseService] Processing ${totalCards} cards`);

        try {
            // First, clean up old price history
            await this.cleanupOldPriceHistory();

            // Check if we already have a price entry for today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = today.getTime();

            const [existingEntry] = await mtgJsonDb.executeSql(
                `SELECT COUNT(*) as count 
                 FROM price_history 
                 WHERE recorded_at >= ?`,
                [todayTimestamp]
            );

            if (existingEntry.rows.item(0).count > 0) {
                console.log('[DatabaseService] Price history already recorded for today, skipping history update');
                // Still update current prices
                const batchSize = 1000;
                const entries = Object.entries(priceData);
                let processedCount = 0;

                for (let i = 0; i < entries.length; i += batchSize) {
                    const batch = entries.slice(i, i + batchSize);
                    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                    const values: any[] = [];

                    batch.forEach(([uuid, prices]) => {
                        values.push(
                            uuid, prices.normal, prices.foil,
                            prices.tcg_normal || 0, prices.tcg_foil || 0,
                            prices.cardmarket_normal || 0, prices.cardmarket_foil || 0,
                            prices.cardkingdom_normal || 0, prices.cardkingdom_foil || 0,
                            prices.cardsphere_normal || 0, prices.cardsphere_foil || 0,
                            prices.cardhoarder_normal || 0, prices.cardhoarder_foil || 0,
                            now
                        );
                    });

                    await mtgJsonDb.executeSql(
                        `INSERT OR REPLACE INTO prices (
                            uuid, normal_price, foil_price,
                            tcg_normal_price, tcg_foil_price,
                            cardmarket_normal_price, cardmarket_foil_price,
                            cardkingdom_normal_price, cardkingdom_foil_price,
                            cardsphere_normal_price, cardsphere_foil_price,
                            cardhoarder_normal_price, cardhoarder_foil_price,
                            last_updated
                        ) VALUES ${placeholders}`,
                        values
                    );

                    processedCount += batch.length;
                    console.log(`[DatabaseService] Processed ${processedCount}/${totalCards} cards`);
                }
            } else {
                // Process in batches with both current prices and history
                const batchSize = 1000;
                const entries = Object.entries(priceData);
                let processedCount = 0;

                for (let i = 0; i < entries.length; i += batchSize) {
                    const batch = entries.slice(i, i + batchSize);
                    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                    const values: any[] = [];

                    batch.forEach(([uuid, prices]) => {
                        values.push(
                            uuid, prices.normal, prices.foil,
                            prices.tcg_normal || 0, prices.tcg_foil || 0,
                            prices.cardmarket_normal || 0, prices.cardmarket_foil || 0,
                            prices.cardkingdom_normal || 0, prices.cardkingdom_foil || 0,
                            prices.cardsphere_normal || 0, prices.cardsphere_foil || 0,
                            prices.cardhoarder_normal || 0, prices.cardhoarder_foil || 0,
                            now
                        );
                    });

                    await mtgJsonDb.transaction((tx) => {
                        // Update current prices
                        tx.executeSql(
                            `INSERT OR REPLACE INTO prices (
                                uuid, normal_price, foil_price,
                                tcg_normal_price, tcg_foil_price,
                                cardmarket_normal_price, cardmarket_foil_price,
                                cardkingdom_normal_price, cardkingdom_foil_price,
                                cardsphere_normal_price, cardsphere_foil_price,
                                cardhoarder_normal_price, cardhoarder_foil_price,
                                last_updated
                            ) VALUES ${placeholders}`,
                            values
                        );

                        // Add to price history
                        const historyPlaceholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                        const historyValues: any[] = [];
                        
                        batch.forEach(([uuid, prices]) => {
                            historyValues.push(
                                uuid, prices.normal, prices.foil,
                                prices.tcg_normal || 0, prices.tcg_foil || 0,
                                prices.cardmarket_normal || 0, prices.cardmarket_foil || 0,
                                prices.cardkingdom_normal || 0, prices.cardkingdom_foil || 0,
                                prices.cardsphere_normal || 0, prices.cardsphere_foil || 0,
                                todayTimestamp // Use start of day timestamp for consistent daily records
                            );
                        });

                        tx.executeSql(
                            `INSERT INTO price_history (
                                uuid, normal_price, foil_price,
                                tcg_normal_price, tcg_foil_price,
                                cardmarket_normal_price, cardmarket_foil_price,
                                cardkingdom_normal_price, cardkingdom_foil_price,
                                cardsphere_normal_price, cardsphere_foil_price,
                                recorded_at
                            ) VALUES ${historyPlaceholders}`,
                            historyValues
                        );
                    });

                    processedCount += batch.length;
                    console.log(`[DatabaseService] Processed ${processedCount}/${totalCards} cards`);
                }
            }

            await mtgJsonDb.executeSql(
                `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
                 VALUES ('last_price_update', ?, ?)`,
                [now.toString(), now]
            );

            const [verifyResult] = await mtgJsonDb.executeSql('SELECT COUNT(*) as count FROM prices');
            console.log(`[DatabaseService] Updated prices: ${verifyResult.rows.item(0).count} records`);

        } catch (error) {
            console.error('[DatabaseService] Error updating prices:', error);
            throw error;
        }
    }

    async getCardPriceHistory(uuid: string): Promise<{
        date: string;
        normal: number;
        foil: number;
        tcgplayer: { normal: number; foil: number };
        cardmarket: { normal: number; foil: number };
        cardkingdom: { normal: number; foil: number };
        cardsphere: { normal: number; foil: number };
    }[]> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await mtgJsonDb.executeSql(
                `SELECT 
                    normal_price, foil_price,
                    tcg_normal_price, tcg_foil_price,
                    cardmarket_normal_price, cardmarket_foil_price,
                    cardkingdom_normal_price, cardkingdom_foil_price,
                    cardsphere_normal_price, cardsphere_foil_price,
                    recorded_at
                FROM price_history
                WHERE uuid = ?
                ORDER BY recorded_at DESC
                LIMIT 30`,
                [uuid]
            );

            return result.rows.raw().map(row => ({
                date: new Date(row.recorded_at).toISOString().split('T')[0],
                normal: parseFloat(row.normal_price) || 0,
                foil: parseFloat(row.foil_price) || 0,
                tcgplayer: {
                    normal: parseFloat(row.tcg_normal_price) || 0,
                    foil: parseFloat(row.tcg_foil_price) || 0
                },
                cardmarket: {
                    normal: parseFloat(row.cardmarket_normal_price) || 0,
                    foil: parseFloat(row.cardmarket_foil_price) || 0
                },
                cardkingdom: {
                    normal: parseFloat(row.cardkingdom_normal_price) || 0,
                    foil: parseFloat(row.cardkingdom_foil_price) || 0
                },
                cardsphere: {
                    normal: parseFloat(row.cardsphere_normal_price) || 0,
                    foil: parseFloat(row.cardsphere_foil_price) || 0
                }
            }));
        } catch (error) {
            console.error('[DatabaseService] Error getting card price history:', error);
            return [];
        }
    }

    async getCardPriceHistoryStats(uuid: string): Promise<{
        maxPrice: number;
        minPrice: number;
        avgPrice: number;
        priceChange30d: number;
        priceChange7d: number;
        maxFoilPrice: number;
        minFoilPrice: number;
        avgFoilPrice: number;
        foilPriceChange30d: number;
        foilPriceChange7d: number;
    }> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const history = await this.getCardPriceHistory(uuid);
            if (history.length === 0) {
                return {
                    maxPrice: 0,
                    minPrice: 0,
                    avgPrice: 0,
                    priceChange30d: 0,
                    priceChange7d: 0,
                    maxFoilPrice: 0,
                    minFoilPrice: 0,
                    avgFoilPrice: 0,
                    foilPriceChange30d: 0,
                    foilPriceChange7d: 0
                };
            }

            const normalPrices = history.map(h => h.normal).filter(p => p > 0);
            const foilPrices = history.map(h => h.foil).filter(p => p > 0);

            const stats = {
                maxPrice: Math.max(...normalPrices, 0),
                minPrice: Math.min(...normalPrices.filter(p => p > 0), normalPrices[0] || 0),
                avgPrice: normalPrices.length ? normalPrices.reduce((a, b) => a + b, 0) / normalPrices.length : 0,
                priceChange30d: normalPrices.length >= 2 ? normalPrices[0] - normalPrices[normalPrices.length - 1] : 0,
                priceChange7d: normalPrices.length >= 8 ? normalPrices[0] - normalPrices[Math.min(7, normalPrices.length - 1)] : 0,
                maxFoilPrice: Math.max(...foilPrices, 0),
                minFoilPrice: Math.min(...foilPrices.filter(p => p > 0), foilPrices[0] || 0),
                avgFoilPrice: foilPrices.length ? foilPrices.reduce((a, b) => a + b, 0) / foilPrices.length : 0,
                foilPriceChange30d: foilPrices.length >= 2 ? foilPrices[0] - foilPrices[foilPrices.length - 1] : 0,
                foilPriceChange7d: foilPrices.length >= 8 ? foilPrices[0] - foilPrices[Math.min(7, foilPrices.length - 1)] : 0
            };

            return stats;
        } catch (error) {
            console.error('[DatabaseService] Error getting card price history stats:', error);
            return {
                maxPrice: 0,
                minPrice: 0,
                avgPrice: 0,
                priceChange30d: 0,
                priceChange7d: 0,
                maxFoilPrice: 0,
                minFoilPrice: 0,
                avgFoilPrice: 0,
                foilPriceChange30d: 0,
                foilPriceChange7d: 0
            };
        }
    }

    async shouldUpdatePrices(force: boolean = false): Promise<boolean> {
        if (force) {
            console.log('[DatabaseService] Force update requested, bypassing time check');
            return true;
        }

        const lastUpdate = await this.getLastPriceUpdate();
        if (!lastUpdate) {
            console.log('[DatabaseService] No previous update found, update needed');
            return true;
        }

        const now = new Date();
        const lastUpdateDate = new Date(lastUpdate);
        const hoursSinceLastUpdate = (now.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60);
        
        console.log(`[DatabaseService] Hours since last update: ${hoursSinceLastUpdate}`);
        return hoursSinceLastUpdate >= 24;
    }

    async getPriceData(page: number, pageSize: number): Promise<{ uuid: string; normal_price: number; foil_price: number; last_updated: number; }[]> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const offset = (page - 1) * pageSize;
            const [result] = await mtgJsonDb.executeSql(`
                SELECT uuid, normal_price, foil_price, last_updated 
                FROM prices 
                ORDER BY last_updated DESC
                LIMIT ? OFFSET ?
            `, [pageSize, offset]);

            const prices = [];
            for (let i = 0; i < result.rows.length; i++) {
                prices.push(result.rows.item(i));
            }
            return prices;
        } catch (error) {
            console.error('Error getting price data:', error);
            return [];
        }
    }

    public isMTGJsonDatabaseInitialized(): boolean {
        return mtgJsonDb !== null;
    }

    async getMTGJsonTable(tableName: string | undefined, limit: number = 100): Promise<any[]> {
        if (!mtgJsonDb || !tableName) {
            throw new Error('MTGJson database not initialized or invalid table name');
        }
        const [result] = await mtgJsonDb.executeSql(
            `SELECT * FROM ${tableName} LIMIT ?`,
            [limit]
        );
        return result.rows.raw();
    }

    async getAllCardsBySet(setCode: string, pageSize: number, offset: number): Promise<any[]> {
        if (!mtgJsonDb) {
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
            const [result] = await mtgJsonDb.executeSql(`
                SELECT 
                    c.uuid, 
                    c.name, 
                    c.setCode,
                    c.number, 
                    c.rarity,
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
                ORDER BY c.number ASC
                LIMIT ? OFFSET ?
            `, [setCode.toUpperCase(), pageSize, offset]);

            const cards = result.rows.raw().map(card => ({
                uuid: card.uuid,
                name: card.name,
                setCode: card.setCode,
                number: card.number,
                rarity: card.rarity,
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
            }));

            // Cache the results
            this.setCardsCache[cacheKey] = {
                cards,
                timestamp: Date.now()
            };

            return cards;
        } catch (error) {
            console.error('[DatabaseService] Error getting cards by set:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                setCode,
                pageSize,
                offset
            });
            return [];
        }
    }

    async getLastPriceUpdate(): Promise<number | null> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await mtgJsonDb.executeSql(
                `SELECT value FROM app_settings WHERE key = 'last_price_update'`
            );

            if (result.rows.length === 0) {
                console.log('[DatabaseService] No previous price check found');
                return null;
            }

            const lastCheck = parseInt(result.rows.item(0).value);
            console.log(`[DatabaseService] Last price check: ${new Date(lastCheck).toISOString()}`);
            return lastCheck;
        } catch (error) {
            console.error('[DatabaseService] Error checking last price update:', error);
            return null;
        }
    }

    private async createPriceTables(): Promise<void> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            // Check if tables already exist
            const [tableCheck] = await mtgJsonDb.executeSql(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND (name='prices' OR name='price_history' OR name='app_settings')
            `);

            if (tableCheck.rows.length === 3) {
                console.log('[DatabaseService] Price and settings tables already exist, skipping creation');
                return;
            }

            console.log('[DatabaseService] Creating price and settings tables...');

            // Create app_settings table
            await mtgJsonDb.executeSql(`
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY NOT NULL,
                    value TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            `);
            console.log('[DatabaseService] App settings table created');

            // Create price-related tables only if they don't exist
            await mtgJsonDb.executeSql(`
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
                )
            `);
            console.log('[DatabaseService] Prices table created');

            await mtgJsonDb.executeSql(`
                CREATE TABLE IF NOT EXISTS price_history (
                    uuid TEXT NOT NULL,
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
                    recorded_at INTEGER NOT NULL,
                    PRIMARY KEY (uuid, recorded_at),
                    FOREIGN KEY (uuid) REFERENCES prices(uuid) ON DELETE CASCADE
                )
            `);
            console.log('[DatabaseService] Price history table created');

            // Add indexes for better query performance
            await mtgJsonDb.executeSql(`
                CREATE INDEX IF NOT EXISTS idx_prices_last_updated ON prices(last_updated);
                CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);
                CREATE INDEX IF NOT EXISTS idx_prices_normal ON prices(normal_price);
                CREATE INDEX IF NOT EXISTS idx_prices_foil ON prices(foil_price);
                CREATE INDEX IF NOT EXISTS idx_price_history_normal ON price_history(normal_price);
                CREATE INDEX IF NOT EXISTS idx_price_history_foil ON price_history(foil_price);
                CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
            `);

            console.log('[DatabaseService] Price tables and indexes created successfully');
        } catch (error) {
            console.error('[DatabaseService] Error creating price tables:', error);
            if (error instanceof Error) {
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            throw error;
        }
    }

    async getPriceCount(): Promise<number> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await mtgJsonDb.executeSql(
                'SELECT COUNT(*) as count FROM prices'
            );
            return result.rows.item(0).count;
        } catch (error) {
            console.error('[DatabaseService] Error getting price count:', error);
            return 0;
        }
    }

    async verifyDatabaseState(): Promise<boolean> {
        try {
            if (!mtgJsonDb) {
                console.log('[DatabaseService] MTGJson database not initialized, attempting to initialize...');
                await this.initializeDatabase();
            }

            // Verify we can query the database
            const [result] = await mtgJsonDb!.executeSql('SELECT COUNT(*) as count FROM prices');
            const count = result.rows.item(0).count;
            console.log(`[DatabaseService] Found ${count} price entries in database`);

            if (count === 0) {
                console.log('[DatabaseService] No prices found in database, might need to refresh price data');
                return false;
            }

            return true;
        } catch (error) {
            console.error('[DatabaseService] Database state verification failed:', error);
            return false;
        }
    }

    async reinitializePrices(): Promise<void> {
        try {
            console.log('[DatabaseService] Starting price database reinitialization...');

            // Ensure MTGJson database is initialized
            if (!mtgJsonDb) {
                console.log('[DatabaseService] MTGJson database not initialized, initializing...');
                await this.initializeDatabase();
                if (!mtgJsonDb) {
                    throw new Error('Failed to initialize MTGJson database');
                }
            }

            // Drop existing price-related tables
            console.log('[DatabaseService] Dropping existing price tables...');
            await mtgJsonDb.executeSql('DROP TABLE IF EXISTS price_history');
            await mtgJsonDb.executeSql('DROP TABLE IF EXISTS prices');
            await mtgJsonDb.executeSql('DROP TABLE IF EXISTS app_settings');

            // Recreate tables
            console.log('[DatabaseService] Recreating price tables...');
            await this.createPriceTables();

            console.log('[DatabaseService] Price database successfully reinitialized');
        } catch (error) {
            console.error('[DatabaseService] Failed to reinitialize price database:', error);
            if (error instanceof Error) {
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            throw error;
        }
    }

    // print all the rows in the cards table debug
    async printTenCardsRows(): Promise<void> {
        const [result] = await mtgJsonDb!.executeSql('SELECT * FROM cards LIMIT 10');
        console.log('[DatabaseService] All cards:', JSON.stringify(result.rows.raw(), null, 2));
    }

    async getMostExpensiveCards(pageSize: number, offset: number, sortBy: 'normal_price' | 'foil_price'): Promise<any[]> {
        if (!mtgJsonDb) {
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
            await mtgJsonDb.executeSql(`
                CREATE INDEX IF NOT EXISTS idx_prices_normal ON prices(normal_price);
                CREATE INDEX IF NOT EXISTS idx_prices_foil ON prices(foil_price);
            `);

            const [result] = await mtgJsonDb.executeSql(`
                SELECT 
                    c.uuid,
                    c.name,
                    c.setCode,
                    c.number,
                    c.rarity,
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
            `, [pageSize, offset]);

            const cards = result.rows.raw().map(card => ({
                uuid: card.uuid,
                name: card.name,
                setCode: card.setCode,
                number: card.number,
                rarity: card.rarity,
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
            }));

            // Cache the results
            this.expensiveCardsCache[cacheKey] = {
                cards,
                timestamp: Date.now()
            };

            return cards;
        } catch (error) {
            console.error('[DatabaseService] Error getting most expensive cards:', {
                message: error instanceof Error ? error.message : 'Unknown error',
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

        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            // Use a more efficient JOIN instead of a subquery
            // Add indexes if they don't exist
            await mtgJsonDb.executeSql(`
                CREATE INDEX IF NOT EXISTS idx_cards_setcode ON cards(setCode);
                CREATE INDEX IF NOT EXISTS idx_sets_code ON sets(code);
                CREATE INDEX IF NOT EXISTS idx_sets_releasedate ON sets(releaseDate);
            `);

            const [result] = await mtgJsonDb.executeSql(`
                SELECT 
                    s.code as setCode,
                    s.name as setName,
                    s.releaseDate,
                    COUNT(c.uuid) as cardCount
                FROM sets s
                LEFT JOIN cards c ON s.code = c.setCode
                GROUP BY s.code, s.name, s.releaseDate
                ORDER BY s.releaseDate DESC, s.name ASC
            `);

            const sets: SetInfo[] = result.rows.raw().map(row => ({
                code: row.setCode || '',
                name: row.setName || row.setCode || '',
                releaseDate: row.releaseDate,
                cardCount: row.cardCount
            }));

            // Update cache with a longer duration since set data rarely changes
            this.setListCache = sets;
            this.setListLastUpdate = Date.now();

            return sets;
        } catch (error) {
            console.error('[DatabaseService] Error getting set list:', error);
            // Return cached data even if expired in case of error
            if (this.setListCache) {
                return this.setListCache;
            }
            return [];
        }
    }

    async clearSetListCache(): Promise<void> {
        this.setListCache = null;
        this.setListLastUpdate = 0;
        console.log('[DatabaseService] Set list cache cleared');
    }

    async getSetCollections(): Promise<(Collection & SetCollectionStats)[]> {
        try {
            console.log('[DatabaseService] Starting to get set collections...');

            // Ensure main database is initialized
            if (!this.db) {
                console.log('[DatabaseService] Main database not initialized, initializing...');
                await this.initDatabase();
                if (!this.db) {
                    throw new Error('Failed to initialize main database');
                }
            }

            // Ensure MTGJson database is initialized
            if (!mtgJsonDb) {
                console.log('[DatabaseService] MTGJson database not initialized, initializing...');
                await this.initializeDatabase();
                if (!mtgJsonDb) {
                    throw new Error('Failed to initialize MTGJson database');
                }
            }        

            // Ensure cache is populated
            await this.ensureCollectionCachePopulated();

            console.log('[DatabaseService] Getting set-based collections...');
            // Get all collections that are set-based (name starts with 'Set: ')
            const [collections] = await this.db.executeSql(
                `SELECT * FROM collections WHERE name LIKE 'Set: %' ORDER BY name`
            );

            console.log(`[DatabaseService] Found ${collections.rows.length} set collections`);

            const setCollections: (Collection & SetCollectionStats)[] = [];

            for (let i = 0; i < collections.rows.length; i++) {
                const collection = collections.rows.item(i);
                
                // Extract set code from description which is in format "Collection for [setName] ([setCode])"
                const setCodeMatch = collection.description?.match(/\(([^)]+)\)$/);
                const setCode = setCodeMatch ? setCodeMatch[1] : '';

                console.log(`[DatabaseService] Processing set collection: ${collection.name} (${setCode})`);

                try {
                    // Get total unique cards in set from MTGJson database, grouping by collector number
                    const [totalResult] = await mtgJsonDb.executeSql(`
                        WITH CardGroups AS (
                            SELECT 
                                number,
                                MIN(CASE WHEN side = 'a' THEN uuid ELSE NULL END) as front_uuid,
                                MIN(CASE WHEN side != 'a' OR side IS NULL THEN uuid ELSE NULL END) as back_uuid
                            FROM cards 
                            WHERE setCode = ?
                            GROUP BY number
                        )
                        SELECT COUNT(*) as total 
                        FROM CardGroups
                    `, [setCode]);
                    
                    const totalCards = totalResult.rows.item(0).total;

                    // Get collected cards count and total value
                    const [collectedResult] = await this.db.executeSql(
                        `SELECT 
                            COUNT(*) as collected,
                            SUM(CASE 
                                WHEN JSON_VALID(cache.card_data) 
                                THEN CAST(JSON_EXTRACT(cache.card_data, '$.prices.usd') AS REAL)
                                ELSE 0 
                            END) as total_value
                        FROM collection_cards cc
                        LEFT JOIN collection_cache cache ON cc.card_uuid = cache.uuid
                        WHERE cc.collection_id = ?`,
                        [collection.id]
                    );
                    const collectedCards = collectedResult.rows.item(0).collected;
                    const totalValue = collectedResult.rows.item(0).total_value || 0;


                    // Calculate completion percentage
                    const completionPercentage = totalCards > 0 ? (collectedCards / totalCards) * 100 : 0;

                    setCollections.push({
                        ...collection,
                        totalCards,
                        collectedCards,
                        completionPercentage,
                        totalValue
                    });
                } catch (collectionError) {
                    console.error(`[DatabaseService] Error processing collection ${collection.name}:`, collectionError);
                    // Continue with next collection instead of failing completely
                    setCollections.push({
                        ...collection,
                        totalCards: 0,
                        collectedCards: 0,
                        completionPercentage: 0,
                        totalValue: 0
                    });
                }
            }

            console.log(`[DatabaseService] Successfully retrieved ${setCollections.length} set collections`);
            return setCollections;
        } catch (error) {
            console.error('[DatabaseService] Error getting set collections:', error);
            if (error instanceof Error) {
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            // Return empty array instead of throwing to prevent UI crashes
            return [];
        }
    }

    async getOrCreateSetCollection(setCode: string, setName: string): Promise<string> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            // First, try to find an existing collection by set code
            const collectionName = `Set: ${setName}`;
            const [existingCollection] = await this.db!.executeSql(
                'SELECT id FROM collections WHERE name = ? OR description LIKE ?',
                [collectionName, `%${setCode})`]
            );

            if (existingCollection.rows.length > 0) {
                return existingCollection.rows.item(0).id;
            }

            // Create a new collection with the set name
            const description = `Collection for ${setName} (${setCode})`;
            const collection = await this.createCollection(collectionName, description);
            return collection.id;
        } catch (error) {
            console.error('Error getting/creating set collection:', error);
            throw error;
        }
    }

    async verifyPriceDataIntegrity(): Promise<{
        isValid: boolean;
        issues: string[];
        totalPrices: number;
        totalHistory: number;
        daysOfHistory: number;
        lastUpdate: Date | null;
    }> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        const issues: string[] = [];
        try {
            // Check total number of prices
            const [pricesResult] = await mtgJsonDb.executeSql(
                'SELECT COUNT(*) as count FROM prices'
            );
            const totalPrices = pricesResult.rows.item(0).count;

            // Check total number of history records
            const [historyResult] = await mtgJsonDb.executeSql(
                'SELECT COUNT(*) as count FROM price_history'
            );
            const totalHistory = historyResult.rows.item(0).count;

            // Check number of days of history
            const [daysResult] = await mtgJsonDb.executeSql(
                "SELECT COUNT(DISTINCT DATE(recorded_at/1000, 'unixepoch')) as days FROM price_history"
            );
            const daysOfHistory = daysResult.rows.item(0).days;

            // Check last update
            const [lastUpdateResult] = await mtgJsonDb.executeSql(
                'SELECT MAX(last_updated) as last_update FROM prices'
            );
            const lastUpdate = lastUpdateResult.rows.item(0).last_update ? 
                new Date(lastUpdateResult.rows.item(0).last_update) : null;

            // Check for orphaned history records
            const [orphanedResult] = await mtgJsonDb.executeSql(`
                SELECT COUNT(*) as count 
                FROM price_history ph 
                LEFT JOIN prices p ON ph.uuid = p.uuid 
                WHERE p.uuid IS NULL
            `);
            const orphanedRecords = orphanedResult.rows.item(0).count;
            if (orphanedRecords > 0) {
                issues.push(`Found ${orphanedRecords} orphaned history records`);
            }

            // Check for cards with missing history
            const [missingHistoryResult] = await mtgJsonDb.executeSql(`
                SELECT COUNT(*) as count 
                FROM prices p 
                LEFT JOIN price_history ph ON p.uuid = ph.uuid 
                WHERE ph.uuid IS NULL
            `);
            const missingHistory = missingHistoryResult.rows.item(0).count;
            if (missingHistory > 0) {
                issues.push(`Found ${missingHistory} cards with no price history`);
            }

            return {
                isValid: issues.length === 0,
                issues,
                totalPrices,
                totalHistory,
                daysOfHistory,
                lastUpdate
            };
        } catch (error) {
            console.error('[DatabaseService] Error verifying price data integrity:', error);
            return {
                isValid: false,
                issues: ['Failed to verify price data integrity'],
                totalPrices: 0,
                totalHistory: 0,
                daysOfHistory: 0,
                lastUpdate: null
            };
        }
    }

    async debugPriceHistory(uuid: string): Promise<void> {
        if (!mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            // Get card name first
            const [cardResult] = await mtgJsonDb.executeSql(
                'SELECT name FROM cards WHERE uuid = ?',
                [uuid]
            );
            const cardName = cardResult.rows.length > 0 ? cardResult.rows.item(0).name : 'Unknown Card';

            // Get price history with formatted dates
            const [result] = await mtgJsonDb.executeSql(`
                SELECT 
                    datetime(recorded_at/1000, 'unixepoch') as date,
                    normal_price,
                    foil_price,
                    tcg_normal_price,
                    tcg_foil_price,
                    cardmarket_normal_price,
                    cardmarket_foil_price
                FROM price_history
                WHERE uuid = ?
                ORDER BY recorded_at DESC
                LIMIT 30
            `, [uuid]);

            console.log(`\nPrice History for ${cardName} (${uuid}):`);
            console.log('Date       | Normal  | Foil    | TCG     | TCG Foil| CardMkt | CardMkt Foil');
            console.log('-----------|---------|---------|---------|---------|---------|-------------');
            
            for (let i = 0; i < result.rows.length; i++) {
                const row = result.rows.item(i);
                console.log(
                    `${row.date.split(' ')[0]} | ` +
                    `$${row.normal_price.toFixed(2).padStart(7)} | ` +
                    `$${row.foil_price.toFixed(2).padStart(7)} | ` +
                    `$${row.tcg_normal_price.toFixed(2).padStart(7)} | ` +
                    `$${row.tcg_foil_price.toFixed(2).padStart(7)} | ` +
                    `$${row.cardmarket_normal_price.toFixed(2).padStart(7)} | ` +
                    `$${row.cardmarket_foil_price.toFixed(2).padStart(7)}`
                );
            }

            // Get some basic stats
            const [statsResult] = await mtgJsonDb.executeSql(`
                SELECT 
                    COUNT(DISTINCT DATE(recorded_at/1000, 'unixepoch')) as days,
                    MIN(normal_price) as min_price,
                    MAX(normal_price) as max_price,
                    AVG(normal_price) as avg_price
                FROM price_history
                WHERE uuid = ?
            `, [uuid]);

            const stats = statsResult.rows.item(0);
            console.log('\nStats:');
            console.log(`Days of history: ${stats.days}`);
            console.log(`Price range: $${stats.min_price.toFixed(2)} - $${stats.max_price.toFixed(2)}`);
            console.log(`Average price: $${stats.avg_price.toFixed(2)}`);

        } catch (error) {
            console.error('[DatabaseService] Error debugging price history:', error);
        }
    }

    async ensureCollectionCachePopulated(): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            // Find cards in collection_cards that aren't in the cache
            const [missingCards] = await this.db!.executeSql(`
                SELECT DISTINCT cc.card_uuid 
                FROM collection_cards cc 
                LEFT JOIN collection_cache cache ON cc.card_uuid = cache.uuid 
                WHERE cache.uuid IS NULL
            `);

            if (missingCards.rows.length > 0) {
                console.log(`Found ${missingCards.rows.length} cards missing from cache, repopulating...`);
                
                // Get card data from MTGJson database
                for (let i = 0; i < missingCards.rows.length; i++) {
                    const cardUuid = missingCards.rows.item(i).card_uuid;
                    const [cardResult] = await mtgJsonDb!.executeSql(`
                        SELECT c.*, 
                            p.normal_price, p.foil_price,
                            p.tcg_normal_price, p.tcg_foil_price,
                            p.cardmarket_normal_price, p.cardmarket_foil_price
                        FROM cards c
                        LEFT JOIN prices p ON c.uuid = p.uuid
                        WHERE c.uuid = ?
                    `, [cardUuid]);

                    if (cardResult.rows.length > 0) {
                        const cardData = cardResult.rows.item(0);
                        const extendedCard: ExtendedCard = {
                            id: cardData.uuid,
                            uuid: cardData.uuid,
                            name: cardData.name,
                            setCode: cardData.setCode,
                            setName: cardData.setName || '',
                            collectorNumber: cardData.number || '',
                            type: cardData.type || '',
                            rarity: cardData.rarity,
                            hasNonFoil: Boolean(cardData.normal_price || cardData.tcg_normal_price || cardData.cardmarket_normal_price),
                            hasFoil: Boolean(cardData.foil_price || cardData.tcg_foil_price || cardData.cardmarket_foil_price),
                            prices: {
                                usd: cardData.normal_price?.toString() || null,
                                usdFoil: cardData.foil_price?.toString() || null
                            },
                            purchaseUrls: {},
                            legalities: {}
                        };

                        await this.addToCache(extendedCard);
                    }
                }
                console.log('Cache repopulation complete');
            }
        } catch (error) {
            console.error('Error ensuring collection cache population:', error);
            throw error;
        }
    }

    async deleteCollection(collectionId: string): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            console.log(`[DatabaseService] Deleting collection ${collectionId}`);
            
            await this.db!.transaction(async (tx) => {
                // Due to foreign key constraints, deleting from collections will automatically
                // delete associated records in collection_cards due to ON DELETE CASCADE
                await tx.executeSql(
                    'DELETE FROM collections WHERE id = ?',
                    [collectionId]
                );

                // Update scan history to remove references to the deleted collection
                await tx.executeSql(
                    'UPDATE scan_history SET collection_id = NULL, added_to_collection = 0 WHERE collection_id = ?',
                    [collectionId]
                );
            });

            console.log(`[DatabaseService] Successfully deleted collection ${collectionId}`);
        } catch (error) {
            console.error('[DatabaseService] Error deleting collection:', error);
            throw error;
        }
    }

    public ensureInitialized = async (): Promise<void> => {
        await this.verifyDatabaseStructure();
    };

    async clearScanHistory(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        await this.db.executeSql('DELETE FROM scan_history');
    }

    async removeCardFromCollection(cardUuid: string, collectionId: string): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            await this.db!.executeSql(
                `DELETE FROM collection_cards 
                 WHERE card_uuid = ? AND collection_id = ?`,
                [cardUuid, collectionId]
            );
        } catch (error) {
            console.error('Error removing card from collection:', error);
            throw error;
        }
    }

    async removeLorcanaCardFromCollection(cardId: string, collectionId: string): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            await this.db!.executeSql(
                `DELETE FROM lorcana_collection_cards 
                 WHERE card_id = ? AND collection_id = ?`,
                [cardId, collectionId]
            );
        } catch (error) {
            console.error('Error removing Lorcana card from collection:', error);
            throw error;
        }
    }

    async getSetMissingCards(setCode: string): Promise<ExtendedCard[]> {
        if (!this.db || !mtgJsonDb) {
            await this.initDatabase();
            await this.initializeDatabase();
            if (!this.db || !mtgJsonDb) {
                throw new Error('Failed to initialize databases');
            }
        }

        try {
            // First, get the collection ID for this set
            let collectionId: string;
            
            // Try to find collection by set code first
            const [codeResult] = await this.db.executeSql(
                "SELECT id FROM collections WHERE name = ?",
                [`Set: ${setCode}`]
            );

            if (codeResult.rows.length > 0) {
                collectionId = codeResult.rows.item(0).id;
            } else {
                // Try to find by set name from MTGJson
                const [setResult] = await mtgJsonDb.executeSql(
                    "SELECT name FROM sets WHERE code = ?",
                    [setCode.toUpperCase()]
                );

                if (setResult.rows.length > 0) {
                    const setName = setResult.rows.item(0).name;
                    const [nameResult] = await this.db.executeSql(
                        "SELECT id FROM collections WHERE name = ?",
                        [`Set: ${setName}`]
                    );
                    if (nameResult.rows.length === 0) {
                        return [];
                    }
                    collectionId = nameResult.rows.item(0).id;
                } else {
                    return [];
                }
            }

            // Get cards and prices from MTGJson database
            const [results] = await mtgJsonDb.executeSql(`
                SELECT 
                    c.uuid,
                    c.name,
                    c.setCode,
                    c.number,
                    c.rarity,
                    c.type,
                    c.manaCost,
                    c.text,
                    c.side,
                    s.name as setName,
                    COALESCE(p.normal_price, 0) as normal_price,
                    COALESCE(p.foil_price, 0) as foil_price,
                    COALESCE(p.tcg_normal_price, 0) as tcg_normal_price,
                    COALESCE(p.tcg_foil_price, 0) as tcg_foil_price,
                    COALESCE(p.cardmarket_normal_price, 0) as cardmarket_normal_price,
                    COALESCE(p.cardmarket_foil_price, 0) as cardmarket_foil_price,
                    p.last_updated
                FROM cards c
                LEFT JOIN prices p ON c.uuid = p.uuid
                LEFT JOIN sets s ON c.setCode = s.code
                WHERE UPPER(c.setCode) = ?
                ORDER BY c.number ASC, c.side ASC
            `, [setCode.toUpperCase()]);
            
            // Get collection data from main database for this specific collection
            const [collectedCards] = await this.db.executeSql(`
                SELECT cc.card_uuid, cc.quantity 
                FROM collection_cards cc
                WHERE cc.collection_id = ?
            `, [collectionId]);

            // Create a Map of collected card UUIDs to their quantities for faster lookup
            const collectedMap = new Map(
                Array.from({ length: collectedCards.rows.length }, 
                    (_, i) => [collectedCards.rows.item(i).card_uuid, collectedCards.rows.item(i).quantity])
            );

            // Group cards by collector number to handle double-sided cards
            const cardsByNumber = new Map<string, any>();
            
            results.rows.raw().forEach(card => {
                const existingCard = cardsByNumber.get(card.number);
                if (!existingCard || (card.side === 'a' && existingCard.side !== 'a')) {
                    // Use side 'a' if available, otherwise use the first side we find
                    cardsByNumber.set(card.number, card);
                }
            });

            // Map the results to ExtendedCard format
            const cards: ExtendedCard[] = Array.from(cardsByNumber.values()).map(card => {
                // Get the highest normal and foil prices
                const normalPrices = [
                    card.normal_price,
                    card.tcg_normal_price,
                    card.cardmarket_normal_price
                ].filter(price => price !== null && price !== undefined && !isNaN(price));

                const foilPrices = [
                    card.foil_price,
                    card.tcg_foil_price,
                    card.cardmarket_foil_price
                ].filter(price => price !== null && price !== undefined && !isNaN(price));

                const highestNormal = normalPrices.length > 0 ? Math.max(...normalPrices) : 0;
                const highestFoil = foilPrices.length > 0 ? Math.max(...foilPrices) : 0;

                const quantity = collectedMap.get(card.uuid) || 0;

                return {
                    id: card.uuid,
                    uuid: card.uuid,
                    name: card.name,
                    setCode: card.setCode,
                    setName: card.setName,
                    collectorNumber: card.number,
                    type: card.type,
                    manaCost: card.manaCost,
                    text: card.text,
                    rarity: card.rarity,
                    imageUris: {
                        small: `https://api.scryfall.com/cards/${card.setCode.toLowerCase()}/${card.number}?format=image&version=small`,
                        normal: `https://api.scryfall.com/cards/${card.setCode.toLowerCase()}/${card.number}?format=image&version=normal`,
                        large: `https://api.scryfall.com/cards/${card.setCode.toLowerCase()}/${card.number}?format=image&version=large`,
                        art_crop: `https://api.scryfall.com/cards/${card.setCode.toLowerCase()}/${card.number}?format=image&version=art_crop`
                    },
                    prices: {
                        usd: highestNormal > 0 ? highestNormal.toString() : null,
                        usdFoil: highestFoil > 0 ? highestFoil.toString() : null,
                        normal: highestNormal,
                        foil: highestFoil,
                        tcgplayer: {
                            normal: parseFloat(card.tcg_normal_price) || 0,
                            foil: parseFloat(card.tcg_foil_price) || 0
                        },
                        cardmarket: {
                            normal: parseFloat(card.cardmarket_normal_price) || 0,
                            foil: parseFloat(card.cardmarket_foil_price) || 0
                        }
                    },
                    purchaseUrls: {},
                    legalities: {},
                    collected: quantity > 0,
                    quantity: quantity,
                    hasNonFoil: Boolean(card.normal_price || card.tcg_normal_price || card.cardmarket_normal_price),
                    hasFoil: Boolean(card.foil_price || card.tcg_foil_price || card.cardmarket_foil_price),
                };
            });

            return cards;
        } catch (error) {
            console.error('[DatabaseService] Error getting set missing cards:', error);
            if (error instanceof Error) {
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            throw error;
        }
    }

}

export const getDB = async () => {
    if (mtgJsonDb) return mtgJsonDb;
    console.log('[DatabaseService] Initializing database...');
    try {
        const dbName = 'mtg.db';
        console.log('[DatabaseService] Database name:', dbName);

        mtgJsonDb = await openDatabase({
            name: dbName,
            location: 'default',
            createFromLocation: 2
        });

        await mtgJsonDb.executeSql('PRAGMA foreign_keys = ON;');
        await mtgJsonDb.executeSql('PRAGMA journal_mode = WAL;');
        
        return mtgJsonDb;
    } catch (error) {
        console.error('[DatabaseService] Database initialization failed:', error);
        throw error;
    }
};

export const databaseService = new DatabaseService(); 