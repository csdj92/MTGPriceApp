import SQLite, { SQLError, ResultSet, Transaction } from 'react-native-sqlite-storage';
import type { ExtendedCard } from '../types/card';
import RNFS from 'react-native-fs';

SQLite.enablePromise(true);
SQLite.DEBUG(true);

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
            if (await RNFS.exists(mtgJsonPath)) {
                this.mtgJsonDb = await SQLite.openDatabase({
                    name: mtgJsonPath,
                    location: 'default',
                });
            }

            await this.createTables();
        } catch (error) {
            console.error('Database initialization error:', error);
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
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
                    FOREIGN KEY (card_uuid) REFERENCES collection_cache(uuid) ON DELETE CASCADE
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
            const results = await this.db!.executeSql(`
                SELECT 
                    c.*,
                    COUNT(cc.card_uuid) as card_count,
                    COALESCE(SUM(CAST(JSON_EXTRACT(cache.card_data, '$.prices.usd') AS REAL)), 0) as total_value
                FROM collections c
                LEFT JOIN collection_cards cc ON c.id = cc.collection_id
                LEFT JOIN collection_cache cache ON cc.card_uuid = cache.uuid
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
                    totalValue: row.total_value || 0,
                    cardCount: row.card_count || 0
                });
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

    async updatePrices(priceData: Record<string, { normal: number; foil: number }>): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        const now = Date.now();

        try {
            await this.db!.transaction(async (tx) => {
                for (const [uuid, prices] of Object.entries(priceData)) {
                    // Update current prices
                    await tx.executeSql(
                        `INSERT OR REPLACE INTO prices (uuid, normal_price, foil_price, last_updated)
                         VALUES (?, ?, ?, ?)`,
                        [uuid, prices.normal, prices.foil, now]
                    );

                    // Add to price history
                    await tx.executeSql(
                        `INSERT INTO price_history (uuid, normal_price, foil_price, recorded_at)
                         VALUES (?, ?, ?, ?)`,
                        [uuid, prices.normal, prices.foil, now]
                    );
                }
            });

            console.log(`[DatabaseService] Successfully updated prices for ${Object.keys(priceData).length} cards`);
        } catch (error) {
            console.error('[DatabaseService] Error updating prices:', error);
            throw error;
        }
    }

    async getCardPriceHistory(uuid: string): Promise<{ normal: number; foil: number; timestamp: number }[]> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const [result] = await this.db!.executeSql(
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

    async updateLastPriceCheck(): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const now = Date.now();
            await this.db!.executeSql(
                `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
                 VALUES ('last_price_check', ?, ?)`,
                [now.toString(), now]
            );
        } catch (error) {
            console.error('[DatabaseService] Error updating last price check:', error);
            throw error;
        }
    }

    async shouldUpdatePrices(): Promise<boolean> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const [result] = await this.db!.executeSql(
                `SELECT value FROM app_settings WHERE key = 'last_price_check'`
            );

            if (result.rows.length === 0) {
                return true; // No previous update, should update
            }

            const lastCheck = parseInt(result.rows.item(0).value);
            const now = Date.now();
            const oneDayMs = 24 * 60 * 60 * 1000;

            return (now - lastCheck) >= oneDayMs;
        } catch (error) {
            console.error('[DatabaseService] Error checking last price update:', error);
            return true; // On error, we'll try to update just to be safe
        }
    }

    async getPriceData(page: number, pageSize: number): Promise<{ uuid: string; normal_price: number; foil_price: number; last_updated: number; }[]> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const offset = (page - 1) * pageSize;
            const [result] = await this.db!.executeSql(`
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

    async getCombinedPriceData(page: number, pageSize: number): Promise<any[]> {
        if (!this.db || !this.mtgJsonDb) {
            throw new Error('Databases not initialized');
        }

        try {
            const offset = (page - 1) * pageSize;
            // First get price data from local database
            const [priceResult] = await this.db.executeSql(`
                SELECT uuid, normal_price, foil_price, last_updated 
                FROM prices 
                ORDER BY last_updated DESC
                LIMIT ? OFFSET ?
            `, [pageSize, offset]);

            // Get card details from MTGJson for each price entry
            const combinedData = [];
            for (let i = 0; i < priceResult.rows.length; i++) {
                const priceData = priceResult.rows.item(i);
                const [cardResult] = await this.mtgJsonDb.executeSql(`
                    SELECT name, setCode, number, rarity 
                    FROM cards 
                    WHERE uuid = ?
                `, [priceData.uuid]);

                const cardDetails = cardResult.rows.length > 0 ? cardResult.rows.item(0) : null;
                combinedData.push({
                    ...priceData,
                    ...cardDetails
                });
            }

            return combinedData;
        } catch (error) {
            console.error('Error getting combined price data:', error);
            return [];
        }
    }
}

export const databaseService = new DatabaseService(); 