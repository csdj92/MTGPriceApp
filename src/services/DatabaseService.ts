import SQLite, { SQLError, ResultSet, Transaction } from 'react-native-sqlite-storage';
import type { ExtendedCard } from '../types/card';

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
    private database: SQLite.SQLiteDatabase | null = null;

    async initDatabase(): Promise<void> {
        try {
            console.log('Initializing database...');

            // Close existing connection if any
            if (this.database) {
                await this.database.close();
                this.database = null;
            }

            // Open or create database
            this.database = await SQLite.openDatabase({
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
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        try {
            console.log('Verifying database structure...');

            // Enable foreign key constraints
            await this.database.executeSql('PRAGMA foreign_keys = ON;');
            console.log('Foreign key constraints enabled');

            // Create collections table if it doesn't exist
            await this.database.executeSql(`
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
            await this.database.executeSql(`
                CREATE TABLE IF NOT EXISTS collection_cache (
                    uuid TEXT PRIMARY KEY NOT NULL,
                    card_data TEXT NOT NULL,
                    last_updated INTEGER NOT NULL
                )
            `);
            console.log('Collection_cache table created/verified');

            // Create collection_cards table if it doesn't exist
            await this.database.executeSql(`
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
            await this.database.executeSql(`
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

            // Verify tables exist
            const tables = await this.database.executeSql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            );
            console.log('Existing tables:', tables[0].rows.raw());

            // Verify foreign key constraints
            const fkCheck = await this.database.executeSql('PRAGMA foreign_keys;');
            console.log('Foreign key status:', fkCheck[0].rows.item(0));

        } catch (error) {
            console.error('Database verification error:', error);
            throw error;
        }
    }

    async createCollection(name: string, description?: string): Promise<Collection> {
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
            const now = new Date().toISOString();

            console.log('Creating collection with ID:', id);

            await this.database!.transaction(async (tx) => {
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
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            const results = await this.database!.executeSql(`
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
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            // First clear old cache
            await this.database!.executeSql('DELETE FROM collection_cache');

            // Then insert new cache data in batches
            const batchSize = 20;
            for (let i = 0; i < cards.length; i += batchSize) {
                const batch = cards.slice(i, i + batchSize);
                await this.database!.transaction(async (tx) => {
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
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            const results = await this.database!.executeSql(
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
            if (!this.database) {
                console.log('Database not initialized, initializing now...');
                await this.initDatabase();
            }

            console.log('Executing query to fetch cards...');
            const results = await this.database!.executeSql(
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
        if (this.database) {
            try {
                console.log('Closing database connection');
                await this.database.close();
                this.database = null;
                console.log('Database connection closed successfully');
            } catch (error) {
                console.error('Error closing database:', error);
                throw error;
            }
        }
    }

    async getCollectionCards(collectionId: string, page = 1, pageSize = 20): Promise<ExtendedCard[]> {
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            const offset = (page - 1) * pageSize;
            const results = await this.database!.executeSql(
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
            await this.database!.transaction(async (tx) => {
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
            const [result] = await this.database!.executeSql(
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
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            await this.database!.executeSql(
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
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            const now = new Date().toISOString();
            await this.database!.executeSql(
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
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            const results = await this.database!.executeSql(
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
        if (!this.database) {
            await this.initDatabase();
        }

        try {
            const uuid = card.id;
            await this.database!.executeSql(
                'INSERT OR REPLACE INTO collection_cache (uuid, card_data, last_updated) VALUES (?, ?, ?)',
                [uuid, JSON.stringify(card), Date.now()]
            );
            return { ...card, uuid };
        } catch (error) {
            console.error('Error adding card to cache:', error);
            throw error;
        }
    }
}

export const databaseService = new DatabaseService(); 