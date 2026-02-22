/**
 * Migration 004: Add lorcana_import_history table
 *
 * This table tracks all import operations, providing audit trail and
 * helping to diagnose issues with card imports.
 */

import SQLite from 'react-native-sqlite-storage';

export const up = async (db: SQLite.SQLiteDatabase): Promise<void> => {
    console.log('[Migration 004] Creating lorcana_import_history table...');

    await db.executeSql(`
        CREATE TABLE IF NOT EXISTS lorcana_import_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_type TEXT NOT NULL,
            set_code TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL,
            cards_added INTEGER DEFAULT 0,
            cards_updated INTEGER DEFAULT 0,
            cards_skipped INTEGER DEFAULT 0,
            total_cards INTEGER DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL
        )
    `);

    // Create index on started_at for sorting by date
    await db.executeSql(`
        CREATE INDEX IF NOT EXISTS idx_import_history_started
        ON lorcana_import_history(started_at DESC)
    `);

    // Create index on set_code for filtering by set
    await db.executeSql(`
        CREATE INDEX IF NOT EXISTS idx_import_history_set
        ON lorcana_import_history(set_code)
    `);

    console.log('[Migration 004] ✓ lorcana_import_history table created successfully');
};

export const down = async (db: SQLite.SQLiteDatabase): Promise<void> => {
    console.log('[Migration 004] Dropping lorcana_import_history table...');

    await db.executeSql('DROP INDEX IF EXISTS idx_import_history_set');
    await db.executeSql('DROP INDEX IF EXISTS idx_import_history_started');
    await db.executeSql('DROP TABLE IF EXISTS lorcana_import_history');

    console.log('[Migration 004] ✓ lorcana_import_history table dropped successfully');
};

export default { up, down };
