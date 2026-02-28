import { Share, Alert, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { getLorcanaCollectionCards, getLorcanaSetCollections, getDB } from './LorcanaService';
import { collectionCacheService } from './CollectionCacheService';
import type { LorcanaPrice, PartialLorcanaCardWithPrice } from '../types/lorcana';
import { NativeModules, DeviceEventEmitter } from 'react-native';

// Use the DeviceEventEmitter directly for collection updates
export const collectionEventEmitter = DeviceEventEmitter;

const { AndroidShareModule } = NativeModules;

// Define the structure of the export data
interface LorcanaExportData {
  exportDate: string;
  collections: LorcanaExportCollection[];
}

interface LorcanaExportCollection {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  totalValue: number;
  cardCount: number;
  cards: LorcanaExportCard[];
}

interface LorcanaExportCard {
  Unique_ID: string;
  Card_Identifier?: string;
  Type: string;
  Name: string;
  Flavor_Text?: string;
  Rules_Text?: string;
  Set_ID: string;
  Set_Name: string;
  Color: string;
  Rarity: string;
  Card_Num?: string | number;
  Ink_Cost?: number;
  Strength?: number;
  Willpower?: number;
  Artist?: string;
  collected: boolean;
  collection_id?: string;
  quantity: number;
  prices?: LorcanaPrice;
}

interface PreparedImportCollection extends LorcanaExportCollection {
  cards: LorcanaExportCard[];
}

interface ImportExecutionSummary {
  importedCollections: number;
  importedCards: number;
}

class ExportService {
  private readonly queryChunkSize = 250;

  // Use a platform-specific directory path
  private getExportDirectory(): string {
    // On Android, use directories that are accessible without special permissions
    if (Platform.OS === 'android') {
      // For newer Android versions, we should use more accessible directories
      return `${RNFS.CachesDirectoryPath}/exports`;
    }
    // On iOS, use the document directory
    return RNFS.DocumentDirectoryPath;
  }

  /**
   * Export Lorcana collections to a JSON file
   * @returns {Promise<string>} The path to the exported file
   */
  async exportLorcanaCollections(): Promise<string> {
    try {
      // Get all Lorcana collections
      console.log('[ExportService] Getting Lorcana collections...');
      const collections = await getLorcanaSetCollections();
      
      // Prepare the export data
      const exportData: LorcanaExportData = {
        exportDate: new Date().toISOString(),
        collections: []
      };

      // Process each collection
      for (const collection of collections) {
        console.log(`[ExportService] Processing collection: ${collection.name}`);
        
        // Get all cards for this collection
        let cards: PartialLorcanaCardWithPrice[] = [];
        try {
          cards = await getLorcanaCollectionCards(collection.id, 1, 0);  // Use pageSize 0 to get all cards
        } catch (error: any) {
          console.error(`[LorcanaService] Error fetching Lorcana collection cards:`, error);
          
          // If the error is about missing lorcana_card_prices table, try a fallback query
          if (error && error.message && error.message.includes('no such table: lorcana_card_prices')) {
            console.log('[ExportService] Using fallback query without prices table...');
            try {
              // Get a direct database connection
              const db = await getDB();
              
              // Use a simpler query without the prices table
              const query = `
                SELECT c.*, cc.collected
                FROM lorcana_cards c
                INNER JOIN lorcana_collection_cards cc ON c.Unique_ID = cc.card_id
                WHERE cc.collection_id = ?
                ORDER BY c.Name
              `;
              
              const [results] = await db.executeSql(query, [collection.id]);
              
              if (results && results.rows) {
                // Process the results
                for (let i = 0; i < results.rows.length; i++) {
                  const item = results.rows.item(i);
                  if (item && item.Unique_ID) {
                    cards.push({
                      Unique_ID: item.Unique_ID,
                      Name: item.Name || 'Unknown Card',
                      Set_Name: item.Set_Name || 'Unknown Set',
                      Set_ID: item.Set_ID,
                      Set_Num: item.Set_Num,
                      Card_Num: item.Card_Num,
                      Rarity: item.Rarity,
                      Color: item.Color,
                      Cost: item.Cost,
                      Strength: item.Strength,
                      Willpower: item.Willpower,
                      Type: item.Type || 'Unknown',
                      Classifications: item.Classifications,
                      Body_Text: item.Body_Text,
                      Flavor_Text: item.Flavor_Text,
                      Image: item.Image,
                      collected: !!item.collected,
                      price_usd: item.price_usd,
                      price_usd_foil: item.price_usd_foil,
                      // Add prices object for compatibility
                      prices: {
                        usd: item.price_usd,
                        usd_foil: item.price_usd_foil,
                        tcgplayer_id: null
                      }
                    });
                  }
                }
                console.log(`[ExportService] Fallback query retrieved ${cards.length} cards for collection ${collection.name}`);
              }
            } catch (fallbackError) {
              console.error('[ExportService] Fallback query failed:', fallbackError);
            }
          }
        }
        
        // Add this collection to the export data
        exportData.collections.push({
          id: collection.id,
          name: collection.name,
          description: collection.description || '',
          createdAt: collection.createdAt || new Date().toISOString(),
          updatedAt: collection.updatedAt || new Date().toISOString(),
          totalValue: collection.totalValue || 0,
          cardCount: cards.length,
          cards: cards.map(card => ({
            Unique_ID: card.Unique_ID || '',
            Type: card.Type || '',
            Name: card.Name || '',
            Flavor_Text: card.Flavor_Text || '',
            Rules_Text: card.Body_Text || '',
            Set_ID: card.Set_ID || '',
            Set_Name: card.Set_Name || '',
            Color: card.Color || '',
            Rarity: card.Rarity || '',
            Card_Num: card.Card_Num || 0,
            Ink_Cost: card.Cost || 0,
            Strength: card.Strength || 0,
            Willpower: card.Willpower || 0,
            Artist: card.Artist || '',
            collected: !!card.collected,
            quantity: 1,
            prices: card.prices || {
              usd: card.price_usd || null,
              usd_foil: card.price_usd_foil || null,
              tcgplayer_id: null
            }
          }))
        });
      }

      // Create more readable export data
      const jsonData = JSON.stringify(exportData, null, 2);

      // Create the export file with a timestamp in the filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `lorcana_collections_${timestamp}.json`;
      
      // Use a more accessible directory for exports
      // For Android, prefer the downloads directory which is easier to access
      let directory;
      if (Platform.OS === 'android' && RNFS.DownloadDirectoryPath) {
        directory = `${RNFS.DownloadDirectoryPath}/LorcanaExports`;
      } else {
        directory = this.getExportDirectory();
      }
      
      // Ensure the directory exists
      const dirExists = await RNFS.exists(directory);
      if (!dirExists) {
        await RNFS.mkdir(directory);
        console.log(`[ExportService] Created directory: ${directory}`);
      }
      
      const filePath = `${directory}/${fileName}`;
      
      console.log(`[ExportService] Writing export file to: ${filePath}`);
      
      // Write the data to the file
      await RNFS.writeFile(
        filePath, 
        jsonData, 
        'utf8'
      );
      
      console.log('[ExportService] Export completed successfully');
      
      // Show a notification for Android if using Downloads folder
      if (Platform.OS === 'android' && directory.includes('Download')) {
        Alert.alert(
          'Export Successful',
          `Your collections have been exported to:\n${filePath}\n\nYou can find this file in your Downloads/LorcanaExports folder.`
        );
      }
      
      return filePath;
    } catch (error) {
      console.error('[ExportService] Error exporting collections:', error);
      Alert.alert('Export Error', 'Failed to export your collections. Please try again.');
      throw new Error('Failed to export collections');
    }
  }

  /**
   * Export database data as SQL dump for debugging
   * @param {string} dbName The database name (e.g., 'lorcana', 'mtg')
   * @returns {Promise<string>} The path to the exported SQL file
   */
  async exportDatabaseAsSQL(dbName: string = 'lorcana'): Promise<string> {
    try {
      console.log(`[ExportService] Exporting database as SQL dump: ${dbName}`);

      // Get direct database access
      const db = await getDB();

      // Get all table names
      const [tablesResult] = await db.executeSql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const tables = [];
      for (let i = 0; i < tablesResult.rows.length; i++) {
        tables.push(tablesResult.rows.item(i).name);
      }

      console.log(`[ExportService] Found tables: ${tables.join(', ')}`);

      let sqlDump = `-- SQL Dump of ${dbName} database
-- Generated on ${new Date().toISOString()}
-- This file can be imported into SQLite using: sqlite3 database.db < dump.sql
\n`;

      // Export schema for each table
      for (const tableName of tables) {
        console.log(`[ExportService] Exporting schema for table: ${tableName}`);

        // Get CREATE TABLE statement
        const [schemaResult] = await db.executeSql(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
        if (schemaResult.rows.length > 0) {
          const createSql = schemaResult.rows.item(0).sql;
          if (createSql) {
            sqlDump += `${createSql};\n\n`;
          }
        }

        // Get all data from the table
        console.log(`[ExportService] Exporting data for table: ${tableName}`);
        const [dataResult] = await db.executeSql(`SELECT * FROM ${tableName}`);

        if (dataResult.rows.length > 0) {
          // Get column names for INSERT statements
          const [pragmaResult] = await db.executeSql(`PRAGMA table_info(${tableName})`);
          const columns = [];
          for (let i = 0; i < pragmaResult.rows.length; i++) {
            columns.push(pragmaResult.rows.item(i).name);
          }

          const columnList = columns.join(', ');
          sqlDump += `-- Data for table ${tableName}\n`;

          // Generate INSERT statements
          for (let i = 0; i < dataResult.rows.length; i++) {
            const row = dataResult.rows.item(i);
            const values = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
              return value;
            });
            sqlDump += `INSERT INTO ${tableName} (${columnList}) VALUES (${values.join(', ')});\n`;
          }
          sqlDump += '\n';
        }
      }

      // Create export filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportFileName = `${dbName}_database_dump_${timestamp}.sql`;

      // Try multiple directory options for better compatibility
      let exportDirectory;
      let exportMethod = 'unknown';

      if (Platform.OS === 'android') {
        // Try DownloadDirectoryPath first
        if (RNFS.DownloadDirectoryPath) {
          exportDirectory = `${RNFS.DownloadDirectoryPath}/DatabaseExports`;
          exportMethod = 'DownloadDirectoryPath';
          console.log(`[ExportService] Using Android DownloadDirectoryPath: ${RNFS.DownloadDirectoryPath}`);
        } else if (RNFS.ExternalStorageDirectoryPath) {
          // Fallback to external storage
          exportDirectory = `${RNFS.ExternalStorageDirectoryPath}/DatabaseExports`;
          exportMethod = 'ExternalStorageDirectoryPath';
          console.log(`[ExportService] Using Android ExternalStorageDirectoryPath: ${RNFS.ExternalStorageDirectoryPath}`);
        } else {
          // Last resort - app documents
          exportDirectory = `${RNFS.DocumentDirectoryPath}/DatabaseExports`;
          exportMethod = 'DocumentDirectoryPath';
          console.log(`[ExportService] Using Android DocumentDirectoryPath: ${RNFS.DocumentDirectoryPath}`);
        }
      } else {
        // iOS
        exportDirectory = `${RNFS.DocumentDirectoryPath}/DatabaseExports`;
        exportMethod = 'iOS DocumentDirectoryPath';
        console.log(`[ExportService] Using iOS DocumentDirectoryPath: ${RNFS.DocumentDirectoryPath}`);
      }

      console.log(`[ExportService] Export method: ${exportMethod}`);
      console.log(`[ExportService] Target export directory: ${exportDirectory}`);

      // Ensure export directory exists
      const dirExists = await RNFS.exists(exportDirectory);
      console.log(`[ExportService] Export directory exists: ${dirExists}`);
      if (!dirExists) {
        await RNFS.mkdir(exportDirectory);
        console.log(`[ExportService] Created export directory: ${exportDirectory}`);
      }

      const exportFilePath = `${exportDirectory}/${exportFileName}`;

      console.log(`[ExportService] Writing SQL dump to: ${exportFilePath}`);

      // Write the SQL dump
      await RNFS.writeFile(exportFilePath, sqlDump, 'utf8');

      console.log('[ExportService] SQL dump export completed successfully');

      // Verify the file was created
      const fileExists = await RNFS.exists(exportFilePath);
      console.log(`[ExportService] Exported file exists: ${fileExists}`);

      if (fileExists) {
        const fileStats = await RNFS.stat(exportFilePath);
        console.log(`[ExportService] Exported file size: ${fileStats.size} bytes`);

        // List directory contents to verify
        try {
          const dirContents = await RNFS.readDir(exportDirectory);
          console.log(`[ExportService] Directory contents (${exportDirectory}):`);
          dirContents.forEach(file => {
            console.log(`  - ${file.name} (${file.size} bytes)`);
          });
        } catch (listError) {
          console.error('[ExportService] Could not list directory contents:', listError);
        }
      } else {
        console.error(`[ExportService] WARNING: File was not created at ${exportFilePath}`);

        // List directory contents to debug
        try {
          const dirContents = await RNFS.readDir(exportDirectory);
          console.log(`[ExportService] Directory contents (${exportDirectory}):`);
          dirContents.forEach(file => {
            console.log(`  - ${file.name} (${file.size} bytes)`);
          });
        } catch (listError) {
          console.error('[ExportService] Could not list directory contents:', listError);
        }
      }

      // Show success message
      Alert.alert(
        'Database Export Successful',
        `Database exported as SQL dump using ${exportMethod}.\n\nFile location: ${exportFilePath}\n\nThis file contains all table schemas and data that can be imported into any SQLite database.`
      );

      return exportFilePath;
    } catch (error) {
      console.error('[ExportService] Error exporting database as SQL:', error);
      Alert.alert('Export Error', 'Failed to export database. Please try again.');
      throw new Error('Failed to export database');
    }
  }

  /**
   * Share the exported collections file
   * @param {string} filePath Path to the exported file
   */
  async shareLorcanaCollections(filePath: string): Promise<void> {
    try {
      // Get the file name
      const fileName = filePath.split('/').pop() || 'lorcana_collections.json';
      console.log(`[ExportService] Preparing to share file: ${fileName} from path: ${filePath}`);
      
      // For Android, use the native module approach
      if (Platform.OS === 'android') {
        // First, check if our AndroidShareModule is available
        if (AndroidShareModule && AndroidShareModule.shareFile) {
          try {
            // Use the native module to share the file
            console.log(`[ExportService] Using AndroidShareModule to share: ${filePath}`);
            await AndroidShareModule.shareFile(filePath, 'application/json', 'Lorcana Collections Export');
            console.log(`[ExportService] Native sharing successful for ${fileName}`);
            return;
          } catch (nativeShareError) {
            console.error('[ExportService] Native share failed:', nativeShareError);
            // Continue to fallback options if native sharing fails
          }
        }
        
        // If we can't use the native module or it failed, try file content sharing
        try {
          // First check if the file exists and is readable
          const fileExists = await RNFS.exists(filePath);
          if (!fileExists) {
            throw new Error(`File does not exist at path: ${filePath}`);
          }
          
          // Read the file content and share it as text
          console.log(`[ExportService] Reading file content to share: ${filePath}`);
          const fileContent = await RNFS.readFile(filePath, 'utf8');
          
          if (!fileContent || fileContent.trim() === '') {
            throw new Error('File content is empty');
          }
          
          // Share the file content in the message
          await Share.share(
            {
              title: 'Lorcana Collections Export',
              message: fileContent
            },
            {
              dialogTitle: 'Share Lorcana Collections',
              subject: 'Lorcana Collections Export'
            }
          );
          
          console.log(`[ExportService] Shared file content successfully: ${fileName}`);
          return;
        } catch (contentShareError) {
          console.error('[ExportService] Content share failed:', contentShareError);
          
          // Final fallback - try to copy to Downloads folder and let user know
          try {
            const downloadsDir = RNFS.DownloadDirectoryPath;
            const destPath = `${downloadsDir}/${fileName}`;
            
            // Copy the file to the Downloads folder
            await RNFS.copyFile(filePath, destPath);
            
            // Let the user know where the file is
            Alert.alert(
              'File Saved',
              `Your collection has been saved to:\n${destPath}\n\nYou can share this file manually from your Downloads folder.`
            );
            
            console.log(`[ExportService] Copied file to Downloads: ${destPath}`);
            return;
          } catch (copyError) {
            console.error('[ExportService] Copy to Downloads failed:', copyError);
            throw copyError;
          }
        }
      } else {
        // iOS file sharing approach
        try {
          // On iOS, we need to use the file URL format
          const fileUrl = `file://${filePath}`;
          
          await Share.share(
            {
              url: fileUrl,
              title: 'Lorcana Collections Export'
            },
            {
              subject: 'Lorcana Collections Export'
            }
          );
          
          console.log(`[ExportService] iOS sharing successful for: ${fileName}`);
          return;
        } catch (iosShareError) {
          console.error('[ExportService] iOS share failed:', iosShareError);
          
          // Fallback to content sharing for iOS
          try {
            const fileContent = await RNFS.readFile(filePath, 'utf8');
            
            await Share.share(
              {
                title: 'Lorcana Collections Export',
                message: fileContent
              },
              {
                subject: 'Lorcana Collections Export'
              }
            );
            
            console.log(`[ExportService] iOS content sharing successful for: ${fileName}`);
            return;
          } catch (contentError) {
            console.error('[ExportService] iOS content share failed:', contentError);
            throw contentError;
          }
        }
      }
    } catch (error) {
      console.error('[ExportService] Error sharing file:', error);
      Alert.alert('Share Error', 'Failed to share the collections file. ' + (error instanceof Error ? error.message : ''));
    }
  }

  /**
   * Import Lorcana collections from a JSON file
   * @param {string} filePath Path to the import file
   */
  /**
   * Validate and normalize card data from import
   */
  private validateAndNormalizeCard(cardFromFile: LorcanaExportCard): LorcanaExportCard | null {
    try {
      // Skip cards with missing essential data
      if (!cardFromFile.Unique_ID || !cardFromFile.Name) {
        console.warn(`[ExportService] Skipping card with missing Unique_ID or Name:`, cardFromFile);
        return null;
      }

      // Normalize Unique_ID format
      const correctedUniqueId = this.formatUniqueId(cardFromFile.Unique_ID);
      if (!correctedUniqueId) {
        console.warn(`[ExportService] Skipping card with invalid Unique_ID after formatting: ${cardFromFile.Name}`);
        return null;
      }

      // Normalize Set_ID format - convert old numeric formats to text codes
      let normalizedSetId = cardFromFile.Set_ID;
      if (normalizedSetId) {
        // Handle old numeric Set_IDs by mapping them to text codes
        const numericToTextMapping: { [key: string]: string } = {
          '1': 'TFC',   // The First Chapter
          '2': 'ROF',   // Rise of the Floodborn
          '3': 'INK',   // Into the Inklands
          '4': 'URS',   // Ursula's Return
          '5': 'SSK',   // Shimmering Skies
          '6': 'AZS',   // Azurite Sea
          '7': 'ARI',   // Archazia's Island
          '8': 'ROJ',   // Reign of Jafar
          '9': 'FAB',   // Fabled
          '10': 'WHI'   // Whispers in the Well
        };

        if (numericToTextMapping[normalizedSetId]) {
          console.log(`[ExportService] Converting old numeric Set_ID ${normalizedSetId} to ${numericToTextMapping[normalizedSetId]} for card ${cardFromFile.Name}`);
          normalizedSetId = numericToTextMapping[normalizedSetId];
        }

        // Also normalize any set_ prefixed IDs
        if (normalizedSetId.startsWith('set_')) {
          console.log(`[ExportService] Removing set_ prefix from Set_ID ${normalizedSetId} for card ${cardFromFile.Name}`);
          normalizedSetId = normalizedSetId.replace('set_', '').toUpperCase();
        }
      }

      // Return normalized card data
      return {
        ...cardFromFile,
        Unique_ID: correctedUniqueId,
        Set_ID: normalizedSetId
      };
    } catch (error) {
      console.error(`[ExportService] Error validating card ${cardFromFile.Name}:`, error);
      return null;
    }
  }

  private chunkValues<T>(values: T[]): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < values.length; i += this.queryChunkSize) {
      chunks.push(values.slice(i, i + this.queryChunkSize));
    }
    return chunks;
  }

  private async loadExistingIds(
    db: any,
    tableName: string,
    columnName: string,
    values: string[]
  ): Promise<Set<string>> {
    const existingValues = new Set<string>();
    if (values.length === 0) {
      return existingValues;
    }

    for (const chunk of this.chunkValues([...new Set(values)])) {
      const placeholders = chunk.map(() => '?').join(', ');
      const [result] = await db.executeSql(
        `SELECT ${columnName} AS value FROM ${tableName} WHERE ${columnName} IN (${placeholders})`,
        chunk
      );

      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        if (row?.value) {
          existingValues.add(String(row.value));
        }
      }
    }

    return existingValues;
  }

  private async loadExistingCollectionCardKeys(db: any, collectionIds: string[]): Promise<Set<string>> {
    const existingLinks = new Set<string>();
    if (collectionIds.length === 0) {
      return existingLinks;
    }

    for (const chunk of this.chunkValues([...new Set(collectionIds)])) {
      const placeholders = chunk.map(() => '?').join(', ');
      const [result] = await db.executeSql(
        `SELECT collection_id, card_id
         FROM lorcana_collection_cards
         WHERE collection_id IN (${placeholders})`,
        chunk
      );

      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        if (row?.collection_id && row?.card_id) {
          existingLinks.add(this.buildCollectionCardKey(String(row.collection_id), String(row.card_id)));
        }
      }
    }

    return existingLinks;
  }

  private buildCollectionCardKey(collectionId: string, cardId: string): string {
    return `${collectionId}::${cardId}`;
  }

  private getImportedCardQuantities(card: LorcanaExportCard): {
    quantity: number;
    quantityNormal: number;
    quantityFoil: number;
  } {
    const parsedQuantity = Number(card.quantity);
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0
      ? Math.floor(parsedQuantity)
      : 1;

    return {
      quantity,
      quantityNormal: quantity,
      quantityFoil: 0,
    };
  }

  private prepareImportCollections(importData: LorcanaExportData): {
    collections: PreparedImportCollection[];
    skippedCards: number;
  } {
    let skippedCards = 0;

    const collections = importData.collections.map((collection) => {
      const normalizedCards = collection.cards
        .map((card) => this.validateAndNormalizeCard(card))
        .filter((card): card is LorcanaExportCard => {
          const isValid = card !== null;
          if (!isValid) {
            skippedCards++;
          }
          return isValid;
        });

      return {
        ...collection,
        cards: normalizedCards,
      };
    });

    return { collections, skippedCards };
  }

  private async executeImport(
    db: any,
    collections: PreparedImportCollection[]
  ): Promise<ImportExecutionSummary> {
    const collectionIds = collections.map((collection) => collection.id);
    const cardIds = collections.flatMap((collection) => collection.cards.map((card) => card.Unique_ID));

    const existingCollectionIds = await this.loadExistingIds(db, 'lorcana_collections', 'id', collectionIds);
    const existingCardIds = await this.loadExistingIds(db, 'lorcana_cards', 'Unique_ID', cardIds);
    const existingCollectionCardKeys = await this.loadExistingCollectionCardKeys(db, collectionIds);

    let importedCollections = 0;
    let importedCards = 0;
    let transactionStarted = false;

    try {
      await db.executeSql('BEGIN IMMEDIATE TRANSACTION');
      transactionStarted = true;

      for (const collection of collections) {
        const collectionTimestamp = collection.updatedAt || collection.createdAt || new Date().toISOString();

        if (!existingCollectionIds.has(collection.id)) {
          await db.executeSql(
            `INSERT INTO lorcana_collections
             (id, name, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              collection.id,
              collection.name,
              collection.description || '',
              collection.createdAt || collectionTimestamp,
              collectionTimestamp,
            ]
          );
          existingCollectionIds.add(collection.id);
          importedCollections++;
        } else {
          await db.executeSql(
            `UPDATE lorcana_collections
             SET name = ?, description = ?, updated_at = ?
             WHERE id = ?`,
            [
              collection.name,
              collection.description || '',
              collectionTimestamp,
              collection.id,
            ]
          );
        }

        for (const card of collection.cards) {
          const cardTimestamp = new Date().toISOString();
          if (!existingCardIds.has(card.Unique_ID)) {
            await db.executeSql(
              `INSERT OR IGNORE INTO lorcana_cards (
                Unique_ID, Name, Set_ID, Set_Name, Type, Color, Rarity,
                Card_Num, Strength, Willpower, Artist, Flavor_Text,
                collected, price_usd, price_usd_foil, last_updated
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                card.Unique_ID,
                card.Name,
                card.Set_ID,
                card.Set_Name,
                card.Type,
                card.Color,
                card.Rarity,
                card.Card_Num || null,
                card.Strength || null,
                card.Willpower || null,
                card.Artist || null,
                card.Flavor_Text || null,
                card.collected ? 1 : 0,
                card.prices?.usd || null,
                card.prices?.usd_foil || null,
                cardTimestamp,
              ]
            );
            existingCardIds.add(card.Unique_ID);
          }

          if (card.prices?.usd != null || card.prices?.usd_foil != null) {
            await db.executeSql(
              `INSERT OR REPLACE INTO lorcana_card_prices
               (card_id, usd, usd_foil, tcgplayer_id, last_updated)
               VALUES (?, ?, ?, ?, ?)`,
              [
                card.Unique_ID,
                card.prices?.usd ?? null,
                card.prices?.usd_foil ?? null,
                card.prices?.tcgplayer_id ?? null,
                cardTimestamp,
              ]
            );
          }

          const linkKey = this.buildCollectionCardKey(collection.id, card.Unique_ID);
          const { quantity, quantityNormal, quantityFoil } = this.getImportedCardQuantities(card);
          if (!existingCollectionCardKeys.has(linkKey)) {
            await db.executeSql(
              `INSERT INTO lorcana_collection_cards
               (collection_id, card_id, quantity, quantity_normal, quantity_foil, added_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                collection.id,
                card.Unique_ID,
                quantity,
                quantityNormal,
                quantityFoil,
                cardTimestamp,
              ]
            );
            existingCollectionCardKeys.add(linkKey);
            importedCards++;
          } else {
            await db.executeSql(
              `UPDATE lorcana_collection_cards
               SET quantity = ?, quantity_normal = ?, quantity_foil = ?, added_at = ?
               WHERE collection_id = ? AND card_id = ?`,
              [
                quantity,
                quantityNormal,
                quantityFoil,
                cardTimestamp,
                collection.id,
                card.Unique_ID,
              ]
            );
          }
        }
      }

      await db.executeSql('COMMIT');
      transactionStarted = false;

      return {
        importedCollections,
        importedCards,
      };
    } catch (error) {
      if (transactionStarted) {
        try {
          await db.executeSql('ROLLBACK');
        } catch (rollbackError) {
          console.error('[ExportService] Failed to roll back import transaction:', rollbackError);
        }
      }
      throw error;
    }
  }

  async importLorcanaCollections(filePath: string): Promise<void> {
    try {
      console.log(`[ExportService] Importing collections from: ${filePath}`);
      
      // Read the file
      const fileContent = await RNFS.readFile(filePath, 'utf8');
      const importData: LorcanaExportData = JSON.parse(fileContent);
      const preparedImport = this.prepareImportCollections(importData);
      
      // Show alert to confirm import
      Alert.alert(
        'Import Collections',
        `Are you sure you want to import ${importData.collections.length} collections?`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Import',
            onPress: async () => {
              try {
                const db = await getDB();
                const importSummary = await this.executeImport(db, preparedImport.collections);
                await this.runPostImportCleanup();
                collectionCacheService.clearCache();
                void collectionCacheService.preloadCollections();

                collectionEventEmitter.emit('collectionsUpdated', {
                  type: 'import',
                  timestamp: new Date().toISOString(),
                  collectionsCount: preparedImport.collections.length
                });

                Alert.alert(
                  'Import Successful',
                  `Imported ${preparedImport.collections.length} collections and ${importSummary.importedCards} cards successfully.` +
                  (preparedImport.skippedCards > 0
                    ? ` Skipped ${preparedImport.skippedCards} invalid cards.`
                    : '')
                );
              } catch (error) {
                console.error('[ExportService] Error in import process:', error);
                Alert.alert('Import Error', 'Failed to import collections. Please try again.');
              }
            }
          }
        ]
      );
      
      console.log('[ExportService] Import prompt displayed');
    } catch (error) {
      console.error('[ExportService] Error importing collections:', error);
      Alert.alert('Import Error', 'Failed to import collections. Please check that the file is valid.');
    }
  }

  // Utility function to correct Unique_ID format
  /**
   * Run cleanup operations after import to handle any edge cases
   */
  private async runPostImportCleanup(): Promise<void> {
    try {
      const db = await getDB();

      // Clean up any cards that might have inconsistent Set_ID formats
      console.log('[ExportService] Cleaning up any inconsistent Set_ID formats...');
      const numericToTextMapping: { [key: string]: string } = {
        '1': 'TFC', '2': 'ROF', '3': 'INK', '4': 'URS',
        '5': 'SSK', '6': 'AZS', '7': 'ARI', '8': 'ROJ',
        '9': 'FAB', '10': 'WHI'
      };

      for (const [numeric, text] of Object.entries(numericToTextMapping)) {
        await db.executeSql(
          'UPDATE lorcana_cards SET Set_ID = ? WHERE Set_ID = ?',
          [text, numeric]
        );
      }

      await db.executeSql(
        'UPDATE lorcana_cards SET Set_ID = UPPER(REPLACE(Set_ID, "set_", "")) WHERE Set_ID LIKE "set_%"'
      );

    } catch (error) {
      console.warn('[ExportService] Post-import cleanup encountered errors:', error);
      // Don't throw - cleanup failure shouldn't break the import
    }
  }

  private formatUniqueId(id: string | undefined): string {
    if (!id || typeof id !== 'string') {
      // If id is undefined or not a string, return it as is or handle error
      // For safety, returning a placeholder or throwing an error might be better
      // but for now, we'll return it to avoid breaking if data is truly malformed.
      return id || '';
    }
    const parts = id.split('-');
    if (parts.length === 2) {
      const setId = parts[0];
      const cardNumStr = parts[1];
      const cardNum = parseInt(cardNumStr, 10);
      // Only pad if cardNumStr is a number and its length is less than 3, and setId is not empty
      if (setId && !isNaN(cardNum) && cardNumStr.length > 0 && cardNumStr.length < 3) {
        return `${setId}-${String(cardNum).padStart(3, '0')}`;
      }
    }
    return id; // Return original if format is unexpected, already padded, or not numeric card part
  }
}

export const exportService = new ExportService();
