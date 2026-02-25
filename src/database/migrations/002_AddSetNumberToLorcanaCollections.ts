import SQLite from 'react-native-sqlite-storage';
import type { Migration } from './MigrationManager';

// Mapping of set codes to release numbers
const setCodeToNumber: Record<string, number> = {
  'TFC': 1, // The First Chapter
  'ROF': 2, // Rise of the Floodborn
  'INK': 3, // Into the Inklands
  'URS': 4, // Ursula's Return
  'SSK': 5, // Shimmering Skies
  'ARI': 6, // Archazia's Island
  'AZS': 7, // Azurite Sea
  'ROJ': 8, // Reign of Jafar
  'FAB': 9, //Fabled
};

export const AddSetNumberToLorcanaCollections: Migration = {
  version: 2,
  up: async (db: SQLite.SQLiteDatabase) => {
    // Ensure base table exists in case migration runs before table bootstrap
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS lorcana_collections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        total_value REAL DEFAULT 0,
        card_count INTEGER DEFAULT 0,
        set_number INTEGER
      )
    `);

    // Add set_number if missing (idempotent)
    const [columnsInfo] = await db.executeSql('PRAGMA table_info(lorcana_collections)');
    const existingCols = new Set<string>();
    for (let i = 0; i < columnsInfo.rows.length; i++) {
      existingCols.add(columnsInfo.rows.item(i).name);
    }
    if (!existingCols.has('set_number')) {
      await db.executeSql('ALTER TABLE lorcana_collections ADD COLUMN set_number INTEGER');
    }

    // Fetch all collections
    const [results] = await db.executeSql('SELECT id, description FROM lorcana_collections');
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      if (row.description) {
        // Extract set code from description (e.g., 'Collection for ... (TFC)')
        const match = row.description.match(/\(([A-Z]{3})\)$/);
        if (match) {
          const setCode = match[1];
          const setNumber = setCodeToNumber[setCode];
          if (setNumber) {
            await db.executeSql('UPDATE lorcana_collections SET set_number = ? WHERE id = ?', [setNumber, row.id]);
          }
        }
      }
    }
  },
}; 
