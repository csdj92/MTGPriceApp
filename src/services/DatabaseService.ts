import SQLite, { SQLError, ResultSet, Transaction } from 'react-native-sqlite-storage';
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

class DatabaseService {
    private db: SQLite.SQLiteDatabase | null = null;
    private mtgJsonDb: SQLite.SQLiteDatabase | null = null;

    constructor() {
        this.initializeDatabase();
    }

    private async initializeDatabase() {
        try {
            this.db = await SQLite.openDatabase({
                name: 'mtgprices.db',
                location: 'default',
            });

            // Check if MTGJson database exists and open it
            const mtgJsonPath = `${RNFS.DocumentDirectoryPath}/AllPrintings.sqlite`;
            const mtgJsonExists = await RNFS.exists(mtgJsonPath);
            
            if (mtgJsonExists) {
                console.log('[DatabaseService] Opening existing MTGJson database at:', mtgJsonPath);
                try {
                    this.mtgJsonDb = await SQLite.openDatabase({
                        name: mtgJsonPath,
                        location: 'Library',
                        createFromLocation: 1
                    });
                    console.log('[DatabaseService] Successfully opened MTGJson database');
                } catch (dbError) {
                    console.error('[DatabaseService] Error opening MTGJson database:', dbError);
                    throw dbError;
                }
            } else {
                console.log('[DatabaseService] MTGJson database not found at:', mtgJsonPath);
            }

            await this.createTables();
            if (this.mtgJsonDb) {
                await this.createPriceTables();
            }
        } catch (error) {
            console.error('Database initialization error:', error);
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
            this.mtgJsonDb = await SQLite.openDatabase({
                name: mtgJsonPath,
                location: 'default',
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
        if (this.mtgJsonDb) {
            mtgjsonTables = await this.getMTGJsonTables();
        }

        return {
            local: localTables,
            mtgjson: mtgjsonTables
        };
    }

    async getMTGJsonTables(): Promise<string[]> {
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }
        const tables = await this.mtgJsonDb.executeSql('SELECT name FROM sqlite_master WHERE type="table"');
        return tables[0].rows.raw().map(row => row.name);
    }

    async getCardDetailsByUuid(uuid: string): Promise<any> {
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await this.mtgJsonDb.executeSql(
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
                if (!item.name && this.mtgJsonDb) {
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
        }
    }

    async initDatabase(): Promise<void> {
        try {
            console.log('Initializing database...');

            // Close existing connection if any
            if (this.db) {
                await this.db.close();
                this.db = null;
            }

            // Open or create database
            this.db = await SQLite.openDatabase({
                name: 'mtg.db',
                location: 'default',
            });

            console.log('Database connection established');

            // Verify and create database structure
            await this.verifyDatabaseStructure();
            console.log('Database structure verified');

        } catch (error) {
            console.error('Database initialization error:', error);
            if (error instanceof Error) {
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
            }
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

            // Verify tables exist
            const tables = await this.db.executeSql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            );
            console.log('Existing tables:', tables[0].rows.raw());

            // Verify foreign key constraints
            const fkCheck = await this.db.executeSql('PRAGMA foreign_keys;');
            console.log('Foreign key status:', fkCheck[0].rows.item(0));

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
            // First clear old cache
            await this.db!.executeSql('DELETE FROM collection_cache');

            // Then insert new cache data in batches
            const batchSize = 20;
            for (let i = 0; i < cards.length; i += batchSize) {
                const batch = cards.slice(i, i + batchSize);
                await this.db!.transaction(async (tx) => {
                    for (const card of batch) {
                        await tx.executeSql(
                            'INSERT INTO collection_cache (uuid, card_data, last_updated) VALUES (?, ?, ?)',
                            [card.uuid, JSON.stringify(card), Date.now()]
                        );
                    }
                });
            }
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
        console.log(`[DatabaseService] Adding card ${cardUuid} to collection ${collectionId}`);

        try {
            const now = new Date().toISOString();
            await this.db!.transaction(async (tx) => {
                // Add to collection_cards table
                await tx.executeSql(
                    'INSERT OR REPLACE INTO collection_cards (collection_id, card_uuid, added_at) VALUES (?, ?, ?)',
                    [collectionId, cardUuid, now]
                );
                console.log(`[DatabaseService] Card added to collection_cards table`);

                // Update collection stats
                await tx.executeSql(
                    'UPDATE collections SET updated_at = ? WHERE id = ?',
                    [now, collectionId]
                );
                console.log(`[DatabaseService] Collection stats updated`);
            });

            // Verify the card was added
            const [result] = await this.db!.executeSql(
                'SELECT * FROM collection_cards WHERE collection_id = ? AND card_uuid = ?',
                [collectionId, cardUuid]
            );

            if (result.rows.length === 0) {
                throw new Error('Verification failed - card not found in collection');
            }

            console.log(`[DatabaseService] Card successfully added to collection`);
        } catch (error) {
            console.error('[DatabaseService] Error adding card to collection:', error);
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
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const uuid = card.id;
            await this.db!.executeSql(
                'INSERT OR REPLACE INTO collection_cache (uuid, card_data, last_updated) VALUES (?, ?, ?)',
                [uuid, JSON.stringify(card), Date.now()]
            );
            return { ...card, uuid };
        } catch (error) {
            console.error('Error adding card to cache:', error);
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
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        const now = Date.now();
        const totalCards = Object.keys(priceData).length;
        console.log(`[DatabaseService] Processing ${totalCards} cards`);

        try {
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

                await this.mtgJsonDb.transaction((tx) => {
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
                        values,
                        () => {
                            processedCount += batch.length;
                            console.log(`[DatabaseService] Processed ${processedCount}/${totalCards} cards`);
                        },
                        (_, error) => {
                            console.error('[DatabaseService] Error in bulk price insert:', error);
                            return false;
                        }
                    );

                    // Bulk insert price history
                    const historyPlaceholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                    const historyValues: any[] = [];
                    
                    batch.forEach(([uuid, prices]) => {
                        historyValues.push(
                            uuid, prices.normal, prices.foil,
                            prices.tcg_normal || 0, prices.tcg_foil || 0,
                            prices.cardmarket_normal || 0, prices.cardmarket_foil || 0,
                            prices.cardkingdom_normal || 0, prices.cardkingdom_foil || 0,
                            prices.cardsphere_normal || 0, prices.cardsphere_foil || 0,
                            now
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
                        historyValues,
                        () => {},
                        (_, error) => {
                            console.error('[DatabaseService] Error in bulk price history insert:', error);
                            return false;
                        }
                    );
                });

                console.log(`[DatabaseService] Completed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(entries.length/batchSize)}`);
            }

            await this.mtgJsonDb.executeSql(
                `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
                 VALUES ('last_price_update', ?, ?)`,
                [now.toString(), now]
            );

            const [verifyResult] = await this.mtgJsonDb.executeSql('SELECT COUNT(*) as count FROM prices');
            console.log(`[DatabaseService] Updated prices: ${verifyResult.rows.item(0).count} records`);

        } catch (error) {
            console.error('[DatabaseService] Error updating prices:', error);
            throw error;
        }
    }

    async getCardPriceHistory(uuid: string): Promise<{ normal: number; foil: number; timestamp: number }[]> {
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await this.mtgJsonDb.executeSql(
                `SELECT normal_price, foil_price, recorded_at
                 FROM price_history
                 WHERE uuid = ?
                 ORDER BY recorded_at DESC
                 LIMIT 30`,
                [uuid]
            );

            return result.rows.raw().map(row => ({
                normal: row.normal_price,
                foil: row.foil_price,
                timestamp: row.recorded_at
            }));
        } catch (error) {
            console.error('[DatabaseService] Error getting price history:', error);
            throw error;
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
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const offset = (page - 1) * pageSize;
            const [result] = await this.mtgJsonDb.executeSql(`
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
        return this.mtgJsonDb !== null;
    }

    async getMTGJsonTable(tableName: string | undefined, limit: number = 100): Promise<any[]> {
        if (!this.mtgJsonDb || !tableName) {
            throw new Error('MTGJson database not initialized or invalid table name');
        }
        const [result] = await this.mtgJsonDb.executeSql(
            `SELECT * FROM ${tableName} LIMIT ?`,
            [limit]
        );
        return result.rows.raw();
    }

    async getAllCardsBySet(setCode: string, pageSize: number, offset: number): Promise<any[]> {
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            // First check if we have any price data at all
            const [priceCheck] = await this.mtgJsonDb.executeSql(
                'SELECT COUNT(*) as count FROM prices WHERE normal_price > 0 OR foil_price > 0'
            );
            const priceCount = priceCheck.rows.item(0).count;
            console.log(`[DatabaseService] Found ${priceCount} total cards with prices in database`);

            // Normalize setCode for case-insensitive matching
            const normalizedSetCode = setCode.toUpperCase();
            
            // Check prices specifically for this set
            const [setCheck] = await this.mtgJsonDb.executeSql(
                `SELECT COUNT(*) as count 
                 FROM cards c 
                 JOIN prices p ON c.uuid = p.uuid 
                 WHERE UPPER(c.setCode) = ? AND (p.normal_price > 0 OR p.foil_price > 0)`,
                [normalizedSetCode]
            );
            const setPriceCount = setCheck.rows.item(0).count;
            console.log(`[DatabaseService] Found ${setPriceCount} cards with prices in set ${setCode}`);

            // Fetch cards with prices in a single query
            const [result] = await this.mtgJsonDb.executeSql(`
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
            `, [normalizedSetCode, pageSize, offset]);

            const prices = await this.mtgJsonDb.executeSql(`
                SELECT *
                FROM prices 
            `, );

            console.log('[DatabaseService] SQL Query prices result sample:', JSON.stringify(prices));

            // Add debug logging
            console.log('[DatabaseService] SQL Query result sample:', JSON.stringify(result.rows.raw().slice(0, 2), null, 2));
            
            
            const cards = result.rows.raw();
            console.log(`[DatabaseService] Found ${cards.length} cards for set ${setCode}`);

            return cards.map(card => ({
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
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await this.mtgJsonDb.executeSql(
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
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            // Check if tables already exist
            const [tableCheck] = await this.mtgJsonDb.executeSql(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND (name='prices' OR name='price_history')
            `);

            if (tableCheck.rows.length === 2) {
                console.log('[DatabaseService] Price tables already exist, skipping creation');
                return;
            }

            console.log('[DatabaseService] Creating price tables...');

            // Create price-related tables only if they don't exist
            await this.mtgJsonDb.executeSql(`
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

            await this.mtgJsonDb.executeSql(`
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

            console.log('[DatabaseService] Price tables created successfully');
        } catch (error) {
            console.error('Error creating price tables:', error);
            throw error;
        }
    }

    async getPriceCount(): Promise<number> {
        if (!this.mtgJsonDb) {
            throw new Error('MTGJson database not initialized');
        }

        try {
            const [result] = await this.mtgJsonDb.executeSql(
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
            if (!this.mtgJsonDb) {
                console.log('[DatabaseService] MTGJson database not initialized, attempting to initialize...');
                await this.initializeDatabase();
            }

            // Verify we can query the database
            const [result] = await this.mtgJsonDb!.executeSql('SELECT COUNT(*) as count FROM prices');
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
            console.log('[DatabaseService] Attempting to reinitialize price database...');
            await this.initializeDatabase();
            await this.createPriceTables();
            console.log('[DatabaseService] Price database reinitialized');
        } catch (error) {
            console.error('[DatabaseService] Failed to reinitialize price database:', error);
            throw error;
        }
    }

    // print all the rows in the cards table
    async printTenCardsRows(): Promise<void> {
        const [result] = await this.mtgJsonDb!.executeSql('SELECT * FROM cards LIMIT 10');
        console.log('[DatabaseService] All cards:', JSON.stringify(result.rows.raw(), null, 2));
    }

}

export const databaseService = new DatabaseService(); 