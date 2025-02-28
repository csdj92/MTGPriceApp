import SQLite from 'react-native-sqlite-storage';
import type { Migration } from './MigrationManager';

export const InitialSchemaMigration: Migration = {
    version: 1,
    up: async (db: SQLite.SQLiteDatabase) => {
        await db.executeSql(`
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

        await db.executeSql(`
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
    }
}; 