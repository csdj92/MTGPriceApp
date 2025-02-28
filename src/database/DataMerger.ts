import { InteractionManager } from 'react-native';
import SQLite from 'react-native-sqlite-storage';

export class DataMerger {
    constructor(private db: SQLite.SQLiteDatabase) {}

    async mergePriceDataToNewDb(oldDbPath: string): Promise<void> {
        try {
            console.log('[DataMerger] Starting price data migration to new database...');
            
            // Wrap the database operations in InteractionManager
            await new Promise<void>(resolve => InteractionManager.runAfterInteractions(async () => {
                try {
                    // Attach the old database
                    await this.db.executeSql(`ATTACH DATABASE '${oldDbPath}' AS olddb;`);

                    // Begin transaction
                    await this.db.transaction(async (tx) => {
                        // First, ensure price tables exist in the new database
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

                        await tx.executeSql(`
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
                            );
                        `);

                        // Copy price data from old database to new
                        await tx.executeSql(`
                            INSERT OR REPLACE INTO prices 
                            SELECT * FROM olddb.prices;
                        `);

                        // Copy price history
                        await tx.executeSql(`
                            INSERT OR REPLACE INTO price_history 
                            SELECT * FROM olddb.price_history;
                        `);

                        // Copy app settings if needed
                        await tx.executeSql(`
                            CREATE TABLE IF NOT EXISTS app_settings (
                                key TEXT PRIMARY KEY NOT NULL,
                                value TEXT NOT NULL,
                                updated_at INTEGER NOT NULL
                            );
                        `);

                        await tx.executeSql(`
                            INSERT OR REPLACE INTO app_settings 
                            SELECT * FROM olddb.app_settings;
                        `);
                    });

                    // Detach the old database
                    await this.db.executeSql('DETACH DATABASE olddb;');
                    
                    console.log('[DataMerger] Price data migration completed successfully');
                    resolve();
                } catch (error) {
                    console.error('[DataMerger] Error in background task:', error);
                    throw error;
                }
            }));
        } catch (error) {
            console.error('[DataMerger] Error migrating price data:', error);
            throw error;
        }
    }
} 