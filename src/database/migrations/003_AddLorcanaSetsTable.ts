/**
 * Migration 003: Add lorcana_sets table
 *
 * This table stores metadata about Lorcana sets fetched from the Lorcast API.
 * It eliminates the need for hardcoded set mappings and enables dynamic
 * discovery of new sets.
 */

import { Database } from 'react-native-sqlite-storage';

export const up = async (db: Database): Promise<void> => {
    console.log('[Migration 003] Creating lorcana_sets table...');

    await db.executeSql(`
        CREATE TABLE IF NOT EXISTS lorcana_sets (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            set_number INTEGER,
            released_at TEXT,
            card_count INTEGER,
            total_cards_in_db INTEGER DEFAULT 0,
            last_imported_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    `);

    // Create index on code for fast lookups
    await db.executeSql(`
        CREATE INDEX IF NOT EXISTS idx_lorcana_sets_code
        ON lorcana_sets(code)
    `);

    // Create index on set_number for ordering
    await db.executeSql(`
        CREATE INDEX IF NOT EXISTS idx_lorcana_sets_number
        ON lorcana_sets(set_number)
    `);

    console.log('[Migration 003] ✓ lorcana_sets table created successfully');
};

export const down = async (db: Database): Promise<void> => {
    console.log('[Migration 003] Dropping lorcana_sets table...');

    await db.executeSql('DROP INDEX IF EXISTS idx_lorcana_sets_number');
    await db.executeSql('DROP INDEX IF EXISTS idx_lorcana_sets_code');
    await db.executeSql('DROP TABLE IF EXISTS lorcana_sets');

    console.log('[Migration 003] ✓ lorcana_sets table dropped successfully');
};

export default { up, down };
