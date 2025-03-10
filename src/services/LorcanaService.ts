import { openDatabase, SQLiteDatabase, enablePromise } from 'react-native-sqlite-storage'
import RNFS from 'react-native-fs'
import { updateAllImageUrlsInDatabase } from '../utils/imageUtils'
import { LorcanaCard, LorcanaCardWithPrice, PartialLorcanaCardWithPrice } from '../types/lorcana'
import DatabaseInitializer from './DatabaseInitializer'

// Enable promise support for SQLite
enablePromise(true)

const LorcanaBulkCardApi = 'https://api.lorcana-api.com/bulk/cards'
const LorcastPriceApi = 'https://api.lorcast.com/v0/cards/search'
const LorcanaNewSetApi = 'https://api.lorcast.com/v0/sets/7/cards'

let dbInstance: SQLiteDatabase | null = null
let isInitialized = false
let initializationPromise: Promise<void> | null = null

// Utility function for standardized error handling
const handleError = (message: string, error: any) => {
    console.error(`[LorcanaService] ${message}:`, error);
    throw error;
};

// Export getDB function
export const getDB = async () => {
    try {
        return await DatabaseInitializer.getDatabase('lorcana');
    } catch (error) {
        console.error('[LorcanaService] Error getting database:', error);
        throw error;
    }
};

const verifyAndRepairDatabase = async () => {
    console.log('[LorcanaService] Starting database verification...');
    try {
        const db = await getDB();
        console.log('[LorcanaService] Got database connection for verification');
        
        // Check if tables exist instead of dropping them
        console.log('[LorcanaService] Checking existing tables...');
        const [tablesResult] = await db.executeSql(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND (
                name='lorcana_cards' OR 
                name='lorcana_collections' OR 
                name='lorcana_collection_cards'
            )
        `);
        
        const existingTables = new Set<string>();
        for (let i = 0; i < tablesResult.rows.length; i++) {
            existingTables.add(tablesResult.rows.item(i).name);
        }
        
        console.log(`[LorcanaService] Found ${existingTables.size} Lorcana database tables:`, Array.from(existingTables));
        
        // Only recreate tables if needed
        console.log('[LorcanaService] Ensuring tables are created...');
        await ensureTablesCreated();
        console.log('[LorcanaService] Tables verified/created successfully');
        
        // Update image URLs
        console.log('[LorcanaService] Updating image URLs...');
        await updateLorcanaImageUrls();
        console.log('[LorcanaService] Image URLs updated successfully');
    } catch (error) {
        console.error('[LorcanaService] Error in verifyAndRepairDatabase:', error);
        if (error instanceof Error) {
            console.error('[LorcanaService] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
        throw error;
    }
};

const ensureTablesCreated = async () => {
    console.log('[LorcanaService] Starting ensureTablesCreated...');
    try {
        // DatabaseInitializer handles table creation
        // We can keep this function for backward compatibility
        return true;
    } catch (error) {
        console.error('[LorcanaService] Error in ensureTablesCreated:', error);
        if (error instanceof Error) {
            console.error('[LorcanaService] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
        throw error;
    }
};

// Add this mapping function
const mapLorcastSetCodeToSetId = (setCode: string): string | null => {
    const setMapping: { [key: string]: string } = {
        '1': 'TFC',  // The First Chapter
        '2': 'ROF',  // Rise of the Floodborn
        '3': 'INK',  // Into the Inklands
        '4': 'URS',   // Ursula's Return
        '5': 'SSK',   // Shimmering Skies
        '6': 'AZS',   // Azurite Sea
        '7': 'ARI'    // Archazia's Island
    };
    return setMapping[setCode] || null;
};

export const initializeLorcanaDatabase = async () => {
    try {
        console.log('[LorcanaService] Initializing Lorcana database...');
        isInitialized = false;
        
        // Use DatabaseInitializer to ensure database is initialized
        await DatabaseInitializer.initializeAllDatabases();
        
        // The database and tables will be ready after calling initializeAllDatabases
        console.log('[LorcanaService] Lorcana database initialized successfully');
        isInitialized = true;
        return true;
    } catch (error) {
        console.error('[LorcanaService] Error initializing Lorcana database:', error);
        if (error instanceof Error) {
            console.error('[LorcanaService] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
        isInitialized = false;
        return false;
    }
};

// Add function to populate the lorcana_card_prices table from existing data
const populateLorcanaCardPricesTable = async () => {
    try {
        console.log('[LorcanaService] Checking lorcana_card_prices table...');
        const db = await getDB();
        
        // First check if the table exists
        const [tableResult] = await db.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='lorcana_card_prices'");
        
        if (tableResult.rows.length === 0) {
            console.log('[LorcanaService] lorcana_card_prices table not found, creating it...');
            await db.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_card_prices (
                card_id TEXT PRIMARY KEY NOT NULL,
                usd TEXT,
                usd_foil TEXT,
                tcgplayer_id TEXT,
                last_updated TEXT,
                FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
            )`);
            
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_card_prices_card_id ON lorcana_card_prices(card_id)');
        }
        
        // Check if we need to populate the table
        const [countResult] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_card_prices');
        const priceCount = countResult.rows.item(0).count;
        
        // Count cards with price data in the lorcana_cards table
        const [cardCountResult] = await db.executeSql(
            "SELECT COUNT(*) as count FROM lorcana_cards WHERE price_usd IS NOT NULL OR price_usd_foil IS NOT NULL");
        const cardsWithPriceCount = cardCountResult.rows.item(0).count;
        
        console.log(`[LorcanaService] Found ${priceCount} price entries and ${cardsWithPriceCount} cards with price data`);
        
        if (priceCount === 0 && cardsWithPriceCount > 0) {
            console.log('[LorcanaService] Populating lorcana_card_prices table from existing card data...');
            
            // Copy price data from lorcana_cards to lorcana_card_prices
            await db.executeSql(`
                INSERT OR IGNORE INTO lorcana_card_prices (card_id, usd, usd_foil, last_updated)
                SELECT Unique_ID, price_usd, price_usd_foil, last_updated FROM lorcana_cards
                WHERE Unique_ID IS NOT NULL AND (price_usd IS NOT NULL OR price_usd_foil IS NOT NULL)
            `);
            
            // Check if the population was successful
            const [newCountResult] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_card_prices');
            console.log(`[LorcanaService] Successfully populated lorcana_card_prices table with ${newCountResult.rows.item(0).count} entries`);
        } else {
            console.log('[LorcanaService] lorcana_card_prices table already populated or no price data available');
        }
    } catch (error) {
        console.error('[LorcanaService] Error populating lorcana_card_prices table:', error);
    }
};

// Helper function to get all Lorcana cards from the database
export const getLorcanaCards = async () => {
    try {
        const db = await getDB();
        const [results] = await db.executeSql('SELECT * FROM lorcana_cards;');
        return results.rows.raw();
    } catch (error) {
        return handleError('Error getting Lorcana cards', error);
    }
};

// Helper function to search Lorcana cards by name
export const searchLorcanaCards = async (name: string, subtype?: string | null) => {
    if (!isInitialized) {
        await initializeLorcanaDatabase();
    }
    
    const mainName = name.trim();
    const version = subtype?.trim();
    const db = await getDB();
    
    let results;
    
    // If we have both name and version, try exact match first
    if (version) {
        const fullName = `${mainName} - ${version}`;
        [results] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE Name IS NOT NULL AND UPPER(Name) = UPPER(?);',
            [fullName]
        );
        
        // If no results, try matching with fuzzy version match
        if (results.rows.length === 0) {
            [results] = await db.executeSql(
                `SELECT * FROM lorcana_cards 
                 WHERE Name IS NOT NULL 
                 AND UPPER(SUBSTR(Name, 1, INSTR(Name, " - ") - 1)) = UPPER(?) 
                 AND (
                     UPPER(SUBSTR(Name, INSTR(Name, " - ") + 3)) LIKE UPPER(?)
                     OR UPPER(SUBSTR(Name, INSTR(Name, " - ") + 3)) LIKE UPPER(?)
                     OR UPPER(?) LIKE UPPER(SUBSTR(Name, INSTR(Name, " - ") + 3)) || '%'
                     OR UPPER(SUBSTR(Name, INSTR(Name, " - ") + 3)) LIKE '%' || UPPER(?) || '%'
                 );`,
                [mainName, `%${version}%`, `${version}%`, version, version]
            );
        }
    } else {
        // Try matching just the main name
        [results] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE Name IS NOT NULL AND UPPER(SUBSTR(Name, 1, INSTR(Name, " - ") - 1)) = UPPER(?);',
            [mainName]
        );
    }
    
    // If still no results, try a more flexible match on the main name
    if (results.rows.length === 0) {
        [results] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE Name IS NOT NULL AND UPPER(Name) LIKE UPPER(?);',
            [`%${mainName}%`]
        );
    }
    
    return results.rows.raw();
}

    // Debug function to list all card names
    export const listAllCardNames = async () => {
        try {
            const db = await getDB()
            
            // Check total count
            const [countResults] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards')
            const totalCount = countResults.rows.item(0).count
            console.log(`[LorcanaService] Total cards in database: ${totalCount}`)

        } catch (error) {
            console.error('Error listing card names:', error)
        }
}

const insertTcgplayerId = async (cardId: string, tcgplayerId: string) => {
    try {
        const db = await getDB();
        await db.executeSql(
            'INSERT OR REPLACE INTO lorcana_card_prices (card_id, tcgplayer_id, last_updated) VALUES (?, ?, ?)',    
            [cardId, tcgplayerId, new Date().toISOString()]
        );
    } catch (error) {
        console.error('[LorcanaService] Error inserting TCGPlayer ID:', error);
        throw error;
    }
};


// Function to fetch current price for a card
export const getLorcanaCardPrice = async (card: { Name: string; Set_Num?: number; Rarity?: string; Card_Num?: number; Unique_ID?: string }) => {
    try {
        // Log the card details we're searching for
        console.log(`[LorcanaService] Fetching price for card: ${card.Name}, Set_Num: ${card.Set_Num}, Card_Num: ${card.Card_Num}, Rarity: ${card.Rarity}, Unique_ID: ${card.Unique_ID}`);
        
        // First try using Unique_ID if available (prioritize this for enchanted cards)
        const isEnchanted = card.Rarity === 'Enchanted';
        
        if (card.Unique_ID && isEnchanted) {
            const enchantedUrl = `https://api.lorcast.com/v0/cards/${card.Unique_ID}`;
            console.log(`[LorcanaService] Trying unique ID search: ${enchantedUrl}`);
            
            try {
                const enchantedResponse = await fetch(enchantedUrl);
                
                if (enchantedResponse.ok) {
                    const enchantedData = await enchantedResponse.json();
                    console.log(`[LorcanaService] Unique ID search successful:`, enchantedData?.name || 'No name');
                    
                    if (enchantedData) {
                        // Check if we have an image_uris object with a digital.normal URL
                        if (enchantedData.image_uris?.digital?.normal) {
                            // Update the image URL in the database
                            await updateCardImageUrl(card.Unique_ID, enchantedData.image_uris.digital.normal);
                        }
                        if (enchantedData.tcgplayer_id) {
                            await insertTcgplayerId(card.Unique_ID, enchantedData.tcgplayer_id);
                        }
                        
                        // For enchanted cards, which only come in foil, use the foil price as the regular price too
                        const foilPrice = enchantedData.prices?.usd_foil || enchantedData.prices?.foil || null;
                        const normalPrice = isEnchanted ? foilPrice : (enchantedData.prices?.regular || enchantedData.prices?.usd || null);
                        
                        // Save the price data to the lorcana_card_prices table if we have a Unique_ID
                        if (card.Unique_ID) {
                            try {
                                const db = await getDB();
                                await db.executeSql(
                                    `INSERT OR REPLACE INTO lorcana_card_prices (card_id, usd, usd_foil, tcgplayer_id, last_updated) 
                                     VALUES (?, ?, ?, ?, ?)`,
                                    [
                                        card.Unique_ID,
                                        normalPrice,
                                        foilPrice,
                                        enchantedData.tcgplayer_id || null,
                                        new Date().toISOString()
                                    ]
                                );
                                console.log(`[LorcanaService] Price data saved to database for card ID: ${card.Unique_ID}`);
                            } catch (err) {
                                console.error(`[LorcanaService] Error saving price data to database: ${err}`);
                            }
                        }
                        
                        return {
                            usd: normalPrice,
                            usd_foil: foilPrice,
                            tcgplayer_id: enchantedData.tcgplayer_id || null
                        };
                    }
                } else {
                    console.log(`[LorcanaService] Unique ID search failed with status: ${enchantedResponse.status}`);
                }
            } catch (error) {
                console.log(`[LorcanaService] Error during unique ID search:`, error);
                // Continue to next method
            }
        }
        
        // Next, check if we have both Set_Num and Card_Num to use the direct endpoint
        if (card.Set_Num !== undefined && card.Card_Num !== undefined) {
            // Use the direct card retrieval endpoint
            const directUrl = `https://api.lorcast.com/v0/cards/${card.Set_Num}/${card.Card_Num}`;
            console.log(`[LorcanaService] Trying set/number search: ${directUrl}`);
            
            try {
                const response = await fetch(directUrl);
                
                if (response.ok) {
                    const cardData = await response.json();
                    console.log(`[LorcanaService] Set/number search successful:`, cardData?.name || 'No name');
                    
                    if (cardData) {
                        // Check if we have an image_uris object with a digital.normal URL
                        if (cardData.image_uris?.digital?.normal && card.Unique_ID) {
                            await updateCardImageUrl(card.Unique_ID, cardData.image_uris.digital.normal);
                        }
                        
                        
                        // For enchanted cards, which only come in foil, use the foil price as the regular price too
                        const foilPrice = cardData.prices?.usd_foil || cardData.prices?.foil || null;
                        const normalPrice = isEnchanted ? foilPrice : (cardData.prices?.regular || cardData.prices?.usd || null);
                        
                        // Save the price data to the lorcana_card_prices table if we have a Unique_ID
                        if (card.Unique_ID) {
                            try {
                                const db = await getDB();
                                await db.executeSql(
                                    `INSERT OR REPLACE INTO lorcana_card_prices (card_id, usd, usd_foil, tcgplayer_id, last_updated) 
                                     VALUES (?, ?, ?, ?, ?)`,
                                    [
                                        card.Unique_ID,
                                        normalPrice,
                                        foilPrice,
                                        cardData.tcgplayer_id || null,
                                        new Date().toISOString()
                                    ]
                                );
                                console.log(`[LorcanaService] Price data saved to database for card ID: ${card.Unique_ID} (set/number search)`);
                            } catch (err) {
                                console.error(`[LorcanaService] Error saving price data to database (set/number search): ${err}`);
                            }
                        }
                        
                        return {
                            usd: normalPrice,
                            usd_foil: foilPrice,
                            tcgplayer_id: cardData.tcgplayer_id || null
                        };
                    }
                } else {
                    console.log(`[LorcanaService] Set/number search failed with status: ${response.status}`);
                }
            } catch (error) {
                console.log(`[LorcanaService] Error during set/number search:`, error);
                // Continue to fallback search
            }
        }
        
        // Fall back to search approach if both direct methods fail
        console.log(`[LorcanaService] Direct lookup methods failed, falling back to search API`);
        const searchResult = await getLorcanaCardPriceBySearch(card);
        
        // Try to update the image URL from the search result if available
        if (card.Unique_ID && searchResult?.searchResponse?.results?.length > 0) {
            const foundCard = searchResult.searchResponse.results[0];
            if (foundCard.image_uris?.digital?.normal) {
                await updateCardImageUrl(card.Unique_ID, foundCard.image_uris.digital.normal);
            }
        }
        
        // Return only the price data to maintain backward compatibility
        const { searchResponse, ...priceData } = searchResult;
        return priceData;
    } catch (error) {
        console.error('[LorcanaService] Error fetching Lorcana card price:', error);
        throw error;
    }
};

// Helper function to debug card data integrity issues
export const debugCardData = (card: any, source: string) => {
    if (!card) {
        console.log(`[LorcanaService] WARNING: Null card object from ${source}`);
        return;
    }
    
    // Skip debugging for MTG cards
    if ('name' in card && !('Name' in card)) {
        console.log(`[LorcanaService] Received MTG card in ${source}, skipping Lorcana debug checks`);
        return;
    }
    
    const hasName = Boolean(card.Name);
    const hasSetNum = card.Set_Num !== undefined;
    const hasCardNum = card.Card_Num !== undefined;
    const hasUniqueId = Boolean(card.Unique_ID);
    const hasRarity = Boolean(card.Rarity);
    
    // Only log if we're missing important fields
    if (!hasCardNum || !hasUniqueId) {
        console.log(`[LorcanaService] Incomplete card from ${source}:
            Name: ${card.Name || 'MISSING'}
            Set_Num: ${card.Set_Num !== undefined ? card.Set_Num : 'MISSING'}
            Card_Num: ${card.Card_Num !== undefined ? card.Card_Num : 'MISSING'}
            Rarity: ${card.Rarity || 'MISSING'}
            Unique_ID: ${card.Unique_ID || 'MISSING'}
            Original Object: ${JSON.stringify(card)}
        `);
    }
};

/**
 * Updates the image URL for a card in the database
 */
const updateCardImageUrl = async (cardId: string, imageUrl: string) => {
    try {
        // Skip if the image URL is null or empty
        if (!imageUrl) return;
        
       
        
        // Attempt to get a better URL if this is a HEIF image
        let finalImageUrl = imageUrl;        
        // Get database connection
        const db = await getDB();
        
        // First check if the current image URL is different
        const [result] = await db.executeSql(
            'SELECT Image FROM lorcana_cards WHERE Unique_ID = ?',
            [cardId]
        );
        
        if (result.rows.length > 0) {
            const currentImage = result.rows.item(0).Image;
            
            // Only update if the URLs are different
            if (currentImage !== finalImageUrl) {
                await db.executeSql(
                    'UPDATE lorcana_cards SET Image = ? WHERE Unique_ID = ?',
                    [finalImageUrl, cardId]
                );
            }
        }
    } catch (error) {
        // Don't throw the error as this is not critical functionality
        console.error(`[LorcanaService] Error updating image URL:`, error);
    }
};

// Original search-based implementation extracted as a fallback method
const getLorcanaCardPriceBySearch = async (card: { Name: string; Set_Num?: number; Rarity?: string; Card_Num?: number }) => {
    try {
        // Split name into base name and version at " - " (space-hyphen-space)
        // This preserves hyphens within names like "Happy-Go-Lucky"
        const parts = card.Name.split(" - ");
        const baseName = parts[0].trim();
        const version = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";

        // Format rarity to lowercase after underscore
        const formattedRarity = card.Rarity ? card.Rarity.replace(' ', '_').replace('_R', '_r') : '';
        console.log('[LorcanaService] Formatted rarity:', formattedRarity);

        // Build search query using card details and properly encode each part
        // Only include set if the card is not enchanted
        const queryParts = [
            `name:"${baseName.replace(/"/g, '\\"')}"`, // Escape quotes in name
            version ? `version:"${version.replace(/"/g, '\\"')}"` : '',
            card.Set_Num && card.Rarity !== 'Enchanted' ? `set:${card.Set_Num}` : '',
            formattedRarity ? `rarity:${formattedRarity}` : ''
        ].filter(Boolean);
        
        // Encode the entire query string after building it
        const query = `q=${encodeURIComponent(queryParts.join(' '))}`;
        console.log('[LorcanaService] Fetching price with query:', LorcastPriceApi + '?' + query);
        
        const response = await fetch(`${LorcastPriceApi}?${query}`);
        const data = await response.json();
        console.log('[LorcanaService] API response:', data);
        
        let searchResponse = data;

        if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
            // Try a more lenient search if exact match fails
            const lenientQuery = `q=${encodeURIComponent(`name:"${baseName.replace(/"/g, '\\"')}"`)}`;
            console.log('[LorcanaService] Trying lenient search:', LorcastPriceApi + '?' + lenientQuery);
            
            const lenientResponse = await fetch(`${LorcastPriceApi}?${lenientQuery}`);
            const lenientData = await lenientResponse.json();
            searchResponse = lenientData;
            
            if (!lenientData.results || !Array.isArray(lenientData.results) || lenientData.results.length === 0) {
                console.log('[LorcanaService] No results found for card:', card.Name);
                return {
                    usd: null,
                    usd_foil: null,
                    tcgplayer_id: null,
                    searchResponse: null
                };
            }
            
            // Find the best match from lenient results
            const exactMatch = lenientData.results.find((result: { name: string; version?: string }) => {
                const nameMatches = result.name.toLowerCase() === baseName.toLowerCase();
                if (!version || !result.version) return nameMatches;
                
                // Normalize versions by removing extra spaces, converting to lowercase, and removing special characters
                const normalizeVersion = (str: string) => str
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .replace(/[^a-z0-9 ]/g, '')
                    .trim();
                
                const normalizedVersion = normalizeVersion(version);
                const normalizedResultVersion = normalizeVersion(result.version);
                
                // Log the comparison for debugging
                console.log('[LorcanaService] Version comparison:', {
                    original: version,
                    normalized: normalizedVersion,
                    resultOriginal: result.version,
                    resultNormalized: normalizedResultVersion
                });
                
                // Check for exact match first
                if (normalizedVersion === normalizedResultVersion) return nameMatches;
                
                // Check for substring match (in case our version is partial)
                if (normalizedResultVersion.includes(normalizedVersion) || 
                    normalizedVersion.includes(normalizedResultVersion)) {
                    return nameMatches;
                }
                
                // Calculate similarity (allow for small typos)
                const distance = levenshteinDistance(normalizedVersion, normalizedResultVersion);
                const maxLength = Math.max(normalizedVersion.length, normalizedResultVersion.length);
                const similarity = 1 - (distance / maxLength);
                
                // Accept if similarity is high enough (90% similar)
                return nameMatches && similarity > 0.9;
            });
            
            if (!exactMatch) {
                console.log('[LorcanaService] No exact match found in lenient results');
                return {
                    usd: null,
                    usd_foil: null,
                    tcgplayer_id: null,
                    searchResponse: null
                };
            }
            
            data.results = [exactMatch];
        }

        // Use the first result from the results array
        const cardData = data.results[0];
        console.log('[LorcanaService] Card prices data:', cardData.prices);

        // For enchanted cards, which only come in foil, use the foil price as the regular price too
        const isEnchanted = card.Rarity === 'Enchanted';
        const foilPrice = cardData.prices?.usd_foil || cardData.prices?.foil || null;

        const prices = {
            usd: isEnchanted ? foilPrice : (cardData.prices?.regular || cardData.prices?.usd || null),
            usd_foil: foilPrice,
            tcgplayer_id: cardData.tcgplayer_id || null,
            searchResponse: searchResponse
        };

        return prices;
    } catch (error) {
        console.error('[LorcanaService] Error fetching Lorcana card price by search:', error);
        throw error;
    }
};


export const removeLorcanaCardFromCollection = async (cardId: string, collectionId: string): Promise<void> => {

    try {
        const db = await getDB();
        await db.executeSql(
            `DELETE FROM lorcana_collection_cards 
             WHERE card_id = ? AND collection_id = ?`,
            [cardId, collectionId]
        );
    } catch (error) {
        console.error('Error removing Lorcana card from collection:', error);
        throw error;
    }
}

// Function to get card with latest price from database
export const getLorcanaCardWithPrice = async (cardId: string) => {
    try {
        const db = await getDB()
        const [results] = await db.executeSql(
            `SELECT * FROM lorcana_cards WHERE Unique_ID = ?;`,
            [cardId]
        )
        
        if (results.rows.length === 0) {
            return null
        }

        const card = results.rows.item(0)
        
        // Get price (will use cached price if available and recent)
        const prices = await getLorcanaCardPrice(card)
        
        return {
            ...card,
            prices,
            collected: Boolean(card.collected)
        }
    } catch (error) {
        console.error('Error getting Lorcana card with price:', error)
        throw error
    }
}

// New function to mark a card as collected
export const markCardAsCollected = async (cardId: string) => {
    try {
        const db = await getDB()
        await db.executeSql(
            'UPDATE lorcana_cards SET collected = 1 WHERE Unique_ID = ?;',
            [cardId]
        )
    } catch (error) {
        console.error('Error marking card as collected:', error)
        throw error
    }
}

// New function to get all collected cards
export const getCollectedCards = async () => {
    try {
        const db = await getDB()
        const [results] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE collected = 1;'
        )
        return results.rows.raw()
    } catch (error) {
        console.error('Error getting collected cards:', error)
        throw error
    }
}

// Function to clear the Lorcana cards table
export const clearLorcanaDatabase = async () => {
    try {
        const db = await getDB();
        await db.executeSql('DELETE FROM lorcana_cards;');
        await db.executeSql('DELETE FROM sqlite_sequence WHERE name="lorcana_cards";'); // Reset autoincrement
        isInitialized = false;
    } catch (error) {
        handleError('Error clearing Lorcana database', error);
    }
};

// Function to force reload all cards
export const reloadLorcanaCards = async () => {
    try {
        // Reset initialization state
        isInitialized = false;
        initializationPromise = null;
        
        // Close existing database connection if any
        if (dbInstance) {
            await dbInstance.close();
            dbInstance = null;
        }
        
        // Verify and repair database structure
        await verifyAndRepairDatabase();
        
        // Initialize database with fresh data
        await initializeLorcanaDatabase();
    } catch (error) {
        console.error('Error reloading Lorcana cards:', error);
        throw error;
    }
};

// Add new functions for set collections
export const getOrCreateLorcanaSetCollection = async (setId: string, setName: string): Promise<string> => {
    try {
        if (!setId || !setName) {
            console.error('[LorcanaService] Invalid set ID or name:', { setId, setName });
            throw new Error('Set ID and name are required');
        }

        const db = await getDB();
        
        // Ensure tables exist
        await ensureTablesCreated();

        // Try to find existing collection
        const collectionName = `Set: ${setName}`;
        const [existingCollection] = await db.executeSql(
            'SELECT id FROM lorcana_collections WHERE name = ? OR description LIKE ?',
            [collectionName, `%${setId})`]
        );

        if (existingCollection.rows.length > 0) {
            const collectionId = existingCollection.rows.item(0).id;
            console.log(`[LorcanaService] Found existing collection: ${collectionId}`);
            return collectionId;
        }

        // Create new collection
        const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const now = new Date().toISOString();
        const description = `Collection for ${setName} (${setId})`;

        await db.executeSql(
            `INSERT INTO lorcana_collections (id, name, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [id, collectionName, description, now, now]
        );

        console.log(`[LorcanaService] Created new collection: ${id}`);

        // Verify the collection was created
        const [verifyCollection] = await db.executeSql(
            'SELECT id FROM lorcana_collections WHERE id = ?',
            [id]
        );

        if (verifyCollection.rows.length === 0) {
            throw new Error('Failed to create collection - verification failed');
        }

        return id;
    } catch (error) {
        console.error('[LorcanaService] Error in getOrCreateLorcanaSetCollection:', error);
        throw error;
    }
};

export const addCardToLorcanaCollection = async (cardId: string, collectionId: string): Promise<void> => {
    try {
        if (!cardId || !collectionId) {
            console.error('[LorcanaService] Invalid card ID or collection ID:', { cardId, collectionId });
            throw new Error('Card ID and collection ID are required');
        }

        const db = await getDB();
        const now = new Date().toISOString();

        // Get the card details first
        const [cardDetails] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE Unique_ID = ?',
            [cardId]
        );

        if (cardDetails.rows.length === 0) {
            throw new Error(`Card ${cardId} not found in database`);
        }

        const card = cardDetails.rows.item(0);
        
        // Verify this is a Lorcana card (has Name not name property)
        if (!('Name' in card) || ('name' in card && !('Name' in card))) {
            console.error('[LorcanaService] Attempted to add non-Lorcana card to Lorcana collection:', card);
            throw new Error('Invalid Lorcana card object');
        }

        // Verify the collection exists
        const [collectionExists] = await db.executeSql(
            'SELECT id FROM lorcana_collections WHERE id = ?',
            [collectionId]
        );

        if (collectionExists.rows.length === 0) {
            throw new Error(`Collection ${collectionId} not found`);
        }

        // Fetch current price
        debugCardData(card, 'addCardToLorcanaCollection');
        const prices = await getLorcanaCardPrice({
            Name: card.Name,
            Set_Num: card.Set_Num,
            Card_Num: card.Card_Num,
            Rarity: card.Rarity,
            Unique_ID: card.Unique_ID
        });

        // Use a transaction to ensure all operations complete
        await db.transaction(async (tx) => {
            // Add to collection_cards table
            await tx.executeSql(
                'INSERT OR REPLACE INTO lorcana_collection_cards (collection_id, card_id, added_at) VALUES (?, ?, ?)',
                [collectionId, cardId, now]
            );

            // Update collection timestamp
            await tx.executeSql(
                'UPDATE lorcana_collections SET updated_at = ? WHERE id = ?',
                [now, collectionId]
            );

            // Mark card as collected and update prices
            await tx.executeSql(
                'UPDATE lorcana_cards SET collected = 1, price_usd = ?, price_usd_foil = ?, last_updated = ? WHERE Unique_ID = ?',
                [prices.usd, prices.usd_foil, now, cardId]
            );
        });

        // Verify the card was added
        const [verifyCard] = await db.executeSql(
            'SELECT * FROM lorcana_collection_cards WHERE collection_id = ? AND card_id = ?',
            [collectionId, cardId]
        );

        if (verifyCard.rows.length === 0) {
            throw new Error('Card was not added to collection - verification failed');
        }

        console.log(`[LorcanaService] Successfully added card ${cardId} to collection ${collectionId} with prices:`, prices);
    } catch (error) {
        console.error('[LorcanaService] Error in addCardToLorcanaCollection:', error);
        throw error;
    }
};

export const getLorcanaSetCollections = async (forceRefresh: boolean = false): Promise<Array<{
    cardCount: number
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
    totalValue: number;
}>> => {
    try {
        const db = await getDB();
        // Use 24 hour cache time 
        const cacheTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Get collections that need updating
        const [collectionsToUpdate] = await db.executeSql(`
            SELECT DISTINCT c.id, c.updated_at
            FROM lorcana_collections c
            INNER JOIN lorcana_collection_cards lcc ON c.id = lcc.collection_id
            INNER JOIN lorcana_cards lc ON lcc.card_id = lc.Unique_ID
            WHERE c.name LIKE 'Set: %'
            AND (
                lc.last_updated IS NULL 
                OR lc.last_updated < ?
                OR lc.price_usd IS NULL
                OR (? = 1)
            )
        `, [cacheTime, forceRefresh ? 1 : 0]);

        // Update prices for collections that need it
        for (let i = 0; i < collectionsToUpdate.rows.length; i++) {
            const collection = collectionsToUpdate.rows.item(i);
            const [cardsToUpdate] = await db.executeSql(`
                SELECT lc.*
                FROM lorcana_cards lc
                INNER JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                WHERE lcc.collection_id = ?
                AND (
                    lc.last_updated IS NULL 
                    OR lc.last_updated < ?
                    OR lc.price_usd IS NULL
                )
            `, [collection.id, cacheTime]);

            // Update prices for cards in this collection
            for (let j = 0; j < cardsToUpdate.rows.length; j++) {
                const card = cardsToUpdate.rows.item(j);
                if (card.Name && card.Set_Num && card.Rarity) {
                    // Debug card data
                    debugCardData(card, 'getLorcanaSetCollections price update');
                    
                    const prices = await getLorcanaCardPrice({
                        Name: card.Name,
                        Set_Num: card.Set_Num,
                        Card_Num: card.Card_Num,
                        Rarity: card.Rarity,
                        Unique_ID: card.Unique_ID
                    });
                    
                    await db.executeSql(
                        'UPDATE lorcana_cards SET price_usd = ?, price_usd_foil = ?, last_updated = ? WHERE Unique_ID = ?',
                        [prices.usd, prices.usd_foil, new Date().toISOString(), card.Unique_ID]
                    );
                }
            }
        }

        // Get all collections with their updated stats
        const [results] = await db.executeSql(`
            WITH CollectionStats AS (
                SELECT 
                    c.id,
                    c.name,
                    c.description,
                    c.created_at,
                    c.updated_at,
                    COALESCE(cc.collected_count, 0) as collected_cards,
                    (
                        SELECT COUNT(DISTINCT lc.Unique_ID) 
                        FROM lorcana_cards lc 
                        WHERE lc.Set_ID = SUBSTR(c.description, INSTR(c.description, '(') + 1, LENGTH(c.description) - INSTR(c.description, '(') - 1)
                        AND lc.Name IS NOT NULL
                        AND lc.Unique_ID IS NOT NULL
                    ) as total_cards,
                    (
                        SELECT COALESCE(SUM(
                            CASE 
                                WHEN lc.price_usd IS NOT NULL THEN CAST(lc.price_usd AS FLOAT)
                                ELSE 0 
                            END
                        ), 0)
                        FROM lorcana_cards lc
                        INNER JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                        WHERE lcc.collection_id = c.id
                    ) as total_value
                FROM lorcana_collections c
                LEFT JOIN (
                    SELECT collection_id, COUNT(*) as collected_count
                    FROM lorcana_collection_cards
                    GROUP BY collection_id
                ) cc ON c.id = cc.collection_id
                WHERE c.name LIKE 'Set: %'
            )
            SELECT 
                id,
                name,
                description,
                created_at,
                updated_at,
                collected_cards,
                total_cards,
                total_value,
                CASE 
                    WHEN total_cards > 0 THEN (CAST(collected_cards AS FLOAT) / total_cards) * 100 
                    ELSE 0 
                END as completion_percentage
            FROM CollectionStats
            ORDER BY name;
        `);

        return Array.from({length: results.rows.length}, (_, i) => {
            const row = results.rows.item(i);
            return {
                id: row.id,
                name: row.name,
                cardCount: row.total_cards,
                description: row.description,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                totalCards: row.total_cards,
                collectedCards: row.collected_cards,
                completionPercentage: row.completion_percentage,
                totalValue: row.total_value || 0
            };
        });
    } catch (error) {
        console.error('Error getting Lorcana set collections:', error);
        throw error;
    }
};

// Add this function to check initialization status
export const isLorcanaInitialized = () => isInitialized;

// Add this function to ensure initialization
export const ensureLorcanaInitialized = async () => {
    if (!isInitialized) {
        await initializeLorcanaDatabase();
    }
};

// Function to get cards from a Lorcana collection
export const getLorcanaCollectionCards = async (collectionId: string, page: number = 1, pageSize: number = 20): Promise<PartialLorcanaCardWithPrice[]> => {
    if (!collectionId) {
        console.error('[LorcanaService] Invalid collectionId provided to getLorcanaCollectionCards');
        return [];
    }

    try {
        const db = await getDB();
        const offset = (page - 1) * pageSize;

        // First check if the lorcana_card_prices table exists
        const [tableResult] = await db.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='lorcana_card_prices'");
        
        let query = '';
        if (tableResult.rows.length > 0) {
            // If the prices table exists, use the full query with price data
            query = `
                SELECT c.*, p.usd, p.usd_foil, p.tcgplayer_id, p.last_updated
                FROM lorcana_cards c
                INNER JOIN lorcana_collection_cards cc ON c.Unique_ID = cc.card_id
                LEFT JOIN lorcana_card_prices p ON c.Unique_ID = p.card_id
                WHERE cc.collection_id = ?
                ORDER BY c.Name
            `;
            
            // Only add LIMIT if pageSize > 0
            if (pageSize > 0) {
                query += ` LIMIT ? OFFSET ?`;
            }
        } else {
            // If the prices table doesn't exist, use a simpler query without joining to the prices table
            console.log('[LorcanaService] lorcana_card_prices table not found, using simpler query');
            query = `
                SELECT c.*
                FROM lorcana_cards c
                INNER JOIN lorcana_collection_cards cc ON c.Unique_ID = cc.card_id
                WHERE cc.collection_id = ?
                ORDER BY c.Name
            `;
            
            // Only add LIMIT if pageSize > 0
            if (pageSize > 0) {
                query += ` LIMIT ? OFFSET ?`;
            }
        }

        let results;
        if (pageSize > 0) {
            [results] = await db.executeSql(query, [collectionId, pageSize, offset]);
        } else {
            [results] = await db.executeSql(query, [collectionId]);
        }
        
        if (!results || !results.rows) {
            console.error('[LorcanaService] No results returned from getLorcanaCollectionCards query');
            return [];
        }

        const cards: PartialLorcanaCardWithPrice[] = [];
        for (let i = 0; i < results.rows.length; i++) {
            try {
                const item = results.rows.item(i);
                // Ensure we have a valid item with required fields
                if (!item || !item.Unique_ID) {
                    console.warn('[LorcanaService] Invalid card item in results', item);
                    continue;
                }
                
                // Create a card object with necessary safety checks
                const card: PartialLorcanaCardWithPrice = {
                    Unique_ID: item.Unique_ID,
                    Name: item.Name || 'Unknown Card',
                    Set_Name: item.Set_Name || 'Unknown Set',
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
                    collected: true, // Since it's in a collection, set collected to true
                    // Add price information - either from the joined prices table or from the card itself
                    prices: {
                        usd: item.usd || item.price_usd || null,
                        usd_foil: item.usd_foil || item.price_usd_foil || null,
                        tcgplayer_id: item.tcgplayer_id || null
                    },
                    last_updated: item.last_updated
                };
                cards.push(card);
            } catch (error) {
                console.error('[LorcanaService] Error processing card in getLorcanaCollectionCards:', error);
            }
        }
        
        return cards;
    } catch (error) {
        console.error('[LorcanaService] Error in getLorcanaCollectionCards:', error);
        throw error;
    }
};

// Add function to delete a card from a collection
export const deleteLorcanaCardFromCollection = async (cardId: string, collectionId: string): Promise<void> => {
    try {
        const db = await getDB();
        await db.executeSql(
            'UPDATE lorcana_cards SET collected = 0 WHERE Unique_ID = ?',
            [cardId]
        );
    } catch (error) {
        handleError('Error deleting card from collection', error);
    }
};

// Add this new function to get missing cards for a set
export const getLorcanaSetMissingCards = async (setId: string): Promise<LorcanaCardWithPrice[]> => {
    try {
        const db = await getDB();
        
        // Get all cards from the set that are not in any collection
        const [results] = await db.executeSql(`
            SELECT lc.*, 
                   CASE 
                       WHEN lcc.card_id IS NOT NULL THEN 1 
                       ELSE 0 
                   END as collected
            FROM lorcana_cards lc
            LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
            WHERE lc.Set_ID = ? 
            AND lc.Unique_ID IS NOT NULL 
            AND lc.Name IS NOT NULL
            ORDER BY 
                CASE WHEN lc.Rarity = 'Enchanted' THEN 1 ELSE 0 END DESC,
                lc.Card_Num ASC;
        `, [setId]);

        const cards: LorcanaCardWithPrice[] = [];
        for (let i = 0; i < results.rows.length; i++) {
            const card = results.rows.item(i);
            if (card.Unique_ID) {  // Only add cards with a valid Unique_ID
                cards.push({
                    ...card,
                    Unique_ID: card.Unique_ID, // Ensure this is explicitly set
                    prices: {
                        usd: card.price_usd,
                        usd_foil: card.price_usd_foil,
                        tcgplayer_id: null
                    },
                    collected: Boolean(card.collected)
                });
            }
        }

        return cards;
    } catch (error) {
        console.error('Error getting Lorcana set missing cards:', error);
        throw error;
    }
};

// Add function to delete a Lorcana collection
export const deleteLorcanaCollection = async (collectionId: string): Promise<void> => {
    try {
        const db = await getDB();
        await db.transaction(async (tx) => {
            // Due to foreign key constraints and ON DELETE CASCADE, this will automatically
            // delete associated records in lorcana_collection_cards
            await tx.executeSql(
                'DELETE FROM lorcana_collections WHERE id = ?',
                [collectionId]
            );
        });
    } catch (error) {
        console.error('[LorcanaService] Error deleting Lorcana collection:', error);
        throw error;
    }
};

// Function to fetch and store enchanted cards from Lorcast API
export const fetchAndStoreEnchantedCards = async () => {
    try {
        const response = await fetch('https://api.lorcast.com/v0/cards/search?q=rarity:enchanted');
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const db = await getDB();

        // Insert cards in batches
        const batchSize = 20;
        for (let i = 0; i < data.results.length; i += batchSize) {
            const batch = data.results.slice(i, Math.min(i + batchSize, data.results.length));
            await db.transaction((tx) => {
                batch.forEach((card: any) => {
                    if (!card || !card.name || !card.set?.code) return;

                    const setId = mapLorcastSetCodeToSetId(card.set.code);
                    if (!setId) return;

                    // Map Lorcast API fields to database fields
                    const cardData = {
                        Artist: card.illustrators?.join(', ') || null,
                        Body_Text: card.text || null,
                        Card_Num: parseInt(card.collector_number) || null,
                        Classifications: card.classifications?.join(', ') || null,
                        Color: card.ink || null,
                        Cost: card.cost || null,
                        Date_Added: card.released_at || null,
                        Date_Modified: new Date().toISOString(),
                        Flavor_Text: null,
                        Franchise: null,
                        Image: card.image_uris?.digital?.normal || null,
                        Inkable: card.inkwell ? 1 : 0,
                        Lore: card.lore || null,
                        Name: card.version ? `${card.name} - ${card.version}` : card.name,
                        Rarity: 'Enchanted',
                        Set_ID: setId,
                        Set_Name: card.set.name || null,
                        Set_Num: parseInt(card.collector_number) || null,
                        Strength: card.strength || null,
                        Type: card.type?.join(', ') || null,
                        Unique_ID: card.id || null,
                        Willpower: card.willpower || null,
                        price_usd: null,
                        price_usd_foil: card.prices?.usd_foil ? card.prices.usd_foil.toString() : null,
                        last_updated: new Date().toISOString(),
                        collected: 0
                    };

                    tx.executeSql(
                        `INSERT OR REPLACE INTO lorcana_cards (
                            Artist, Body_Text, Card_Num, Classifications, Color, Cost,
                            Date_Added, Date_Modified, Flavor_Text, Franchise, Image,
                            Inkable, Lore, Name, Rarity, Set_ID, Set_Name, Set_Num,
                            Strength, Type, Unique_ID, Willpower,
                            price_usd, price_usd_foil, last_updated, collected
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            cardData.Artist, cardData.Body_Text, cardData.Card_Num,
                            cardData.Classifications, cardData.Color, cardData.Cost,
                            cardData.Date_Added, cardData.Date_Modified, cardData.Flavor_Text,
                            cardData.Franchise, cardData.Image, cardData.Inkable,
                            cardData.Lore, cardData.Name, cardData.Rarity,
                            cardData.Set_ID, cardData.Set_Name, cardData.Set_Num,
                            cardData.Strength, cardData.Type, cardData.Unique_ID,
                            cardData.Willpower, cardData.price_usd, cardData.price_usd_foil,
                            cardData.last_updated, cardData.collected
                        ]
                    );
                });
            });
        }
    } catch (error) {
        console.error('[LorcanaService] Error fetching and storing enchanted cards:', error);
        throw error;
    }
};

// Add this helper function for calculating string similarity
function levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1,  // substitution
                    dp[i - 1][j] + 1,      // deletion
                    dp[i][j - 1] + 1       // insertion
                );
            }
        }
    }
    return dp[m][n];
}

// Function to update all card images
export const updateAllCardImages = async (batchSize = 25, startIndex = 0) => {
    try {
        // Get database connection
        const db = await getDB();
        
        // Get all cards that need image URL updates
        const [cardsResult] = await db.executeSql(
            `SELECT Unique_ID, Name, Set_Num, Card_Num, Rarity, Image
             FROM lorcana_cards 
             WHERE Image IS NULL 
                OR Image LIKE '%lorcana-api.com%'  
                OR Image LIKE '%.heif%' 
                OR Image LIKE '%.heic%'
                OR Image LIKE '%image/heif%'
                OR Image LIKE '%image/heic%'
             ORDER BY collected DESC
             LIMIT ? OFFSET ?`,
            [batchSize, startIndex]
        );
        
        const totalCards = cardsResult.rows.length;
        let updatedCount = 0;
        let failedCount = 0;
        
        // Process each card
        for (let i = 0; i < totalCards; i++) {
            const card = cardsResult.rows.item(i);
            
            try {
                // Debug card data
                debugCardData(card, 'updateAllCardImages');
                
                // Attempt to get price and image data
                await getLorcanaCardPrice({
                    Unique_ID: card.Unique_ID,
                    Name: card.Name,
                    Set_Num: card.Set_Num,
                    Card_Num: card.Card_Num,
                    Rarity: card.Rarity
                });
                
                // Check if the image was updated by comparing it with the previous value
                const [updatedCard] = await db.executeSql(
                    'SELECT Image FROM lorcana_cards WHERE Unique_ID = ?',
                    [card.Unique_ID]
                );
                
                const newImage = updatedCard.rows.item(0).Image;
                if (newImage !== card.Image) {
                    updatedCount++;
                }
                
                // Add short delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                failedCount++;
            }
        }
        
        // Return stats
        return {
            processed: totalCards,
            updated: updatedCount,
            failed: failedCount,
            hasMore: totalCards === batchSize // If we got a full batch, there might be more
        };
        
    } catch (error) {
        console.error('[LorcanaService] Error in batch update of card images:', error);
        throw error;
    }
};

 /**
     * Updates all Lorcana card image URLs in the database, converting lorcana-api.com to lorcast.io
     */
    export const updateLorcanaImageUrls = async (): Promise<void> => {
    try {
        const db = await getDB();
        if (!db) {
            console.error('[DatabaseService] Database not initialized for URL updates');
            return;
        }
        
        console.log('[DatabaseService] Checking for and fixing Lorcana image URLs in database...');
        const updatedCount = await updateAllImageUrlsInDatabase(db);
        console.log(`[DatabaseService] Fixed ${updatedCount} Lorcana image URLs in database`);
    } catch (error) {
        console.error('[DatabaseService] Error updating Lorcana image URLs:', error);
    }
}




// Function to safely refresh data without losing collection information
export const safeRefreshLorcanaCards = async (): Promise<{ updated: number, added: number }> => {
    try {
        // First ensure we have an active database connection
        const db = await getDB();
        
        // Ensure tables exist
        // await ensureTablesCreated();
        
        // Tracking variables
        let updatedCount = 0;
        let addedCount = 0;
        console.log('safeRefreshLorcanaCards');
        // Step 1: Fetch latest bulk data
        const response = await fetch(LorcanaBulkCardApi);
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        // Don't consume the response body in a console.log
        console.log('Fetched Lorcana bulk data, status:', response.status);
        const cardData = await response.json();
        console.log(`Loaded ${cardData.length} Lorcana cards from API`);
        
        // Step 2: Process in batches
        const batchSize = 100;
        for (let i = 0; i < cardData.length; i += batchSize) {
            const batch = cardData.slice(i, i + batchSize);
            
            // Process each card in the batch using a transaction
            await db.transaction(async (tx) => {
                for (const card of batch) {
                    if (!card || !card.Name || !card.Unique_ID) continue;
                    
                    // Check if the card already exists
                    const [existingResults] = await db.executeSql(
                        'SELECT Unique_ID, collected FROM lorcana_cards WHERE Unique_ID = ?',
                        [card.Unique_ID]
                    );
                    
                    if (existingResults.rows.length > 0) {
                        // Card exists - update it but preserve the collected status
                        const existingCard = existingResults.rows.item(0);
                        
                        await tx.executeSql(
                            `UPDATE lorcana_cards SET 
                                Artist = ?, Body_Text = ?, Card_Num = ?, Classifications = ?,
                                Color = ?, Cost = ?, Date_Added = ?, Date_Modified = ?,
                                Flavor_Text = ?, Franchise = ?, Image = ?, Inkable = ?,
                                Lore = ?, Name = ?, Rarity = ?, Set_ID = ?, Set_Name = ?,
                                Set_Num = ?, Strength = ?, Type = ?, Willpower = ?,
                                last_updated = ?
                            WHERE Unique_ID = ?`,
                            [
                                card.Artist || null,
                                card.Body_Text || null,
                                card.Card_Num || null,
                                card.Classifications || null,
                                card.Color || null,
                                card.Cost || null,
                                card.Date_Added || null,
                                card.Date_Modified || null,
                                card.Flavor_Text || null,
                                card.Franchise || null,
                                card.Image || null,
                                card.Inkable ? 1 : 0,
                                card.Lore || null,
                                card.Name || null,
                                card.Rarity || null,
                                card.Set_ID || null,
                                card.Set_Name || null,
                                card.Set_Num || null,
                                card.Strength || null,
                                card.Type || null,
                                card.Willpower || null,
                                new Date().toISOString(),
                                card.Unique_ID
                            ]
                        );
                        
                        updatedCount++;
                    } else {
                        // New card - insert it
                        await tx.executeSql(
                            `INSERT INTO lorcana_cards (
                                Artist, Body_Text, Card_Num, Classifications, Color, Cost,
                                Date_Added, Date_Modified, Flavor_Text, Franchise, Image, Inkable,
                                Lore, Name, Rarity, Set_ID, Set_Name, Set_Num, Strength, Type,
                                Unique_ID, Willpower, collected, last_updated, price_usd, price_usd_foil
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                card.Artist || null,
                                card.Body_Text || null,
                                card.Card_Num || null,
                                card.Classifications || null,
                                card.Color || null,
                                card.Cost || null,
                                card.Date_Added || null,
                                card.Date_Modified || null,
                                card.Flavor_Text || null,
                                card.Franchise || null,
                                card.Image || null,
                                card.Inkable ? 1 : 0,
                                card.Lore || null,
                                card.Name || null,
                                card.Rarity || null,
                                card.Set_ID || null,
                                card.Set_Name || null,
                                card.Set_Num || null,
                                card.Strength || null,
                                card.Type || null,
                                card.Unique_ID || null,
                                card.Willpower || null,
                                null, // price_usd
                                null, // price_usd_foil
                                new Date().toISOString(),
                                0 // collected (default to not collected)
                            ]
                        );
                        
                        addedCount++;
                    }
                }
            });
        }
        
        // Step 3: Fetch and update enchanted cards (these might not be in the bulk API)
        try {
            await fetchAndStoreEnchantedCards();
        } catch (error) {
            console.error('Error updating enchanted cards:', error);
            // Continue even if enchanted cards update fails
        }
        
        // Force re-initialization
        isInitialized = true;
        
        return { updated: updatedCount, added: addedCount };
    } catch (error) {
        return handleError('Error safely refreshing Lorcana cards', error);
    }
};


export const getNewSetCards = async (forceUpdate: boolean = false) => {
    try {
        console.log('[LorcanaService] Fetching new set cards from Lorcast API...');
        const response = await fetch(LorcanaNewSetApi);
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        const newSetCardsData = await response.json();
        
        console.log(`[LorcanaService] Fetched ${newSetCardsData.length || 0} new set cards`);
        
        // Get database connection
        const db = await getDB();
        let addedCount = 0;
        let existingCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        // First check which cards already exist in the database
        // Get the set ID mapping for set 7
        const setId = mapLorcastSetCodeToSetId('7') || 'ARI'; // Default to ARI if mapping fails
        
        const existingCardIds = new Set<string>();
        const [existingCardsResult] = await db.executeSql(
            'SELECT Unique_ID FROM lorcana_cards WHERE Unique_ID LIKE ?',
            [`${setId}-%`]
        );
        
        for (let i = 0; i < existingCardsResult.rows.length; i++) {
            existingCardIds.add(existingCardsResult.rows.item(i).Unique_ID);
        }
        
        console.log(`[LorcanaService] Found ${existingCardIds.size} existing cards in the database for set ${setId}`);
        
        // Process each card in the new set
        await db.transaction(async (tx) => {
            for (const apiCard of newSetCardsData) {
                // Skip cards that don't have essential data
                if (!apiCard.name || !apiCard.collector_number || !apiCard.set) {
                    console.log('[LorcanaService] Skipping card with missing essential data:', 
                      JSON.stringify({
                        name: apiCard.name,
                        collector_number: apiCard.collector_number,
                        set: apiCard.set
                      }));
                    skippedCount++;
                    continue;
                }
                
                // Get the proper set code from our mapping
                const numericSetCode = apiCard.set.code;
                const properSetCode = mapLorcastSetCodeToSetId(numericSetCode) || apiCard.set.code;
                
                // Create a unique ID using the proper set code
                const uniqueId = `${properSetCode}-${apiCard.collector_number}`;
                const cardNum = Number(apiCard.collector_number);
                
                // Check if card already exists using our pre-populated Set
                const cardExists = existingCardIds.has(uniqueId);
                
                if (!cardExists) {
                    // Card doesn't exist, insert it
                    console.log(`[LorcanaService] Adding new card: ${apiCard.name} (${uniqueId})`);
                    await db.executeSql(`
                        INSERT INTO lorcana_cards (
                            Artist, Body_Text, Card_Num, Classifications, Color, Cost,
                            Date_Added, Date_Modified, Flavor_Text, Franchise, Image, Inkable,
                            Lore, Name, Rarity, Set_ID, Set_Name, Set_Num, Strength, Type,
                            Unique_ID, Willpower, collected, last_updated, price_usd, price_usd_foil
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), ?, ?)`,
                    [
                        // Artist: first illustrator from the API
                        apiCard.illustrators ? apiCard.illustrators[0] : null,
                        // Body_Text: from API "text"
                        apiCard.text || null,
                        // Card_Num: should be the collector_number
                        cardNum,
                        // Classifications: join classifications array with commas
                        apiCard.classifications ? apiCard.classifications.join(', ') : null,
                        // Color: choose a primary ink, e.g. the first value from inks array
                        apiCard.inks && apiCard.inks.length > 0 ? apiCard.inks[0] : null,
                        // Cost:
                        apiCard.cost || null,
                        // Date_Added: you can use the API "released_at" or a custom date string
                        apiCard.released_at || new Date().toISOString(),
                        // Flavor_Text:
                        apiCard.flavor_text || null,
                        // Franchise: if not provided, use an empty string or default value
                        '',
                        // Image: use image_uris.digital.normal
                        apiCard.image_uris?.digital?.normal || null,
                        // Inkable: convert boolean to integer (false -> 0, true -> 1)
                        apiCard.inkwell ? 1 : 0,
                        // Lore:
                        apiCard.lore || null,
                        // Name: combine "name" and "version" if needed
                        `${apiCard.name}${apiCard.version ? ` - ${apiCard.version}` : ''}`,
                        // Rarity:
                        apiCard.rarity || null,
                        // Set_ID: should be the mapped text code (like ARI)
                        properSetCode,
                        // Set_Name: from set.name
                        apiCard.set.name || null,
                        // Set_Num: Should be the set's position in release order
                        Number(numericSetCode) || null,
                        // Strength:
                        apiCard.strength || null,
                        // Type: take the first type from the type array
                        apiCard.type && apiCard.type.length > 0 ? apiCard.type[0] : null,
                        // Unique_ID: using the proper set code (like ARI-1)
                        uniqueId,
                        // Willpower:
                        apiCard.willpower || null,
                        // price_usd:
                        apiCard.prices?.usd || null,
                        // price_usd_foil:
                        apiCard.prices?.usd_foil || null
                    ]);
                    
                    addedCount++;
                } else if (forceUpdate) {
                    // Card exists and we want to update it
                    // Get the existing card to preserve certain values
                    const [existingCardResult] = await db.executeSql(
                        'SELECT collected FROM lorcana_cards WHERE Unique_ID = ?',
                        [uniqueId]
                    );
                    
                    const wasCollected = existingCardResult.rows.length > 0 ? 
                        existingCardResult.rows.item(0).collected === 1 : false;
                    
                    console.log(`[LorcanaService] Updating existing card: ${apiCard.name} (${uniqueId})`);
                    await db.executeSql(`
                        UPDATE lorcana_cards SET
                            Artist = ?, Body_Text = ?, Card_Num = ?, Classifications = ?, 
                            Color = ?, Cost = ?, Date_Modified = datetime('now'), 
                            Flavor_Text = ?, Image = ?, Inkable = ?, Lore = ?, 
                            Name = ?, Rarity = ?, Set_ID = ?, Set_Name = ?, 
                            Set_Num = ?, Strength = ?, Type = ?, Willpower = ?,
                            last_updated = datetime('now'), price_usd = ?, price_usd_foil = ?
                        WHERE Unique_ID = ?`,
                    [
                        apiCard.illustrators ? apiCard.illustrators[0] : null,
                        apiCard.text || null,
                        // Card_Num: should be the collector_number
                        cardNum,
                        apiCard.classifications ? apiCard.classifications.join(', ') : null,
                        apiCard.inks && apiCard.inks.length > 0 ? apiCard.inks[0] : null,
                        apiCard.cost || null,
                        apiCard.flavor_text || null,
                        apiCard.image_uris?.digital?.normal || null,
                        apiCard.inkwell ? 1 : 0,
                        apiCard.lore || null,
                        `${apiCard.name}${apiCard.version ? ` - ${apiCard.version}` : ''}`,
                        apiCard.rarity || null,
                        // Set_ID: should be the mapped text code (like ARI)
                        properSetCode,
                        apiCard.set.name || null,
                        // Set_Num: Should be the set's position in release order
                        Number(numericSetCode) || null,
                        apiCard.strength || null,
                        apiCard.type && apiCard.type.length > 0 ? apiCard.type[0] : null,
                        apiCard.willpower || null,
                        apiCard.prices?.usd || null,
                        apiCard.prices?.usd_foil || null,
                        uniqueId
                    ]);
                    
                    updatedCount++;
                } else {
                    // Card already exists and we're not updating it
                    existingCount++;
                    if (existingCount <= 5) {
                        console.log(`[LorcanaService] Card already exists: ${apiCard.name} (${uniqueId})`);
                    }
                }
                
                // Always update the price data in the separate table if it exists
                if ((apiCard.prices?.usd || apiCard.prices?.usd_foil) && uniqueId) {
                    await db.executeSql(
                        `INSERT OR REPLACE INTO lorcana_card_prices 
                        (card_id, usd, usd_foil, tcgplayer_id, last_updated) 
                        VALUES (?, ?, ?, ?, ?)`,
                        [
                            uniqueId,
                            apiCard.prices?.usd || null,
                            apiCard.prices?.usd_foil || null,
                            apiCard.tcgplayer_id || null,
                            new Date().toISOString()
                        ]
                    );
                }
            }
        });
        
        // Generate the summary AFTER the transaction has completed
        const summary = `[LorcanaService] Database update summary:
        - Total cards fetched: ${newSetCardsData.length}
        - Cards already in database: ${existingCount}
        - Cards updated: ${updatedCount}
        - Cards skipped due to missing data: ${skippedCount}
        - New cards added: ${addedCount}
        `;
        
        console.log(summary);
        
        return { 
            added: addedCount, 
            existing: existingCount, 
            updated: updatedCount,
            skipped: skippedCount, 
            cards: newSetCardsData,
            summary
        };
    } catch (error) {
        console.error('[LorcanaService] Error fetching new set cards:', error);
        throw error;
    }
};

export const fetchCardVersionsByName = async (cardName: string): Promise<LorcanaCardWithPrice[]> => {
    try {
        const db = await getDB();
        const [results] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE Name = ?',
            [cardName]
        );
        
        const versions: LorcanaCardWithPrice[] = [];
        for (let i = 0; i < results.rows.length; i++) {
            const card = results.rows.item(i);
            
            // Fetch price data if available
            try {
                const priceData = await getLorcanaCardPrice(card);
                versions.push({
                    ...card,
                    prices: priceData || null,
                    collected: !!card.collected
                });
            } catch (error) {
                // If price fetch fails, still include the card without price data
                console.warn(`[LorcanaService] Failed to fetch price for card version ${card.Name} (${card.Unique_ID}):`, error);
                versions.push({
                    ...card,
                    prices: null,
                    collected: !!card.collected
                });
            }
        }
        
        return versions;
    } catch (error) {
        handleError(`Failed to fetch card versions for "${cardName}"`, error);
        return [];
    }
};

// Function to specifically fix cards with "Name - undefined" issue
export const fixCardNames = async (): Promise<number> => {
    try {
        const db = await getDB();
        let fixedCount = 0;

        // Find all cards with "Name - undefined" in their name
        const [results] = await db.executeSql(
            "SELECT * FROM lorcana_cards WHERE Name LIKE '% - undefined'",
            []
        );

        if (results.rows.length === 0) {
            console.log('No cards with "Name - undefined" found in the database.');
            return 0;
        }

        console.log(`Found ${results.rows.length} cards with "Name - undefined" to fix.`);

        // Fix each card by removing the " - undefined" part
        await db.transaction(async (tx) => {
            for (let i = 0; i < results.rows.length; i++) {
                const card = results.rows.item(i);
                const fixedName = card.Name.replace(' - undefined', '');
                
                await tx.executeSql(
                    'UPDATE lorcana_cards SET Name = ? WHERE Unique_ID = ?',
                    [fixedName, card.Unique_ID]
                );
                fixedCount++;
            }
        });

        console.log(`Fixed ${fixedCount} card names.`);
        return fixedCount;
    } catch (error) {
        return handleError('Error fixing card names', error);
    }
};

/**
 * Checks if a Lorcana card is in a specific set collection
 * @param cardId The Unique_ID of the Lorcana card to check
 * @param setId The Set_ID to check against
 * @returns Promise resolving to {isInCollection: boolean, setName: string} with the collection check result and actual set name
 */
export const isLorcanaCardInSetCollection = async (cardId: string, setId: string): Promise<{isInCollection: boolean, setName: string}> => {
    try {
        if (!cardId || !setId) {
            console.error('[LorcanaService] Invalid card ID or set ID:', { cardId, setId });
            return {isInCollection: false, setName: setId};
        }

        console.log('[LorcanaService] Checking if card is in collection:', { cardId, setId });
        const db = await getDB();
        
        // First get the collection ID for this set
        console.log('[LorcanaService] Searching for collection with name:', `Set: ${setId}`, `or Set: ${setId.toUpperCase()}`);
        const [collectionResult] = await db.executeSql(
            "SELECT id, name FROM lorcana_collections WHERE name = ? OR name = ?",
            [`Set: ${setId}`, `Set: ${setId.toUpperCase()}`]
        );
        
        console.log('[LorcanaService] Collection search found:', collectionResult.rows.length, 'results');
        
        // If we couldn't find the collection, the card can't be in it
        if (collectionResult.rows.length === 0) {
            console.log('[LorcanaService] Collection not found');
            
            // Try to find by different naming pattern
            console.log('[LorcanaService] Trying alternative collection naming patterns...');
            const [altCollectionResult] = await db.executeSql(
                "SELECT id, name FROM lorcana_collections WHERE name LIKE ?",
                [`%${setId}%`]
            );
            
            let setName = setId;
            
            if (altCollectionResult.rows.length > 0) {
                console.log('[LorcanaService] Found possible matching collections:');
                for (let i = 0; i < altCollectionResult.rows.length; i++) {
                    const row = altCollectionResult.rows.item(i);
                    console.log(`- ${row.id}: ${row.name}`);
                    
                    // Extract the set name from "Set: [SetName]" format if possible
                    if (row.name.startsWith('Set: ')) {
                        setName = row.name.substring(5);
                    }
                }
            }
            
            return {isInCollection: false, setName};
        }
        
        const collectionId = collectionResult.rows.item(0).id;
        console.log('[LorcanaService] Found collection ID:', collectionId);
        
        // Extract the set name from collection name (usually in "Set: [SetName]" format)
        let setName = setId;
        const collectionName = collectionResult.rows.item(0).name;
        if (collectionName && collectionName.startsWith('Set: ')) {
            setName = collectionName.substring(5);
        }
        
        // Check if the card exists in the collection
        console.log('[LorcanaService] Checking if card exists in collection:', { collectionId, cardId });
        const [cardResult] = await db.executeSql(
            "SELECT * FROM lorcana_collection_cards WHERE collection_id = ? AND card_id = ?",
            [collectionId, cardId]
        );
        
        console.log('[LorcanaService] Card search found:', cardResult.rows.length, 'results');
        
        // If we found at least one row, the card is in the collection
        const isInCollection = cardResult.rows.length > 0;
        
        return {isInCollection, setName};
    } catch (error) {
        console.error('[LorcanaService] Error checking if Lorcana card is in set collection:', error);
        return {isInCollection: false, setName: setId};
    }
};

/**
 * Downloads and adds the newest set cards to the database
 * @param forceUpdate If true, will update existing cards with the latest data
 * @returns Summary of the operation
 */
export const downloadLatestSetCards = async (forceUpdate: boolean = false) => {
    try {
        await ensureLorcanaInitialized();
        console.log(`[LorcanaService] Starting download of latest set cards (forceUpdate: ${forceUpdate})`);
        
        const result = await getNewSetCards(forceUpdate);
        
        console.log(`[LorcanaService] Latest set cards download completed successfully:
        - ${result.added} new cards added
        - ${result.existing} cards already in database
        - ${result.updated} cards updated
        - ${result.skipped} cards skipped due to missing data
        - ${result.cards.length} total cards processed
        `);
        
        // Return user-friendly result object
        return {
            success: true,
            ...result,
            message: forceUpdate 
                ? `Downloaded latest set data. ${result.added} new cards added and ${result.updated} cards updated.`
                : `Downloaded latest set data. ${result.added} new cards added.`
        };
    } catch (error) {
        console.error('[LorcanaService] Error downloading latest set cards:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            message: 'Failed to download latest set cards. Please try again later.'
        };
    }
};

export const deleteAllSet7Cards = async () => {
    await ensureLorcanaInitialized();
    const db = await getDB();
    await db.executeSql('DELETE FROM lorcana_cards WHERE Set_ID = ?', ['ARI']);
};

/**
 * Fixes incorrectly formatted set IDs and unique IDs for cards
 * @param setCode The numeric set code to fix (e.g., '7')
 * @returns Summary of the operation
 */
export const fixCardSetIdentifiers = async (setCode: string): Promise<{
    updated: number;
    skipped: number;
    message: string;
}> => {
    try {
        await ensureLorcanaInitialized();
        console.log(`[LorcanaService] Starting set identifier fixes for set ${setCode}`);
        
        // Get database connection
        const db = await getDB();
        let updatedCount = 0;
        let skippedCount = 0;
        
        // Map the numeric set code to its text equivalent
        const properSetCode = mapLorcastSetCodeToSetId(setCode) || setCode;
        
        // First find all cards with the numeric set ID
        const [cardsResult] = await db.executeSql(
            'SELECT Unique_ID, Card_Num FROM lorcana_cards WHERE Set_ID = ?',
            [setCode]
        );
        
        console.log(`[LorcanaService] Found ${cardsResult.rows.length} cards with numeric set ID "${setCode}"`);
        
        // Fix the cards in a transaction
        await db.transaction(async (tx) => {
            for (let i = 0; i < cardsResult.rows.length; i++) {
                const card = cardsResult.rows.item(i);
                const oldUniqueId = card.Unique_ID;
                const cardNum = card.Card_Num;
                
                // Skip if card number is invalid
                if (!cardNum) {
                    console.log(`[LorcanaService] Skipping card with invalid card number: ${oldUniqueId}`);
                    skippedCount++;
                    continue;
                }
                
                // Create the new unique ID with the proper set code
                const newUniqueId = `${properSetCode}-${cardNum}`;
                
                // Update the card with the new set ID and unique ID
                await db.executeSql(
                    'UPDATE lorcana_cards SET Set_ID = ?, Unique_ID = ? WHERE Unique_ID = ?',
                    [properSetCode, newUniqueId, oldUniqueId]
                );
                
                // Also update any references in the price table
                await db.executeSql(
                    'UPDATE lorcana_card_prices SET card_id = ? WHERE card_id = ?',
                    [newUniqueId, oldUniqueId]
                );
                
                // And update collection references
                await db.executeSql(
                    'UPDATE lorcana_collection_cards SET card_id = ? WHERE card_id = ?',
                    [newUniqueId, oldUniqueId]
                );
                
                console.log(`[LorcanaService] Fixed card identifiers: ${oldUniqueId} -> ${newUniqueId}`);
                updatedCount++;
            }
        });
        
        const message = `Fixed ${updatedCount} cards with incorrect set identifiers for set ${setCode} (${properSetCode})`;
        console.log(`[LorcanaService] ${message}`);
        
        return {
            updated: updatedCount,
            skipped: skippedCount,
            message
        };
    } catch (error) {
        console.error('[LorcanaService] Error fixing card set identifiers:', error);
        return {
            updated: 0,
            skipped: 0,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
};

/**
 * Fixes all incorrectly formatted set IDs and unique IDs across all sets
 * @returns Summary of the operation
 */
export const fixAllCardSetIdentifiers = async (): Promise<{
    totalUpdated: number;
    totalSkipped: number;
    message: string;
}> => {
    try {
        console.log('[LorcanaService] Starting to fix all card set identifiers');
        
        let totalUpdated = 0;
        let totalSkipped = 0;
        
        // Process each set in our mapping
        for (let i = 1; i <= 7; i++) {
            const setCode = String(i);
            const result = await fixCardSetIdentifiers(setCode);
            
            totalUpdated += result.updated;
            totalSkipped += result.skipped;
        }
        
        const message = `Fixed ${totalUpdated} cards with incorrect set identifiers across all sets`;
        console.log(`[LorcanaService] ${message}`);
        
        return {
            totalUpdated,
            totalSkipped,
            message
        };
    } catch (error) {
        console.error('[LorcanaService] Error fixing all card set identifiers:', error);
        return {
            totalUpdated: 0,
            totalSkipped: 0,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
};

