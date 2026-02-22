import SQLite from 'react-native-sqlite-storage';
import type { Migration } from './MigrationManager';

export const AddQuantityColumnsToLorcanaCollectionCards: Migration = {
    version: 5,
    up: async (db: SQLite.SQLiteDatabase) => {
        console.log('[Migration 005] Adding quantity columns to lorcana_collection_cards...');

        // Check if the table exists first
        const [tableExists] = await db.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='lorcana_collection_cards'"
        );

        if (tableExists.rows.length === 0) {
            console.log('[Migration 005] lorcana_collection_cards table does not exist yet, skipping migration');
            return;
        }

        // Get current columns
        const [columnsInfo] = await db.executeSql('PRAGMA table_info(lorcana_collection_cards)');
        const existingCols = new Set<string>();
        for (let i = 0; i < columnsInfo.rows.length; i++) {
            existingCols.add(columnsInfo.rows.item(i).name);
        }

        // Add quantity_normal if it doesn't exist
        if (!existingCols.has('quantity_normal')) {
            console.log('[Migration 005] Adding quantity_normal column...');
            await db.executeSql('ALTER TABLE lorcana_collection_cards ADD COLUMN quantity_normal INTEGER DEFAULT 0');

            // Update existing rows to have quantity_normal = 1 (assume they have at least 1 card)
            await db.executeSql('UPDATE lorcana_collection_cards SET quantity_normal = 1 WHERE quantity_normal IS NULL OR quantity_normal = 0');
        } else {
            console.log('[Migration 005] quantity_normal column already exists');
        }

        // Add quantity_foil if it doesn't exist
        if (!existingCols.has('quantity_foil')) {
            console.log('[Migration 005] Adding quantity_foil column...');
            await db.executeSql('ALTER TABLE lorcana_collection_cards ADD COLUMN quantity_foil INTEGER DEFAULT 0');
        } else {
            console.log('[Migration 005] quantity_foil column already exists');
        }

        console.log('[Migration 005] Migration complete');
    },
    down: async (db: SQLite.SQLiteDatabase) => {
        // SQLite doesn't support DROP COLUMN easily, so we'll just log
        console.log('[Migration 005] Rollback not supported for column additions in SQLite');
    }
};
