import SQLite from 'react-native-sqlite-storage';
import { DatabaseManager } from '../database/DatabaseManager';

// Define interfaces for price data
export interface PriceData {
    normal: number;
    foil: number;
    tcg_normal?: number;
    tcg_foil?: number;
    cardmarket_normal?: number;
    cardmarket_foil?: number;
    cardkingdom_normal?: number;
    cardkingdom_foil?: number;
    cardsphere_normal?: number;
    cardsphere_foil?: number;
    cardhoarder_normal?: number;
    cardhoarder_foil?: number;
}

export interface PriceHistoryEntry {
    date: string;
    normal: number;
    foil: number;
    tcgplayer: { normal: number; foil: number };
    cardmarket: { normal: number; foil: number };
    cardkingdom: { normal: number; foil: number };
    cardsphere: { normal: number; foil: number };
}

export interface PriceHistoryStats {
    maxPrice: number;
    minPrice: number;
    avgPrice: number;
    priceChange30d: number;
    priceChange7d: number;
    maxFoilPrice: number;
    minFoilPrice: number;
    avgFoilPrice: number;
    foilPriceChange30d: number;
    foilPriceChange7d: number;
}

export interface PriceIntegrityResult {
    isValid: boolean;
    issues: string[];
    totalPrices: number;
    totalHistory: number;
    daysOfHistory: number;
    lastUpdate: Date | null;
}

export class PriceService {
    // Minimum time between price updates (24 hours)
    private readonly PRICE_UPDATE_INTERVAL = 24 * 60 * 60 * 1000;

    constructor(private dbManager: DatabaseManager) {}

    /**
     * Initialize the price service by creating necessary tables
     */
    async initialize(): Promise<void> {
        await this.createPriceTables();
    }

    /**
     * Create tables required for price data
     */
    async createPriceTables(): Promise<void> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            console.log('[PriceService] Creating price tables...');

            // Create prices table
            await db.executeSql(`
                CREATE TABLE IF NOT EXISTS prices (
                    uuid TEXT PRIMARY KEY,
                    normal_price REAL DEFAULT 0,
                    foil_price REAL DEFAULT 0,
                    tcg_normal_price REAL DEFAULT 0,
                    tcg_foil_price REAL DEFAULT 0,
                    cardmarket_normal_price REAL DEFAULT 0,
                    cardmarket_foil_price REAL DEFAULT 0,
                    cardkingdom_normal_price REAL DEFAULT 0,
                    cardkingdom_foil_price REAL DEFAULT 0,
                    cardsphere_normal_price REAL DEFAULT 0,
                    cardsphere_foil_price REAL DEFAULT 0,
                    cardhoarder_normal_price REAL DEFAULT 0,
                    cardhoarder_foil_price REAL DEFAULT 0,
                    last_updated INTEGER
                )
            `);

            // Create price history table
            await db.executeSql(`
                CREATE TABLE IF NOT EXISTS price_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT,
                    normal_price REAL DEFAULT 0,
                    foil_price REAL DEFAULT 0,
                    tcg_normal_price REAL DEFAULT 0,
                    tcg_foil_price REAL DEFAULT 0,
                    cardmarket_normal_price REAL DEFAULT 0,
                    cardmarket_foil_price REAL DEFAULT 0,
                    cardkingdom_normal_price REAL DEFAULT 0,
                    cardkingdom_foil_price REAL DEFAULT 0,
                    cardsphere_normal_price REAL DEFAULT 0,
                    cardsphere_foil_price REAL DEFAULT 0,
                    cardhoarder_normal_price REAL DEFAULT 0,
                    cardhoarder_foil_price REAL DEFAULT 0,
                    timestamp INTEGER,
                    FOREIGN KEY (uuid) REFERENCES cards(uuid)
                )
            `);

            // Create index on uuid for price_history
            await db.executeSql(`
                CREATE INDEX IF NOT EXISTS idx_price_history_uuid ON price_history(uuid)
            `);

            // Create table for tracking price updates
            await db.executeSql(`
                CREATE TABLE IF NOT EXISTS price_updates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    update_timestamp INTEGER,
                    success BOOLEAN,
                    cards_updated INTEGER
                )
            `);

            console.log('[PriceService] Price tables created successfully');
        } catch (error) {
            console.error('[PriceService] Error creating price tables:', error);
            throw error;
        }
    }

    /**
     * Update prices with new data
     */
    async updatePrices(priceData: Record<string, PriceData>): Promise<void> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            console.log('[PriceService] Updating prices...');
            const timestamp = Date.now();

            // Convert price data to batches for efficient processing
            const entries = Object.entries(priceData);
            const batchSize = 500;
            const batches = [];

            for (let i = 0; i < entries.length; i += batchSize) {
                batches.push(entries.slice(i, i + batchSize));
            }

            // Process each batch
            for (const batch of batches) {
                await this.updateCurrentPrices(batch, timestamp);
                await this.updatePricesWithHistory(batch, timestamp, timestamp);
            }

            // Record the update
            await db.executeSql(`
                INSERT INTO price_updates (update_timestamp, success, cards_updated)
                VALUES (?, ?, ?)
            `, [timestamp, true, entries.length]);

            console.log(`[PriceService] Updated prices for ${entries.length} cards`);
        } catch (error) {
            console.error('[PriceService] Error updating prices:', error);
            throw error;
        }
    }

    /**
     * Update current prices for a batch of cards
     */
    private async updateCurrentPrices(
        batch: [string, PriceData][],
        timestamp: number
    ): Promise<void> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            // Create placeholders for SQL query
            const placeholders = batch.map(() => 
                '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).join(',');
            
            const values = batch.flatMap(([uuid, priceObj]) => [
                uuid,
                priceObj.normal || 0,
                priceObj.foil || 0,
                priceObj.tcg_normal || 0,
                priceObj.tcg_foil || 0,
                priceObj.cardmarket_normal || 0,
                priceObj.cardmarket_foil || 0,
                priceObj.cardkingdom_normal || 0,
                priceObj.cardkingdom_foil || 0,
                priceObj.cardsphere_normal || 0,
                priceObj.cardsphere_foil || 0,
                priceObj.cardhoarder_normal || 0,
                priceObj.cardhoarder_foil || 0,
                timestamp
            ]);
            
            // Upsert price data
            await db.executeSql(`
                INSERT OR REPLACE INTO prices (
                    uuid, 
                    normal_price, 
                    foil_price,
                    tcg_normal_price,
                    tcg_foil_price,
                    cardmarket_normal_price,
                    cardmarket_foil_price,
                    cardkingdom_normal_price,
                    cardkingdom_foil_price,
                    cardsphere_normal_price,
                    cardsphere_foil_price,
                    cardhoarder_normal_price,
                    cardhoarder_foil_price,
                    last_updated
                ) VALUES ${placeholders}
            `, values);
        } catch (error) {
            console.error('[PriceService] Error updating current prices:', error);
            throw error;
        }
    }

    /**
     * Update price history for a batch of cards
     */
    private async updatePricesWithHistory(
        batch: [string, PriceData][],
        currentTimestamp: number,
        historyTimestamp: number
    ): Promise<void> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            // Create placeholders for SQL query
            const placeholders = batch.map(() => 
                '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).join(',');
            
            const values = batch.flatMap(([uuid, priceObj]) => [
                uuid,
                priceObj.normal || 0,
                priceObj.foil || 0,
                priceObj.tcg_normal || 0,
                priceObj.tcg_foil || 0,
                priceObj.cardmarket_normal || 0,
                priceObj.cardmarket_foil || 0,
                priceObj.cardkingdom_normal || 0,
                priceObj.cardkingdom_foil || 0,
                priceObj.cardsphere_normal || 0,
                priceObj.cardsphere_foil || 0,
                priceObj.cardhoarder_normal || 0,
                priceObj.cardhoarder_foil || 0,
                historyTimestamp,
                uuid
            ]);
            
            // Insert into history table
            await db.executeSql(`
                INSERT INTO price_history (
                    uuid, 
                    normal_price, 
                    foil_price,
                    tcg_normal_price,
                    tcg_foil_price,
                    cardmarket_normal_price,
                    cardmarket_foil_price,
                    cardkingdom_normal_price,
                    cardkingdom_foil_price,
                    cardsphere_normal_price,
                    cardsphere_foil_price,
                    cardhoarder_normal_price,
                    cardhoarder_foil_price,
                    timestamp,
                    source_uuid
                ) VALUES ${placeholders}
            `, values);
        } catch (error) {
            console.error('[PriceService] Error updating price history:', error);
            throw error;
        }
    }

    /**
     * Get price history for a specific card
     */
    async getCardPriceHistory(uuid: string): Promise<PriceHistoryEntry[]> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            const [results] = await db.executeSql(`
                SELECT 
                    timestamp,
                    normal_price,
                    foil_price,
                    tcg_normal_price,
                    tcg_foil_price,
                    cardmarket_normal_price,
                    cardmarket_foil_price,
                    cardkingdom_normal_price,
                    cardkingdom_foil_price,
                    cardsphere_normal_price,
                    cardsphere_foil_price
                FROM price_history
                WHERE uuid = ?
                ORDER BY timestamp DESC
            `, [uuid]);

            const history: PriceHistoryEntry[] = [];
            for (let i = 0; i < results.rows.length; i++) {
                const row = results.rows.item(i);
                history.push({
                    date: new Date(row.timestamp).toISOString(),
                    normal: row.normal_price || 0,
                    foil: row.foil_price || 0,
                    tcgplayer: { 
                        normal: row.tcg_normal_price || 0, 
                        foil: row.tcg_foil_price || 0 
                    },
                    cardmarket: { 
                        normal: row.cardmarket_normal_price || 0, 
                        foil: row.cardmarket_foil_price || 0 
                    },
                    cardkingdom: { 
                        normal: row.cardkingdom_normal_price || 0, 
                        foil: row.cardkingdom_foil_price || 0 
                    },
                    cardsphere: { 
                        normal: row.cardsphere_normal_price || 0, 
                        foil: row.cardsphere_foil_price || 0 
                    }
                });
            }

            return history;
        } catch (error) {
            console.error('[PriceService] Error getting card price history:', error);
            throw error;
        }
    }

    /**
     * Get price history statistics for a card
     */
    async getCardPriceHistoryStats(uuid: string): Promise<PriceHistoryStats> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            // Get statistics for normal prices
            const [normalResults] = await db.executeSql(`
                SELECT 
                    MAX(normal_price) as max_price,
                    MIN(normal_price) as min_price,
                    AVG(normal_price) as avg_price
                FROM price_history
                WHERE uuid = ?
            `, [uuid]);

            // Get statistics for foil prices
            const [foilResults] = await db.executeSql(`
                SELECT 
                    MAX(foil_price) as max_price,
                    MIN(foil_price) as min_price,
                    AVG(foil_price) as avg_price
                FROM price_history
                WHERE uuid = ?
            `, [uuid]);

            // Get price changes for 7 and 30 days
            const now = Date.now();
            const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
            const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

            // Get current price
            const [currentResults] = await db.executeSql(`
                SELECT normal_price, foil_price
                FROM prices
                WHERE uuid = ?
            `, [uuid]);

            // Get price from 7 days ago
            const [sevenDayResults] = await db.executeSql(`
                SELECT normal_price, foil_price
                FROM price_history
                WHERE uuid = ? AND timestamp <= ?
                ORDER BY timestamp DESC
                LIMIT 1
            `, [uuid, sevenDaysAgo]);

            // Get price from 30 days ago
            const [thirtyDayResults] = await db.executeSql(`
                SELECT normal_price, foil_price
                FROM price_history
                WHERE uuid = ? AND timestamp <= ?
                ORDER BY timestamp DESC
                LIMIT 1
            `, [uuid, thirtyDaysAgo]);

            const currentPrice = currentResults.rows.length > 0 ? currentResults.rows.item(0).normal_price : 0;
            const currentFoilPrice = currentResults.rows.length > 0 ? currentResults.rows.item(0).foil_price : 0;
            const sevenDayPrice = sevenDayResults.rows.length > 0 ? sevenDayResults.rows.item(0).normal_price : currentPrice;
            const sevenDayFoilPrice = sevenDayResults.rows.length > 0 ? sevenDayResults.rows.item(0).foil_price : currentFoilPrice;
            const thirtyDayPrice = thirtyDayResults.rows.length > 0 ? thirtyDayResults.rows.item(0).normal_price : currentPrice;
            const thirtyDayFoilPrice = thirtyDayResults.rows.length > 0 ? thirtyDayResults.rows.item(0).foil_price : currentFoilPrice;

            // Calculate changes
            const priceChange7d = sevenDayPrice === 0 ? 0 : (currentPrice - sevenDayPrice) / sevenDayPrice * 100;
            const priceChange30d = thirtyDayPrice === 0 ? 0 : (currentPrice - thirtyDayPrice) / thirtyDayPrice * 100;
            const foilPriceChange7d = sevenDayFoilPrice === 0 ? 0 : (currentFoilPrice - sevenDayFoilPrice) / sevenDayFoilPrice * 100;
            const foilPriceChange30d = thirtyDayFoilPrice === 0 ? 0 : (currentFoilPrice - thirtyDayFoilPrice) / thirtyDayFoilPrice * 100;

            return {
                maxPrice: normalResults.rows.item(0).max_price || 0,
                minPrice: normalResults.rows.item(0).min_price || 0,
                avgPrice: normalResults.rows.item(0).avg_price || 0,
                priceChange7d,
                priceChange30d,
                maxFoilPrice: foilResults.rows.item(0).max_price || 0,
                minFoilPrice: foilResults.rows.item(0).min_price || 0,
                avgFoilPrice: foilResults.rows.item(0).avg_price || 0,
                foilPriceChange7d,
                foilPriceChange30d
            };
        } catch (error) {
            console.error('[PriceService] Error getting card price history stats:', error);
            throw error;
        }
    }

    /**
     * Check if prices should be updated
     */
    async shouldUpdatePrices(force: boolean = false): Promise<boolean> {
        if (force) {
            return true;
        }

        try {
            const lastUpdate = await this.getLastPriceUpdate();
            if (lastUpdate === null) {
                return true;
            }

            const now = Date.now();
            return (now - lastUpdate) > this.PRICE_UPDATE_INTERVAL;
        } catch (error) {
            console.error('[PriceService] Error checking if prices should be updated:', error);
            return false;
        }
    }

    /**
     * Get the timestamp of the last price update
     */
    async getLastPriceUpdate(): Promise<number | null> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            const [results] = await db.executeSql(`
                SELECT update_timestamp
                FROM price_updates
                WHERE success = 1
                ORDER BY update_timestamp DESC
                LIMIT 1
            `);

            if (results.rows.length === 0) {
                return null;
            }

            return results.rows.item(0).update_timestamp;
        } catch (error) {
            console.error('[PriceService] Error getting last price update:', error);
            throw error;
        }
    }

    /**
     * Get paginated price data
     */
    async getPriceData(page: number, pageSize: number): Promise<{ uuid: string; normal_price: number; foil_price: number; last_updated: number; }[]> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            const offset = (page - 1) * pageSize;
            const [results] = await db.executeSql(`
                SELECT uuid, normal_price, foil_price, last_updated
                FROM prices
                ORDER BY normal_price DESC
                LIMIT ? OFFSET ?
            `, [pageSize, offset]);

            const priceData = [];
            for (let i = 0; i < results.rows.length; i++) {
                priceData.push(results.rows.item(i));
            }

            return priceData;
        } catch (error) {
            console.error('[PriceService] Error getting price data:', error);
            throw error;
        }
    }

    /**
     * Verify the integrity of price data
     */
    async verifyPriceDataIntegrity(): Promise<PriceIntegrityResult> {
        const db = this.dbManager.getAppDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        try {
            const issues = [];
            let isValid = true;

            // Check if prices table exists
            const [tablesResult] = await db.executeSql(`
                SELECT name FROM sqlite_master WHERE type='table' AND name='prices'
            `);
            
            if (tablesResult.rows.length === 0) {
                issues.push('Prices table does not exist');
                isValid = false;
            }

            // Check price count
            let totalPrices = 0;
            if (isValid) {
                const [pricesResult] = await db.executeSql('SELECT COUNT(*) as count FROM prices');
                totalPrices = pricesResult.rows.item(0).count;
                
                if (totalPrices === 0) {
                    issues.push('No price data found');
                    isValid = false;
                }
            }

            // Check price history
            let totalHistory = 0;
            let daysOfHistory = 0;
            if (isValid) {
                const [historyResult] = await db.executeSql('SELECT COUNT(*) as count FROM price_history');
                totalHistory = historyResult.rows.item(0).count;
                
                if (totalHistory === 0) {
                    issues.push('No price history found');
                }

                // Get oldest and newest price history entries
                const [timeSpanResult] = await db.executeSql(`
                    SELECT 
                        MIN(timestamp) as oldest,
                        MAX(timestamp) as newest
                    FROM price_history
                `);
                
                if (timeSpanResult.rows.length > 0) {
                    const oldest = timeSpanResult.rows.item(0).oldest;
                    const newest = timeSpanResult.rows.item(0).newest;
                    
                    if (oldest && newest) {
                        daysOfHistory = Math.round((newest - oldest) / (24 * 60 * 60 * 1000));
                    }
                }
            }

            // Get last update time
            let lastUpdate = null;
            if (isValid) {
                const lastUpdateTimestamp = await this.getLastPriceUpdate();
                if (lastUpdateTimestamp) {
                    lastUpdate = new Date(lastUpdateTimestamp);
                } else {
                    issues.push('No record of last price update');
                }
            }

            return {
                isValid,
                issues,
                totalPrices,
                totalHistory,
                daysOfHistory,
                lastUpdate
            };
        } catch (error) {
            console.error('[PriceService] Error verifying price data integrity:', error);
            throw error;
        }
    }
} 