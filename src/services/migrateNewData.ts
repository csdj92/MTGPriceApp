import SQLite from 'react-native-sqlite-storage';

/**
 * Merges new data from a freshly downloaded database file into your existing database.
 * 
 * @param localDb  The primary (local) database connection.
 * @param newDbPath  The file path to the newly downloaded database.
 */
export const migrateNewData = async (
  localDb: SQLite.SQLiteDatabase,
  newDbPath: string
): Promise<void> => {
  try {
    // ATTACH the new database.
    // Note: Ensure the file path is accessible and correctly formatted.
    await localDb.executeSql(`ATTACH DATABASE '${newDbPath}' AS newdb;`);
    
    // Example for merging price data:
    // This query inserts new or updated price records from the new database.
    // Adjust the WHERE clause as needed (e.g., using last_updated timestamps).
    await localDb.executeSql(`
      INSERT INTO prices (
        uuid, normal_price, foil_price, tcg_normal_price,
        tcg_foil_price, cardmarket_normal_price, cardmarket_foil_price,
        cardkingdom_normal_price, cardkingdom_foil_price, cardsphere_normal_price,
        cardsphere_foil_price, cardhoarder_normal_price, cardhoarder_foil_price, last_updated
      )
      SELECT 
        uuid, normal_price, foil_price, tcg_normal_price,
        tcg_foil_price, cardmarket_normal_price, cardmarket_foil_price,
        cardkingdom_normal_price, cardkingdom_foil_price, cardsphere_normal_price,
        cardsphere_foil_price, cardhoarder_normal_price, cardhoarder_foil_price, last_updated
      FROM newdb.prices
      WHERE last_updated > (
         SELECT COALESCE(MAX(last_updated), 0) FROM prices
      );
    `);

    // If you have other tables to update similarly, add additional queries here.

    // Detach the new database
    await localDb.executeSql(`DETACH DATABASE newdb;`);
    console.log('[migrateNewData] New data migrated successfully.');
  } catch (error) {
    console.error('[migrateNewData] Error while migrating new data:', error);
    throw error;
  }
}; 