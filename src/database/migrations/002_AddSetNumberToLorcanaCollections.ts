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
    // Add the set_number column if it doesn't exist
    await db.executeSql('ALTER TABLE lorcana_collections ADD COLUMN set_number INTEGER');

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