import SQLite, { SQLError, ResultSet, Transaction } from 'react-native-sqlite-storage';
import { ExtendedCard } from './ScryfallService';

SQLite.enablePromise(true);
SQLite.DEBUG(true);

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

            this.database = await SQLite.openDatabase({
                name: 'mtg.db',
                createFromLocation: "~mtg.db",
                location: 'default',
            });

            console.log('Database connection established');
            await this.verifyDatabaseStructure();
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
            const tableCheck = await this.database.executeSql(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cards', 'collection_cache')"
            );

            if (tableCheck[0].rows.length < 2) {
                console.log('Creating collection_cache table...');
                await this.database.executeSql(`
                    CREATE TABLE IF NOT EXISTS collection_cache (
                        uuid TEXT PRIMARY KEY,
                        card_data TEXT NOT NULL,
                        last_updated INTEGER NOT NULL
                    )
                `);
            }

            const tableInfo = await this.database.executeSql('PRAGMA table_info(cards)');
            console.log('Table structure:', JSON.stringify(tableInfo[0].rows.raw()));

            const countResult = await this.database.executeSql('SELECT COUNT(*) as count FROM cards');
            const count = countResult[0].rows.item(0).count;
            console.log(`Database contains ${count} cards`);
        } catch (error) {
            console.error('Database verification error:', error);
            throw error;
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
}

export const databaseService = new DatabaseService(); 