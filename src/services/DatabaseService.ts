import SQLite, { SQLError, ResultSet, Transaction } from 'react-native-sqlite-storage';

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
                "SELECT name FROM sqlite_master WHERE type='table' AND name='cards'"
            );

            if (tableCheck[0].rows.length === 0) {
                console.error('Cards table not found in database');
                throw new Error('Database schema invalid: cards table not found');
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
                console.log(`Processing row ${i}:`, row);
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