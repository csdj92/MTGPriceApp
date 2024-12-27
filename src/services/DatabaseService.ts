import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

export interface Card {
    id: number;
    name: string;
    set_name: string;
    price: number;
    image_url?: string;
}

class DatabaseService {
    private database: SQLite.SQLiteDatabase | null = null;

    async initDatabase(): Promise<void> {
        try {
            console.log('Initializing database...');
            const db = await SQLite.openDatabase({
                name: 'mtg.db',
                createFromLocation: 1, // This tells SQLite to look for the database in the android/app/src/main/assets folder
                location: 'default',
            });
            this.database = db;
            console.log('Database initialized successfully');

            // Verify database connection by running a test query
            const [result] = await db.executeSql('SELECT COUNT(*) as count FROM cards');
            const count = result.rows.item(0).count;
            console.log(`Database connected successfully. Found ${count} cards.`);
        } catch (error) {
            console.error('Error initializing database:', error);
            throw error;
        }
    }

    async getFirst100Cards(): Promise<Card[]> {
        try {
            if (!this.database) {
                console.log('Database not initialized, initializing now...');
                await this.initDatabase();
            }

            console.log('Executing query to fetch first 100 cards...');
            const [results] = await this.database!.executeSql(
                'SELECT id, name, set_name, price, image_url FROM cards LIMIT 100'
            );

            console.log(`Query executed. Found ${results.rows.length} cards.`);
            const cards: Card[] = [];
            for (let i = 0; i < results.rows.length; i++) {
                cards.push(results.rows.item(i));
            }

            return cards;
        } catch (error) {
            console.error('Error fetching cards:', error);
            throw error;
        }
    }
}

export const databaseService = new DatabaseService(); 