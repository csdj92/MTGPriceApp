import { openDatabase, SQLiteDatabase, enablePromise } from 'react-native-sqlite-storage'
import RNFS from 'react-native-fs'

// Enable promise support for SQLite
enablePromise(true)

const LorcanaBulkCardApi = 'https://api.lorcana-api.com/bulk/cards'
const LorcastPriceApi = 'https://api.lorcast.com/v0/cards/search'

let dbInstance: SQLiteDatabase | null = null
let isInitialized = false
let initializationPromise: Promise<void> | null = null

const getDB = async () => {
    if (dbInstance) return dbInstance;
    console.log('[LorcanaService] Initializing database...');
    try {
        // Use the correct path for Windows
        const dbName = 'lorcana.db';
        console.log('[LorcanaService] Database name:', dbName);

        // Open the database with the correct location
        dbInstance = await openDatabase({
            name: dbName,
            location: 'default',
            createFromLocation: 2
        });

        // Enable foreign keys immediately after opening
        await dbInstance.executeSql('PRAGMA foreign_keys = ON;');
        await dbInstance.executeSql('PRAGMA journal_mode = WAL;'); // Better performance and reliability
        
        // Verify database connection
        const [tables] = await dbInstance.executeSql("SELECT name FROM sqlite_master WHERE type='table';");
        console.log('[LorcanaService] Existing tables:', tables.rows.raw());
        
        return dbInstance;
    } catch (error) {
        console.error('[LorcanaService] Database initialization failed:', error);
        throw error;
    }
};

const verifyAndRepairDatabase = async () => {
    const db = await getDB();
    
    try {
        // Drop existing tables to force recreation
        console.log('[LorcanaService] Dropping existing tables...');
        await db.transaction(async (tx) => {
            await tx.executeSql('DROP TABLE IF EXISTS lorcana_collection_cards;');
            await tx.executeSql('DROP TABLE IF EXISTS lorcana_collections;');
            await tx.executeSql('DROP TABLE IF EXISTS lorcana_cards;');
        });
        
        // Check if tables exist
        const [tables] = await db.executeSql("SELECT name FROM sqlite_master WHERE type='table'");
        const tableNames = tables.rows.raw().map(t => t.name);
        console.log('[LorcanaService] Current tables after drop:', tableNames);
        
        // Recreate tables
        console.log('[LorcanaService] Recreating tables...');
        await ensureTablesCreated();
        
        // Verify tables were created
        const [verifyTables] = await db.executeSql("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('[LorcanaService] Tables after recreation:', verifyTables.rows.raw());
        
        console.log('[LorcanaService] Database verification complete');
    } catch (error) {
        console.error('[LorcanaService] Error verifying database:', error);
        throw error;
    }
};

const ensureTablesCreated = async () => {
    const db = await getDB();
    
    try {
        console.log('[LorcanaService] Starting table creation...');
        
        // Create tables one by one with error handling
        try {
            console.log('[LorcanaService] Creating lorcana_cards table...');
            await db.executeSql(`
                CREATE TABLE IF NOT EXISTS lorcana_cards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Artist TEXT,
                    Body_Text TEXT,
                    Card_Num INTEGER,
                    Classifications TEXT,
                    Color TEXT,
                    Cost INTEGER,
                    Date_Added TEXT,
                    Date_Modified TEXT,
                    Flavor_Text TEXT,
                    Franchise TEXT,
                    Image TEXT,
                    Inkable INTEGER,
                    Lore INTEGER,
                    Name TEXT,
                    Rarity TEXT,
                    Set_ID TEXT,
                    Set_Name TEXT,
                    Set_Num INTEGER,
                    Strength INTEGER,
                    Type TEXT,
                    Unique_ID TEXT UNIQUE,
                    Willpower INTEGER,
                    price_usd TEXT,
                    price_usd_foil TEXT,
                    last_updated TEXT,
                    collected INTEGER DEFAULT 0
                );
            `);
            console.log('[LorcanaService] lorcana_cards table created successfully');
        } catch (error) {
            console.error('[LorcanaService] Error creating lorcana_cards table:', error);
            throw error;
        }

        try {
            console.log('[LorcanaService] Creating indexes...');
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_name ON lorcana_cards(Name);');
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_unique_id ON lorcana_cards(Unique_ID);');
            console.log('[LorcanaService] Indexes created successfully');
        } catch (error) {
            console.error('[LorcanaService] Error creating indexes:', error);
            throw error;
        }

        try {
            console.log('[LorcanaService] Creating lorcana_collections table...');
            await db.executeSql(`
                CREATE TABLE IF NOT EXISTS lorcana_collections (
                    id TEXT PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            `);
            console.log('[LorcanaService] lorcana_collections table created successfully');
        } catch (error) {
            console.error('[LorcanaService] Error creating lorcana_collections table:', error);
            throw error;
        }

        try {
            console.log('[LorcanaService] Creating lorcana_collection_cards table...');
            await db.executeSql(`
                CREATE TABLE IF NOT EXISTS lorcana_collection_cards (
                    collection_id TEXT NOT NULL,
                    card_id TEXT NOT NULL,
                    added_at TEXT NOT NULL,
                    PRIMARY KEY (collection_id, card_id),
                    FOREIGN KEY (collection_id) REFERENCES lorcana_collections(id) ON DELETE CASCADE,
                    FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
                );
            `);
            console.log('[LorcanaService] lorcana_collection_cards table created successfully');
        } catch (error) {
            console.error('[LorcanaService] Error creating lorcana_collection_cards table:', error);
            throw error;
        }

        // Verify all tables were created
        const [verifyTables] = await db.executeSql("SELECT name FROM sqlite_master WHERE type='table';");
        const tableNames = verifyTables.rows.raw().map((t: any) => t.name);
        console.log('[LorcanaService] Tables after creation:', tableNames);
        
        if (!tableNames.includes('lorcana_cards') || 
            !tableNames.includes('lorcana_collections') || 
            !tableNames.includes('lorcana_collection_cards')) {
            throw new Error('Not all required tables were created successfully');
        }
        
        console.log('[LorcanaService] All tables created and verified successfully');
    } catch (error) {
        console.error('[LorcanaService] Error in ensureTablesCreated:', error);
        throw error;
    }
};

interface LorcanaCard {
    Artist?: string;
    Body_Text?: string;
    Card_Num?: number;
    Classifications?: string;
    Color?: string;
    Cost?: number;
    Date_Added?: string;
    Date_Modified?: string;
    Flavor_Text?: string;
    Franchise?: string;
    Image?: string;
    Inkable?: boolean;
    Lore?: number;
    Name?: string;
    Rarity?: string;
    Set_ID?: string;
    Set_Name?: string;
    Set_Num?: number;
    Strength?: number;
    Type?: string;
    Unique_ID?: string;
    Willpower?: number;
    collected?: boolean;
}

interface LorcanaPrice {
    usd: string | null;
    usd_foil: string | null;
    tcgplayer_id: string | null;
}

interface LorcanaCardWithPrice extends LorcanaCard {
    prices?: LorcanaPrice;
}

// const insertLorcanaCard = async (card: LorcanaCardWithPrice) => {
//     const query = `
//         INSERT OR REPLACE INTO lorcana_cards (
//             Artist, Body_Text, Card_Num, Classifications, Color, Cost,
//             Date_Added, Date_Modified, Flavor_Text, Franchise, Image,
//             Inkable, Lore, Name, Rarity, Set_ID, Set_Name, Set_Num,
//             Strength, Type, Unique_ID, Willpower,
//             price_usd, price_usd_foil, last_updated, collected
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
//     `

//     const values = [
//         card.artist || null,
//         card.body_text || null,
//         card.card_num || null,
//         Array.isArray(card.classifications) ? card.classifications.join(',') : null,
//         card.color || null,
//         card.cost || null,
//         card.date_added || null,
//         card.date_modified || null,
//         card.flavor_text || null,
//         card.franchise || null,
//         card.image || null,
//         card.inkable ? 1 : 0,
//         card.lore || null,
//         card.name || null,
//         card.rarity || null,
//         card.set_id || null,
//         card.set_name || null,
//         card.set_num || null,
//         card.strength || null,
//         card.type || null,
//         card.unique_id || null,
//         card.willpower || null,
//         card.prices?.usd || null,
//         card.prices?.usd_foil || null,
//         new Date().toISOString(),
//         card.collected ? 1 : 0
//     ]

//     try {
//         const db = await getDB()
//         await db.executeSql(query, values)
//     } catch (error) {
//         console.error('Error inserting Lorcana card:', error)
//         throw error
//     }
// }

export const initializeLorcanaDatabase = async () => {
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            console.log('[LorcanaService] Starting database initialization...');
            
            // Get database instance and create tables
            const db = await getDB();
            await ensureTablesCreated();

            // Check if we already have valid cards
            const [results] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards WHERE Name IS NOT NULL');
            const count = results.rows.item(0).count;

            if (count > 0) {
                console.log(`[LorcanaService] Database already contains ${count} valid cards`);
                isInitialized = true;
                return;
            }

            // Clear any null entries before inserting new data
            await db.executeSql('DELETE FROM lorcana_cards WHERE Name IS NULL');

            console.log('[LorcanaService] Fetching bulk card data...');
            const response = await fetch(LorcanaBulkCardApi);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[LorcanaService] Received ${data.length} cards from API`);

            // Insert cards in batches
            const batchSize = 100;
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = data.slice(i, Math.min(i + batchSize, data.length));
                await db.transaction((tx) => {
                    batch.forEach((card: LorcanaCard) => {
                        if (!card || !card.Name) {
                            console.log('[LorcanaService] Skipping invalid card:', card);
                            return;
                        }

                        tx.executeSql(
                            `INSERT OR REPLACE INTO lorcana_cards (
                                Artist, Body_Text, Card_Num, Classifications, Color, Cost,
                                Date_Added, Date_Modified, Flavor_Text, Franchise, Image,
                                Inkable, Lore, Name, Rarity, Set_ID, Set_Name, Set_Num,
                                Strength, Type, Unique_ID, Willpower,
                                price_usd, price_usd_foil, last_updated, collected
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
                                0 // collected
                            ]
                        );
                    });
                });
                console.log(`[LorcanaService] Inserted batch ${i/batchSize + 1}/${Math.ceil(data.length/batchSize)}`);
            }

            console.log('[LorcanaService] Database initialization complete');
            isInitialized = true;

        } catch (error) {
            console.error('[LorcanaService] Database initialization failed:', error);
            throw error;
        }
    })();

    return initializationPromise;
};

// Helper function to get all Lorcana cards from the database
export const getLorcanaCards = async () => {
    try {
        const db = await getDB()
        const [results] = await db.executeSql('SELECT * FROM lorcana_cards;')
        return results.rows.raw()
    } catch (error) {
        console.error('Error getting Lorcana cards:', error)
        throw error
    }
}

// Helper function to search Lorcana cards by name
export const searchLorcanaCards = async (name: string) => {
    try {
        if (!isInitialized) {
            console.log('[LorcanaService] Database not initialized, initializing now...')
            await initializeLorcanaDatabase()
        }
        
        const searchTerm = name.trim()
        console.log(`[LorcanaService] Searching for card: ${searchTerm}`)
        
        const db = await getDB()
        
        // Check total count first
        const [countResults] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards')
        console.log(`[LorcanaService] Total cards in database: ${countResults.rows.item(0).count}`)
        
        // Get sample of all names to verify data
        const [allNames] = await db.executeSql(
            'SELECT Name FROM lorcana_cards WHERE Name IS NOT NULL ORDER BY Name LIMIT 10;'
        )
        console.log('[LorcanaService] First 10 card names in DB:', 
            Array.from({length: allNames.rows.length}, (_, i) => allNames.rows.item(i).Name))
        
        // Try exact match first
        let [results] = await db.executeSql(
            'SELECT * FROM lorcana_cards WHERE Name IS NOT NULL AND UPPER(Name) LIKE UPPER(?);',
            [`%${searchTerm}%`]
        )
        
        if (results.rows.length === 0 && searchTerm.includes(' ')) {
            console.log('[LorcanaService] No match, trying individual words...')
            const words = searchTerm.split(' ').filter(w => w.length > 2)
            for (const word of words) {
                console.log(`[LorcanaService] Trying word: ${word}`)
                ;[results] = await db.executeSql(
                    'SELECT * FROM lorcana_cards WHERE Name IS NOT NULL AND UPPER(Name) LIKE UPPER(?);',
                    [`%${word}%`]
                )
                if (results.rows.length > 0) {
                    console.log(`[LorcanaService] Found matches for word: ${word}`)
                    break
                }
            }
        }
        
        console.log(`[LorcanaService] Found ${results.rows.length} results`)
        if (results.rows.length > 0) {
            console.log('[LorcanaService] First result:', JSON.stringify(results.rows.item(0), null, 2))
        }
        return results.rows.raw()
    } catch (error) {
        console.error('Error searching Lorcana cards:', error)
        throw error
    }
}

// Debug function to list all card names
export const listAllCardNames = async () => {
    try {
        const db = await getDB()
        
        // Check total count
        const [countResults] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards')
        const totalCount = countResults.rows.item(0).count
        console.log(`[LorcanaService] Total cards in database: ${totalCount}`)
        
        // Check if any names are null
        const [nullResults] = await db.executeSql('SELECT COUNT(*) as count FROM lorcana_cards WHERE Name IS NULL')
        const nullCount = nullResults.rows.item(0).count
        console.log(`[LorcanaService] Cards with null names: ${nullCount}`)
        
        // Get sample of actual names
        const [results] = await db.executeSql(
            'SELECT Name, Unique_ID FROM lorcana_cards WHERE Name IS NOT NULL ORDER BY Name LIMIT 20;'
        )
        console.log('[LorcanaService] First 20 card names in database:')
        for (let i = 0; i < results.rows.length; i++) {
            const card = results.rows.item(i)
            console.log(`- ${card.Name} (${card.Unique_ID})`)
        }
        
        // Get sample of records
        const [sampleResults] = await db.executeSql(
            'SELECT * FROM lorcana_cards LIMIT 1;'
        )
        if (sampleResults.rows.length > 0) {
            console.log('[LorcanaService] Sample card record:', JSON.stringify(sampleResults.rows.item(0), null, 2))
        }
        
    } catch (error) {
        console.error('Error listing card names:', error)
    }
}

// Function to fetch current price for a card
export const getLorcanaCardPrice = async (card: { Name: string; Set_Num?: number; Rarity?: string }) => {
    try {
        // Split name into base name and version at the hyphen
        const [baseName, ...versionParts] = card.Name.split('-').map(part => part.trim());
        const version = versionParts.join(' ');

        // Format rarity to lowercase after underscore
        const formattedRarity = card.Rarity ? card.Rarity.replace(' ', '_').replace('_R', '_r') : '';
        console.log('[LorcanaService] Formatted rarity:', formattedRarity);

        // Build search query using card details and properly encode each part
        const queryParts = [
            `name:"${encodeURIComponent(baseName)}"`,
            version ? `version:"${encodeURIComponent(version)}"` : '',
            card.Set_Num ? `set:${encodeURIComponent(card.Set_Num)}` : '',
            formattedRarity ? `rarity:${encodeURIComponent(formattedRarity)}` : ''
        ].filter(Boolean);
        
        const query = `q=${queryParts.join(' ')}`;
        console.log('[LorcanaService] Fetching price with query:', query);
        
        const response = await fetch(`${LorcastPriceApi}?${query}`);
        const data = await response.json();
        console.log('[LorcanaService] API response:', data);

        if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
            console.log('[LorcanaService] No results found for card:', card.Name);
            return {
                usd: null,
                usd_foil: null,
                tcgplayer_id: null
            };
        }

        // Use the first result from the results array
        const cardData = data.results[0];
        console.log('[LorcanaService] Card prices data:', cardData.prices);

        const prices = {
            usd: cardData.prices?.regular || cardData.prices?.usd || null,
            usd_foil: cardData.prices?.foil || cardData.prices?.usd_foil || null,
            tcgplayer_id: cardData.tcgplayer_id || null
        };

        return prices;
    } catch (error) {
        console.error('[LorcanaService] Error fetching Lorcana card price:', error);
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
        console.log('[LorcanaService] Clearing Lorcana database...')
        const db = await getDB()
        await db.executeSql('DELETE FROM lorcana_cards;')
        await db.executeSql('DELETE FROM sqlite_sequence WHERE name="lorcana_cards";') // Reset autoincrement
        isInitialized = false
        console.log('[LorcanaService] Lorcana database cleared')
    } catch (error) {
        console.error('Error clearing Lorcana database:', error)
        throw error
    }
}

// Function to force reload all cards
export const reloadLorcanaCards = async () => {
    try {
        console.log('[LorcanaService] Force reloading Lorcana cards...');
        
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
        
        console.log('[LorcanaService] Lorcana cards reloaded');
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

        // Verify the collection exists
        const [collectionExists] = await db.executeSql(
            'SELECT id FROM lorcana_collections WHERE id = ?',
            [collectionId]
        );

        if (collectionExists.rows.length === 0) {
            throw new Error(`Collection ${collectionId} not found`);
        }

        // Fetch current price
        const prices = await getLorcanaCardPrice({
            Name: card.Name,
            Set_Num: card.Set_Num,
            Rarity: card.Rarity
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

export const getLorcanaSetCollections = async (): Promise<Array<{
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
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // First, get all collections that need updating (recently modified or have outdated prices)
        const [collectionsToUpdate] = await db.executeSql(`
            SELECT DISTINCT c.id, c.updated_at
            FROM lorcana_collections c
            INNER JOIN lorcana_collection_cards lcc ON c.id = lcc.collection_id
            INNER JOIN lorcana_cards lc ON lcc.card_id = lc.Unique_ID
            WHERE c.name LIKE 'Set: %'
            AND (
                c.updated_at > lc.last_updated
                OR lc.last_updated IS NULL 
                OR lc.last_updated < ?
            )
        `, [twentyFourHoursAgo]);

        // Update prices for collections that need it
        for (let i = 0; i < collectionsToUpdate.rows.length; i++) {
            const collection = collectionsToUpdate.rows.item(i);
            const [cardsToUpdate] = await db.executeSql(`
                SELECT lc.*
                FROM lorcana_cards lc
                INNER JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                WHERE lcc.collection_id = ?
            `, [collection.id]);

            // Update all cards in this collection
            for (let j = 0; j < cardsToUpdate.rows.length; j++) {
                const card = cardsToUpdate.rows.item(j);
                if (card.Name && card.Set_Num && card.Rarity) {
                    const prices = await getLorcanaCardPrice({
                        Name: card.Name,
                        Set_Num: card.Set_Num,
                        Rarity: card.Rarity
                    });
                    if (prices.usd) {
                        await db.executeSql(
                            'UPDATE lorcana_cards SET price_usd = ?, price_usd_foil = ?, last_updated = ? WHERE Unique_ID = ?',
                            [prices.usd, prices.usd_foil, new Date().toISOString(), card.Unique_ID]
                        );
                    }
                }
            }
        }

        // Now get all collections with their updated stats
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
                        SELECT COUNT(*) 
                        FROM lorcana_cards lc 
                        WHERE lc.Set_ID = SUBSTR(c.description, INSTR(c.description, '(') + 1, LENGTH(c.description) - INSTR(c.description, '(') - 1)
                    ) as total_cards,
                    (
                        SELECT COALESCE(SUM(CAST(NULLIF(lc.price_usd, '') AS FLOAT)), 0)
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

// Add this function to get cards from a Lorcana collection
export const getLorcanaCollectionCards = async (collectionId: string, page: number = 1, pageSize: number = 20): Promise<LorcanaCardWithPrice[]> => {
    try {
        const db = await getDB();
        const offset = (page - 1) * pageSize;
        const now = new Date().toISOString();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Get cards with collection data and cached prices in a single query
        // Only mark cards for update if they're older than 24 hours
        const [results] = await db.executeSql(`
            SELECT 
                lc.*,
                cc.added_at,
                CASE 
                    WHEN lc.last_updated IS NULL OR lc.last_updated < ? THEN 1 
                    ELSE 0 
                END as needs_update
            FROM lorcana_cards lc
            INNER JOIN lorcana_collection_cards cc ON lc.Unique_ID = cc.card_id
            WHERE cc.collection_id = ?
            ORDER BY lc.Card_Num ASC
            LIMIT ? OFFSET ?;
        `, [twentyFourHoursAgo, collectionId, pageSize, offset]);

        // Convert results to cards array and identify cards needing updates
        const cards: LorcanaCardWithPrice[] = [];
        const cardsToUpdate: Array<{id: string, card: LorcanaCardWithPrice}> = [];

        for (let i = 0; i < results.rows.length; i++) {
            const card = results.rows.item(i);
            const cardWithPrice: LorcanaCardWithPrice = {
                ...card,
                prices: {
                    usd: card.price_usd,
                    usd_foil: card.price_usd_foil,
                    tcgplayer_id: null
                },
                collected: true
            };
            cards.push(cardWithPrice);

            if (card.needs_update && card.Name && card.Set_Num && card.Rarity) {
                cardsToUpdate.push({
                    id: card.Unique_ID,
                    card: cardWithPrice
                });
            }
        }

        // Update prices in background if needed
        if (cardsToUpdate.length > 0) {
            // Don't await this - let it run in background
            (async () => {
                try {
                    // Batch price updates in groups of 5 to avoid rate limiting
                    const batchSize = 5;
                    for (let i = 0; i < cardsToUpdate.length; i += batchSize) {
                        const batch = cardsToUpdate.slice(i, Math.min(i + batchSize, cardsToUpdate.length));
                        await Promise.all(batch.map(async ({id, card}) => {
                            if (card.Name && card.Set_Num && card.Rarity) {
                                const prices = await getLorcanaCardPrice({
                                    Name: card.Name,
                                    Set_Num: card.Set_Num,
                                    Rarity: card.Rarity
                                });
                                if (prices.usd) {
                                    await db.executeSql(
                                        'UPDATE lorcana_cards SET price_usd = ?, price_usd_foil = ?, last_updated = ? WHERE Unique_ID = ?',
                                        [prices.usd, prices.usd_foil, now, id]
                                    );
                                }
                            }
                        }));
                        // Add a small delay between batches to prevent rate limiting
                        if (i + batchSize < cardsToUpdate.length) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                } catch (error) {
                    console.error('Error in background price update:', error);
                }
            })();
        }

        return cards;
    } catch (error) {
        console.error('Error getting Lorcana collection cards:', error);
        throw error;
    }
};

// Helper function to update prices in background
const updateCardPrices = async (cards: LorcanaCardWithPrice[], db: SQLiteDatabase) => {
    try {
        for (const card of cards) {
            if (card.Name && card.Set_Num && card.Rarity) {  // Type guard to ensure required properties exist
                const prices = await getLorcanaCardPrice({
                    Name: card.Name,
                    Set_Num: card.Set_Num,
                    Rarity: card.Rarity
                });
                if (prices.usd) {
                    await db.executeSql(
                        'UPDATE lorcana_cards SET price_usd = ?, price_usd_foil = ?, last_updated = ? WHERE Unique_ID = ?',
                        [prices.usd, prices.usd_foil, new Date().toISOString(), card.Unique_ID]
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error updating card prices:', error);
    }
};

// Add function to delete a card from a collection
export const deleteLorcanaCardFromCollection = async (cardId: string, collectionId: string): Promise<void> => {
    try {
        const db = await getDB();
        await db.transaction(async (tx) => {
            // Remove from collection_cards table
            await tx.executeSql(
                'DELETE FROM lorcana_collection_cards WHERE collection_id = ? AND card_id = ?',
                [collectionId, cardId]
            );

            // Update collection timestamp
            await tx.executeSql(
                'UPDATE lorcana_collections SET updated_at = ? WHERE id = ?',
                [new Date().toISOString(), collectionId]
            );
        });

        // Check if card exists in any other collections
        const [results] = await db.executeSql(
            'SELECT COUNT(*) as count FROM lorcana_collection_cards WHERE card_id = ?',
            [cardId]
        );
        
        // If card is not in any other collections, mark as uncollected
        if (results.rows.item(0).count === 0) {
            await db.executeSql(
                'UPDATE lorcana_cards SET collected = 0 WHERE Unique_ID = ?',
                [cardId]
            );
        }
    } catch (error) {
        console.error('[LorcanaService] Error deleting card from collection:', error);
        throw error;
    }
};

