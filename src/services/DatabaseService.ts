import SQLite, { openDatabase } from 'react-native-sqlite-storage';
import { MigrationManager } from '../database/migrations/MigrationManager';
import { AddSetNumberToLorcanaCollections } from '../database/migrations/002_AddSetNumberToLorcanaCollections';
import AddLorcanaSetsTable from '../database/migrations/003_AddLorcanaSetsTable';
import AddImportHistoryTable from '../database/migrations/004_AddImportHistoryTable';
import { AddQuantityColumnsToLorcanaCollectionCards } from '../database/migrations/005_AddQuantityColumnsToLorcanaCollectionCards';
import { DataMerger } from '../database/DataMerger';
import DatabaseInitializer from './DatabaseInitializer';

SQLite.enablePromise(true);
SQLite.DEBUG(false);

/**
 * DatabaseService
 *
 * Manages database operations for the Lorcana card tracking application.
 * Handles collections, app settings, and general database utilities.
 */

export interface Collection {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    totalValue: number;
    cardCount: number;
    totalCollected?: number;
}

interface SetCollectionStats {
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
}

export type SetInfo = {
    code: string;
    name: string;
    cardCount: number;
    highestPrice?: number;
};

let appDb: SQLite.SQLiteDatabase | null = null;

// Function to safely handle database transactions with automatic recovery
export const safeExecuteSQL = async <T>(
    db: SQLite.SQLiteDatabase | null,
    sqlStatement: string,
    params: any[] = [],
    errorHandler?: (error: Error) => Promise<T | null>
): Promise<T> => {
    try {
        if (!db) {
            throw new Error('Database not initialized');
        }

        return await db.executeSql(sqlStatement, params) as unknown as T;
    } catch (error) {
        console.error(`[DatabaseService] Error executing SQL: ${sqlStatement}`, error);

        // Check if it's a database closed error
        if (error instanceof Error &&
            (error.message.includes('already-closed') ||
             error.message.includes('attempt to re-open an already-closed object'))) {

            // If custom error handler is provided, try it first
            if (errorHandler) {
                const result = await errorHandler(error);
                if (result !== null) {
                    return result;
                }
            }

            throw new Error(`Database connection error: ${error.message}`);
        }

        throw error;
    }
};

// Add recovery function for the main database
const recoverMainDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
    console.log('[DatabaseService] Attempting to recover main database connection');
    try {
        // Close any existing connection first
        if (appDb) {
            try {
                await appDb.close();
            } catch (closeError) {
                console.log('[DatabaseService] Error closing existing connection:', closeError);
                // Continue regardless
            }
            appDb = null;
        }

        // Reopen the database
        const dbName = 'lorcana.db';
        appDb = await openDatabase({
            name: dbName,
            location: 'default',
            createFromLocation: 2
        });

        // Set pragmas
        await appDb.executeSql('PRAGMA foreign_keys = ON;');
        await appDb.executeSql('PRAGMA journal_mode = WAL;');

        console.log('[DatabaseService] Successfully recovered main database connection');
        return appDb;
    } catch (error) {
        console.error('[DatabaseService] Failed to recover main database:', error);
        throw error;
    }
};

export default class DatabaseService {
    private db: SQLite.SQLiteDatabase | null = null;
    private setListCache: SetInfo[] | null = null;
    private setListLastUpdate = 0;
    private readonly SET_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    private migrationManager: MigrationManager | null = null;
    private dataMerger: DataMerger | null = null;

    // Add static properties to the class outside the method
    private static tableCacheTimestamp = 0;
    private static tablesCreated = false;

    constructor() {
        // Database initialization will happen on first use
    }

    async initDatabase(): Promise<void> {
        try {
            console.log('[DatabaseService] Initializing database...');

            // Initialize database connection
            if (!this.db) {
                this.db = await SQLite.openDatabase({
                    name: 'lorcana.db',
                    location: 'default',
                });
            }

            // Initialize migration manager
            this.migrationManager = new MigrationManager(this.db);
            this.migrationManager.registerMigration(AddSetNumberToLorcanaCollections);
            this.migrationManager.registerMigration({ version: 3, up: AddLorcanaSetsTable.up });
            this.migrationManager.registerMigration({ version: 4, up: AddImportHistoryTable.up });
            this.migrationManager.registerMigration(AddQuantityColumnsToLorcanaCollectionCards);

            // Run migrations
            await this.migrationManager.migrateToLatest();

            // Initialize data merger
            this.dataMerger = new DataMerger(this.db);

            console.log('[DatabaseService] Database initialized successfully');

            // Enable foreign keys
            await this.db.executeSql('PRAGMA foreign_keys = ON;');
            console.log('[DatabaseService] Foreign key constraints enabled');

            // Verify and create database structure
            await this.verifyDatabaseStructure();
            console.log('[DatabaseService] Database structure verified');

            // Verify the connection is working
            const [tables] = await this.db.executeSql("SELECT name FROM sqlite_master WHERE type='table'");
            console.log('[DatabaseService] Existing tables:', tables.rows.raw());

        } catch (error) {
            console.error('[DatabaseService] Database initialization error:', error);
            if (error instanceof Error) {
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            // Reset the database connection on error
            this.db = null;
            throw error;
        }
    }

    private async verifyDatabaseStructure(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            console.log('Verifying database structure...');

            // Enable foreign key constraints
            await this.db.executeSql('PRAGMA foreign_keys = ON;');
            console.log('Foreign key constraints enabled');

            // Create collections table
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    total_value REAL DEFAULT 0,
                    card_count INTEGER DEFAULT 0
                )
            `);
            console.log('Collections table created/verified');

            // Create collection_cards table if it doesn't exist
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS collection_cards (
                    collection_id TEXT NOT NULL,
                    card_uuid TEXT NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    added_at TEXT NOT NULL,
                    is_foil INTEGER DEFAULT 0,
                    PRIMARY KEY (collection_id, card_uuid, is_foil),
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
                )
            `);
            console.log('Collection_cards table created/verified');

            // Create app_settings table if it doesn't exist
            await this.db.executeSql(`
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY NOT NULL,
                    value TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            `);
            console.log('App settings table created/verified');

            console.log('[DatabaseService] Database structure verified');
        } catch (error) {
            console.error('Database verification error:', error);
            throw error;
        }
    }

    async createCollection(name: string, description?: string): Promise<Collection> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const id = `collection_${Date.now()}`;
            const now = new Date().toISOString();

            await this.db!.transaction(async (tx) => {
                await tx.executeSql(
                    'INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                    [id, name, description || null, now, now]
                );
            });

            return {
                id,
                name,
                description: description || null,
                createdAt: now,
                updatedAt: now,
                totalValue: 0,
                cardCount: 0,
            };
        } catch (error) {
            console.error('Error creating collection:', error);
            throw error;
        }
    }

    async getCollections(): Promise<Collection[]> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const [result] = await this.db!.executeSql(
                `SELECT
                    c.id,
                    c.name,
                    c.description,
                    c.created_at as createdAt,
                    c.updated_at as updatedAt,
                    COALESCE(SUM(CASE WHEN cc.quantity > 0 THEN cc.quantity ELSE 0 END), 0) as cardCount,
                    c.total_value as totalValue
                FROM collections c
                LEFT JOIN collection_cards cc ON c.id = cc.collection_id
                GROUP BY c.id
                ORDER BY c.created_at DESC`
            );

            const collections: Collection[] = [];
            for (let i = 0; i < result.rows.length; i++) {
                collections.push(result.rows.item(i));
            }

            return collections;
        } catch (error) {
            console.error('Error getting collections:', error);
            throw error;
        }
    }

    async closeDatabase() {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }

    async getSetCollections(): Promise<(Collection & SetCollectionStats)[]> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            // Get all collections that start with "Set: "
            const [result] = await this.db!.executeSql(
                `SELECT
                    c.id,
                    c.name,
                    c.description,
                    c.created_at as createdAt,
                    c.updated_at as updatedAt,
                    c.total_value as totalValue,
                    COALESCE(SUM(cc.quantity), 0) as cardCount
                FROM collections c
                LEFT JOIN collection_cards cc ON c.id = cc.collection_id
                WHERE c.name LIKE 'Set: %'
                GROUP BY c.id
                ORDER BY c.name ASC`
            );

            const collections: (Collection & SetCollectionStats)[] = [];
            for (let i = 0; i < result.rows.length; i++) {
                const collection = result.rows.item(i);

                // For now, we'll set these to 0 since we don't have Lorcana card data here
                // These values should be calculated based on actual Lorcana set data
                collections.push({
                    ...collection,
                    totalCards: 0,
                    collectedCards: collection.cardCount || 0,
                    completionPercentage: 0
                });
            }

            return collections;
        } catch (error) {
            console.error('[DatabaseService] Error getting set collections:', error);
            throw error;
        }
    }

    async getOrCreateSetCollection(setCode: string, setName: string): Promise<string> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            const collectionName = `Set: ${setName}`;

            // Check if collection already exists
            const [existingResult] = await this.db!.executeSql(
                'SELECT id FROM collections WHERE name = ?',
                [collectionName]
            );

            if (existingResult.rows.length > 0) {
                return existingResult.rows.item(0).id;
            }

            // Create new collection
            const collection = await this.createCollection(
                collectionName,
                `Complete set collection for ${setName}`
            );

            return collection.id;
        } catch (error) {
            console.error('[DatabaseService] Error in getOrCreateSetCollection:', error);
            throw error;
        }
    }

    async deleteCollection(collectionId: string): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            await this.db!.transaction(async (tx) => {
                // Delete the collection (cascade will handle collection_cards)
                await tx.executeSql(
                    'DELETE FROM collections WHERE id = ?',
                    [collectionId]
                );
            });
        } catch (error) {
            console.error('Error deleting collection:', error);
            throw error;
        }
    }

    public ensureInitialized = async (): Promise<void> => {
        if (!this.db) {
            await this.initDatabase();
        }
    };

    async removeCardFromCollection(cardUuid: string, collectionId: string): Promise<void> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            await this.db!.executeSql(
                'DELETE FROM collection_cards WHERE card_uuid = ? AND collection_id = ?',
                [cardUuid, collectionId]
            );
        } catch (error) {
            console.error('Error removing card from collection:', error);
            throw error;
        }
    }

    async clearSetListCache(): Promise<void> {
        this.setListCache = null;
        this.setListLastUpdate = 0;
    }

    public async testLogging(): Promise<void> {
        console.log('[DatabaseService] Test logging method called');
        console.warn('[DatabaseService] Test warning');
        console.error('[DatabaseService] Test error');
    }

    async verifyDatabaseState(): Promise<boolean> {
        try {
            if (!this.db) {
                console.log('[DatabaseService] Database not initialized');
                return false;
            }

            // Check if we can query the database
            const [result] = await this.db.executeSql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            );

            console.log('[DatabaseService] Found tables:', result.rows.length);
            return result.rows.length > 0;
        } catch (error) {
            console.error('[DatabaseService] Error verifying database state:', error);
            return false;
        }
    }

    async isCardInSetCollection(cardUuid: string, setCode: string): Promise<{isInCollection: boolean, setName: string}> {
        if (!this.db) {
            await this.initDatabase();
        }

        try {
            console.log(`[DatabaseService] Checking if card ${cardUuid} is in set collection ${setCode}`);

            // First, try to find the collection using the set code directly
            let collectionId: string | null = null;
            let actualSetName = setCode;

            // Try to find collection by set code in the name
            const [codeResult] = await this.db!.executeSql(
                "SELECT id, name FROM collections WHERE name LIKE ?",
                [`%${setCode}%`]
            );

            console.log(`[DatabaseService] Collection search for set code ${setCode} found ${codeResult.rows.length} results`);

            if (codeResult.rows.length > 0) {
                collectionId = codeResult.rows.item(0).id;
                actualSetName = codeResult.rows.item(0).name.replace('Set: ', '');
                console.log(`[DatabaseService] Found collection ID by set code: ${collectionId}, name: ${actualSetName}`);
            }

            // If we couldn't find the collection, the card can't be in it
            if (!collectionId) {
                console.log(`[DatabaseService] No collection found for set ${setCode}, assuming card is new`);
                return {isInCollection: false, setName: actualSetName};
            }

            // Check if the card exists in the collection
            console.log(`[DatabaseService] Checking if card ${cardUuid} exists in collection ${collectionId}`);
            const [cardResult] = await this.db!.executeSql(
                "SELECT quantity FROM collection_cards WHERE collection_id = ? AND card_uuid = ?",
                [collectionId, cardUuid]
            );

            console.log(`[DatabaseService] Card check query returned ${cardResult.rows.length} rows`);
            if (cardResult.rows.length > 0) {
                console.log(`[DatabaseService] Card quantity: ${cardResult.rows.item(0).quantity}`);
            }

            // Determine if the card is in the collection based on row count and quantity
            const isInCollection = cardResult.rows.length > 0 && cardResult.rows.item(0).quantity > 0;
            console.log(`[DatabaseService] Card ${cardUuid} in collection ${collectionId} result: ${isInCollection}`);

            return {isInCollection, setName: actualSetName};
        } catch (error) {
            console.error(`[DatabaseService] Error checking if card is in set collection: ${error}`);
            return {isInCollection: false, setName: setCode};
        }
    }
}

export const getDB = async () => {
    try {
        if (appDb) return appDb;
        console.log('[DatabaseService] Initializing database...');

        const dbName = 'lorcana.db';
        console.log('[DatabaseService] Database name:', dbName);

        try {
            appDb = await openDatabase({
                name: dbName,
                location: 'default',
                createFromLocation: 2
            });

            await appDb.executeSql('PRAGMA foreign_keys = ON;');
            await appDb.executeSql('PRAGMA journal_mode = WAL;');

            return appDb;
        } catch (error) {
            console.error('[DatabaseService] Initial database open failed, attempting recovery:', error);
            return await recoverMainDatabase();
        }
    } catch (error) {
        console.error('[DatabaseService] Database initialization failed completely:', error);
        throw error;
    }
};

export const getLorcanaDB = async () => {
    try {
        console.log('[DatabaseService] Getting Lorcana database...');
        const db = await DatabaseInitializer.getDatabase('lorcana');
        console.log('[DatabaseService] Lorcana database obtained');
        return db;
    } catch (error) {
        console.error('[DatabaseService] Failed to get Lorcana database:', error);
        throw error;
    }
};

export const databaseService = new DatabaseService();
