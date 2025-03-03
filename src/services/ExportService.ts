import { Share, Alert, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { databaseService } from './DatabaseService';
import { getLorcanaCollectionCards, getLorcanaSetCollections, getDB } from './LorcanaService';
import { collectionCacheService } from './CollectionCacheService';
import type { LorcanaCardWithPrice, LorcanaPrice, PartialLorcanaCardWithPrice } from '../types/lorcana';
import type { ResultSet, Transaction } from 'react-native-sqlite-storage';
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

class ExportService {
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
  async importLorcanaCollections(filePath: string): Promise<void> {
    try {
      console.log(`[ExportService] Importing collections from: ${filePath}`);
      
      // Read the file
      const fileContent = await RNFS.readFile(filePath, 'utf8');
      const importData: LorcanaExportData = JSON.parse(fileContent);
      
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
                // Get the Lorcana database instance
                const db = await getDB();
                
                // Begin a transaction
                await new Promise<void>((resolve, reject) => {
                  db.transaction((tx: Transaction) => {
                    // Process each collection
                    for (const collection of importData.collections) {
                      console.log(`[ExportService] Importing collection: ${collection.name}`);
                      
                      // Check if the collection exists
                      tx.executeSql(
                        'SELECT id FROM lorcana_collections WHERE id = ?',
                        [collection.id],
                        (_, result: ResultSet) => {
                          if (result.rows.length === 0) {
                            // Create the collection if it doesn't exist
                            tx.executeSql(
                              `INSERT INTO lorcana_collections 
                              (id, name, description, created_at, updated_at) 
                              VALUES (?, ?, ?, ?, ?)`,
                              [
                                collection.id, 
                                collection.name, 
                                collection.description,
                                collection.createdAt,
                                collection.updatedAt
                              ],
                              (_, insertResult) => {
                                console.log(`[ExportService] Created collection: ${collection.name}`);
                              },
                              (_, error) => {
                                console.error('[ExportService] Error creating collection:', error);
                                return false;
                              }
                            );
                          } else {
                            console.log(`[ExportService] Collection already exists: ${collection.name}`);
                          }
                          
                          // Add each card to the collection
                          collection.cards.forEach(card => {
                            // First check if the card exists in lorcana_cards table
                            tx.executeSql(
                              'SELECT Unique_ID FROM lorcana_cards WHERE Unique_ID = ?',
                              [card.Unique_ID],
                              (_, cardExistsResult: ResultSet) => {
                                // If card doesn't exist in the cards table, add it first
                                if (cardExistsResult.rows.length === 0) {
                                  tx.executeSql(
                                    `INSERT OR IGNORE INTO lorcana_cards (
                                      Unique_ID, Name, Set_ID, Set_Name, Type, Color, Rarity, 
                                      Card_Num, Strength, Willpower, Artist, Flavor_Text, 
                                      collected, price_usd, price_usd_foil, last_updated
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                      card.Unique_ID,
                                      card.Name,
                                      card.Set_ID,
                                      card.Set_Name,
                                      card.Type,
                                      card.Color,
                                      card.Rarity,
                                      card.Card_Num,
                                      card.Strength || null,
                                      card.Willpower || null,
                                      card.Artist || null,
                                      card.Flavor_Text || null,
                                      card.collected ? 1 : 0,
                                      card.prices?.usd || null,
                                      card.prices?.usd_foil || null,
                                      new Date().toISOString()
                                    ],
                                    (_, insertCardResult) => {
                                      console.log(`[ExportService] Added new card to database: ${card.Name}`);
                                    },
                                    (_, error) => {
                                      console.error('[ExportService] Error adding card to database:', error);
                                      return false;
                                    }
                                  );
                                }
                                
                                // Now handle the collection card relationship
                                tx.executeSql(
                                  'SELECT card_id FROM lorcana_collection_cards WHERE card_id = ? AND collection_id = ?',
                                  [card.Unique_ID, collection.id],
                                  (_, cardResult: ResultSet) => {
                                    if (cardResult.rows.length === 0) {
                                      // Add the card if it doesn't exist in the collection
                                      tx.executeSql(
                                        `INSERT INTO lorcana_collection_cards 
                                        (collection_id, card_id, added_at) 
                                        VALUES (?, ?, ?)`,
                                        [
                                          collection.id,
                                          card.Unique_ID,
                                          new Date().toISOString()
                                        ],
                                        (_, insertCardResult) => {
                                          console.log(`[ExportService] Added card: ${card.Name} to collection: ${collection.name}`);
                                        },
                                        (_, error) => {
                                          console.error('[ExportService] Error adding card:', error);
                                          return false;
                                        }
                                      );
                                    } else {
                                      // Update the existing card
                                      tx.executeSql(
                                        `UPDATE lorcana_collection_cards 
                                        SET added_at = ? 
                                        WHERE card_id = ? AND collection_id = ?`,
                                        [
                                          new Date().toISOString(),
                                          card.Unique_ID,
                                          collection.id
                                        ],
                                        (_, updateCardResult) => {
                                          console.log(`[ExportService] Updated card: ${card.Name} in collection: ${collection.name}`);
                                        },
                                        (_, error) => {
                                          console.error('[ExportService] Error updating card:', error);
                                          return false;
                                        }
                                      );
                                    }
                                  },
                                  (_, error) => {
                                    console.error('[ExportService] Error checking card:', error);
                                    return false;
                                  }
                                );
                              },
                              (_, error) => {
                                console.error('[ExportService] Error checking if card exists:', error);
                                return false;
                              }
                            );
                          });
                        },
                        (_, error) => {
                          console.error('[ExportService] Error checking collection:', error);
                          return false;
                        }
                      );
                    }
                    
                    // Commit the transaction
                    resolve();
                  }, 
                  error => {
                    console.error('[ExportService] Transaction error:', error);
                    reject(new Error('Failed to import collections'));
                  },
                  () => {
                    console.log('[ExportService] Import transaction completed successfully');
                    // Refresh the collections cache
                    if (collectionCacheService.preloadCollections) {
                      collectionCacheService.preloadCollections();
                    }
                    
                    // Emit an event to notify that collections have been updated
                    collectionEventEmitter.emit('collectionsUpdated', {
                      type: 'import',
                      timestamp: new Date().toISOString(),
                      collectionsCount: importData.collections.length
                    });
                    
                    Alert.alert(
                      'Import Successful',
                      `Imported ${importData.collections.length} collections successfully. Your collection screens will refresh automatically with the new data.`
                    );
                  });
                });
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
}

export const exportService = new ExportService();