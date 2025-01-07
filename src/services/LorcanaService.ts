import { openDatabase, SQLiteDatabase, enablePromise } from 'react-native-sqlite-storage'

// Enable promise support for SQLite
enablePromise(true)

const LorcanaBulkCardApi = 'https://api.lorcana-api.com/bulk/cards'
const LorcastPriceApi = 'https://lorcast.com/api/v1/cards'

let dbInstance: SQLiteDatabase | null = null
let isInitialized = false

const getDB = async () => {
    if (dbInstance) return dbInstance
    console.log('[LorcanaService] Initializing database...')
    try {
        dbInstance = await openDatabase({ name: 'mtgprice.db', location: 'default' })
        console.log('[LorcanaService] Database initialized')
        return dbInstance
    } catch (error) {
        console.error('[LorcanaService] Database initialization failed:', error)
        throw error
    }
}

const createLorcanaTable = async () => {
    try {
        const db = await getDB()
        
        // Drop the existing table to ensure we have the correct schema
        await db.executeSql('DROP TABLE IF EXISTS lorcana_cards;')
        
        await db.executeSql(`
            CREATE TABLE IF NOT EXISTS lorcana_cards (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                Artist         TEXT,
                Body_Text      TEXT,
                Card_Num       INTEGER,
                Classifications TEXT,
                Color          TEXT,
                Cost           INTEGER,
                Date_Added     TEXT,
                Date_Modified  TEXT,
                Flavor_Text    TEXT,
                Franchise      TEXT,
                Image          TEXT,
                Inkable        INTEGER,
                Lore           INTEGER,
                Name           TEXT,
                Rarity         TEXT,
                Set_ID         TEXT,
                Set_Name       TEXT,
                Set_Num        INTEGER,
                Strength       INTEGER,
                Type           TEXT,
                Unique_ID      TEXT UNIQUE,
                Willpower      INTEGER,
                price_usd      TEXT,
                price_usd_foil TEXT,
                last_updated   TEXT,
                collected      INTEGER DEFAULT 0
            );
            
            CREATE INDEX IF NOT EXISTS idx_lorcana_name ON lorcana_cards(Name);
            CREATE INDEX IF NOT EXISTS idx_lorcana_unique_id ON lorcana_cards(Unique_ID);
        `)
        console.log('[LorcanaService] Lorcana cards table created successfully')
    } catch (error) {
        console.error('[LorcanaService] Error creating Lorcana cards table:', error)
        throw error
    }
}

interface LorcanaCard {
    artist?: string;
    body_text?: string;
    card_num?: number;
    classifications?: string[];
    color?: string;
    cost?: number;
    date_added?: string;
    date_modified?: string;
    flavor_text?: string;
    franchise?: string;
    image?: string;
    inkable?: boolean;
    lore?: number;
    name?: string;
    rarity?: string;
    set_id?: string;
    set_name?: string;
    set_num?: number;
    strength?: number;
    type?: string;
    unique_id?: string;
    willpower?: number;
    collected?: boolean;
}

interface LorcanaPrice {
    usd: string | null;
    usd_foil: string | null;
}

interface LorcanaCardWithPrice extends LorcanaCard {
    prices?: LorcanaPrice;
}

const insertLorcanaCard = async (card: LorcanaCardWithPrice) => {
    const query = `
        INSERT OR REPLACE INTO lorcana_cards (
            Artist, Body_Text, Card_Num, Classifications, Color, Cost,
            Date_Added, Date_Modified, Flavor_Text, Franchise, Image,
            Inkable, Lore, Name, Rarity, Set_ID, Set_Name, Set_Num,
            Strength, Type, Unique_ID, Willpower,
            price_usd, price_usd_foil, last_updated, collected
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `

    const values = [
        card.artist || null,
        card.body_text || null,
        card.card_num || null,
        Array.isArray(card.classifications) ? card.classifications.join(',') : null,
        card.color || null,
        card.cost || null,
        card.date_added || null,
        card.date_modified || null,
        card.flavor_text || null,
        card.franchise || null,
        card.image || null,
        card.inkable ? 1 : 0,
        card.lore || null,
        card.name || null,
        card.rarity || null,
        card.set_id || null,
        card.set_name || null,
        card.set_num || null,
        card.strength || null,
        card.type || null,
        card.unique_id || null,
        card.willpower || null,
        card.prices?.usd || null,
        card.prices?.usd_foil || null,
        new Date().toISOString(),
        card.collected ? 1 : 0
    ]

    try {
        const db = await getDB()
        await db.executeSql(query, values)
    } catch (error) {
        console.error('Error inserting Lorcana card:', error)
        throw error
    }
}

export const initializeLorcanaDatabase = async () => {
    if (isInitialized) return;

    try {
        console.log('[LorcanaService] Starting database initialization...');

        // Create tables first
        await createLorcanaTable();

        // Check if we already have valid cards (not just null entries)
        const db = await getDB();
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

        // Log data array details
        console.log('[LorcanaService] API response data length:', data.length);
        console.log('[LorcanaService] API response data type:', typeof data);
        console.log('[LorcanaService] Is array?', Array.isArray(data));

        // Log a sample of the data
        console.log('[LorcanaService] Sample of first card:', JSON.stringify(data[0], null, 2));
        console.log('[LorcanaService] Sample of second card:', JSON.stringify(data[1], null, 2));

        if (!Array.isArray(data)) {
            console.error('[LorcanaService] Invalid API response:', data);
            throw new Error('Invalid data format received from API - expected array of cards');
        }

        console.log(`[LorcanaService] Inserting ${data.length} Lorcana cards...`);

        let insertedCount = 0;
        let errorCount = 0;

        // Initiate the transaction without async
        await db.transaction((tx) => {
            data.forEach((card, index) => {
                if (!card || !card.Name) {
                    console.log('[LorcanaService] Skipping invalid card:', card);
                    return;
                }

                const query = `
                    INSERT OR REPLACE INTO lorcana_cards (
                        Artist, Body_Text, Card_Num, Classifications, Color, Cost,
                        Date_Added, Date_Modified, Flavor_Text, Franchise, Image,
                        Inkable, Lore, Name, Rarity, Set_ID, Set_Name, Set_Num,
                        Strength, Type, Unique_ID, Willpower,
                        price_usd, price_usd_foil, last_updated, collected
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                `;

                const values = [
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
                    null, // price_usd - will be fetched separately
                    null, // price_usd_foil - will be fetched separately
                    new Date().toISOString(),
                    0 // collected
                ];

                tx.executeSql(
                    query,
                    values,
                    () => {
                        insertedCount++;
                        // Log progress every 100 cards to reduce verbosity
                        if (insertedCount % 100 === 0) {
                            console.log(`[LorcanaService] Progress: ${insertedCount}/${data.length} cards inserted`);
                        }
                    },
                    (tx, error) => {
                        console.error(`[LorcanaService] Error inserting card ${card.Name || 'unknown'}:`, error);
                        errorCount++;
                        // Returning false here to continue with the transaction despite the error
                        return false;
                    }
                );
            });
        });

        console.log(`[LorcanaService] Successfully inserted ${insertedCount} out of ${data.length} cards`);
        console.log(`[LorcanaService] Database initialization complete. Total cards in database: ${insertedCount}`);
        isInitialized = true;

    } catch (error) {
        console.error('[LorcanaService] Database initialization failed:', error);
        throw error;
    }
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
export const getLorcanaCardPrice = async (cardId: string) => {
    try {
        // First check if we have this card with a recent price in our database
        const db = await getDB()
        const [results] = await db.executeSql(
            `SELECT price_usd, price_usd_foil, last_updated 
             FROM lorcana_cards 
             WHERE Unique_ID = ?;`,
            [cardId]
        )

        if (results.rows.length > 0) {
            const card = results.rows.item(0)
            const lastUpdated = new Date(card.last_updated)
            const now = new Date()
            const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60)

            // If price is less than 24 hours old, use cached price
            if (hoursSinceUpdate < 24 && (card.price_usd || card.price_usd_foil)) {
                console.log('Using cached price for card:', cardId)
                return {
                    usd: card.price_usd,
                    usd_foil: card.price_usd_foil
                }
            }
        }

        // If we don't have a recent price, fetch from API
        console.log('Fetching fresh price for card:', cardId)
        const response = await fetch(`${LorcastPriceApi}/${cardId}`)
        const data = await response.json()
        const prices = {
            usd: data.prices?.usd || null,
            usd_foil: data.prices?.usd_foil || null
        }

        // Update the price in our database
        await db.executeSql(
            `UPDATE lorcana_cards 
             SET price_usd = ?, 
                 price_usd_foil = ?,
                 last_updated = ?
             WHERE Unique_ID = ?;`,
            [prices.usd, prices.usd_foil, new Date().toISOString(), cardId]
        )

        return prices
    } catch (error) {
        console.error('Error fetching Lorcana card price:', error)
        throw error
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
        const prices = await getLorcanaCardPrice(cardId)
        
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
        console.log('[LorcanaService] Force reloading Lorcana cards...')
        await clearLorcanaDatabase()
        await initializeLorcanaDatabase()
        console.log('[LorcanaService] Lorcana cards reloaded')
    } catch (error) {
        console.error('Error reloading Lorcana cards:', error)
        throw error
    }
}

