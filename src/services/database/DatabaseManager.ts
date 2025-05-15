import RNFS from 'react-native-fs';
import SQLite from 'react-native-sqlite-storage';
import { AllPrintingsJsonDatabase } from './AllPrintingsJsonDatabase'; // Import the singleton

// Enable SQLite debugging in development
SQLite.DEBUG(true);
SQLite.enablePromise(true);

// Global MTGJson database reference for safety
// let mtgJsonDb: SQLite.SQLiteDatabase | null = null;

export class DatabaseManager {
    private appDb: SQLite.SQLiteDatabase | null = null;
    private migrationManager: any | null = null; // Replace with actual type if available
    private initialized = false;

    constructor() {}

    /**
     * Initialize both databases
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            console.log('[DatabaseManager] Initializing databases...');
            
            // Initialize main app database
            this.appDb = await this.openAppDatabase();
            
            // Create necessary tables in main database
            await this.createCoreTables();
            
            // Initialize MTGJson database
            await this.ensureMTGJsonDatabaseExists();
            
            this.initialized = true;
            console.log('[DatabaseManager] Databases initialized successfully');
        } catch (error) {
            console.error('[DatabaseManager] Error initializing databases:', error);
            throw error;
        }
    }

    /**
     * Open the main application database
     */
    private async openAppDatabase(): Promise<SQLite.SQLiteDatabase> {
        try {
            return await SQLite.openDatabase({
                name: 'mtgprice.db',
                location: 'default'
            });
        } catch (error) {
            console.error('[DatabaseManager] Error opening app database:', error);
            throw error;
        }
    }

    /**
     * Get the main application database
     */
    getAppDatabase(): SQLite.SQLiteDatabase | null {
        if (!this.initialized) {
            console.warn('[DatabaseManager] Database not initialized. Call initialize() first.');
        }
        return this.appDb;
    }

    /**
     * Get the MTGJson database
     */
    getMTGJsonDatabase(): SQLite.SQLiteDatabase | null {
        if (!this.initialized) {
            console.warn('[DatabaseManager] Database not initialized. Call initialize() first.');
            return null; // Added explicit return null
        }
        // return mtgJsonDb; // REMOVE THIS
        return AllPrintingsJsonDatabase.getInstance().getDatabase(); // Use singleton
    }

    /**
     * Ensure the MTGJson database exists or create it
     */
    async ensureMTGJsonDatabaseExists(): Promise<void> {
        // const mtgJsonPath = '/data/data/com.mtgpriceapp/files/mtgjson.db'; // Handled by AllPrintingsJsonDatabase
        try {
            console.log('[DatabaseManager] Ensuring MTGJson database is initialized via AllPrintingsJsonDatabase singleton...');
            await AllPrintingsJsonDatabase.getInstance().initialize();
            console.log('[DatabaseManager] MTGJson database initialization handled by AllPrintingsJsonDatabase.');

            // Old logic to be removed:
            // // Check if the file exists
            // const exists = await RNFS.exists(mtgJsonPath);
            // console.log('[DatabaseManager] MTGJson database exists:', exists);

            // if (!exists) {
            //     console.log('[DatabaseManager] MTGJson database does not exist, downloading...');
            //     const success = await this.downloadMTGJsonDatabase(); // This method will be removed
            //     if (!success) {
            //         throw new Error('Failed to download MTGJson database');
            //     }
            // }

            // // If we already have a connection, return
            // if (mtgJsonDb) { // This variable will be removed
            //     return;
            // }

            // // Open the database
            // console.log('[DatabaseManager] Opening MTGJson database...');
            // mtgJsonDb = await SQLite.openDatabase({ // This variable will be removed
            //     name: mtgJsonPath,
            //     createFromLocation: mtgJsonPath, // This is problematic, AllPrintings handles it better
            //     location: 'default'
            // });

            // console.log('[DatabaseManager] MTGJson database opened successfully');
        } catch (error) {
            console.error('[DatabaseManager] Error ensuring MTGJson database exists (via AllPrintingsJsonDatabase):', error);
            throw error;
        }
    }

    /**
     * Execute SQL safely with error handling
     */
    async safeExecuteSQL<T>(
        db: SQLite.SQLiteDatabase | null, 
        sqlStatement: string, 
        params: any[] = [],
        errorHandler?: (error: Error) => Promise<T | null>
    ): Promise<T> {
        if (!db) {
            throw new Error('Database connection not available');
        }

        try {
            return await db.executeSql(sqlStatement, params) as unknown as T;
        } catch (error) {
            if (errorHandler) {
                const result = await errorHandler(error as Error);
                if (result !== null) {
                    return result;
                }
            }
            throw error;
        }
    }

    /**
     * Create core tables required by the application
     */
    private async createCoreTables(): Promise<void> {
        if (!this.appDb) {
            throw new Error('App database not initialized');
        }

        // Create core tables here...
        // This would include collections, decks, scan_history, etc.
        // Specific domain tables will be created by their respective services
    }

    /**
     * Close all database connections
     */
    async closeDatabase(): Promise<void> {
        try {
            if (this.appDb) {
                await this.appDb.close();
                this.appDb = null;
            }
            
            // No longer managing mtgJsonDb directly here
            // if (mtgJsonDb) { 
            //     await mtgJsonDb.close();
            //     mtgJsonDb = null;
            // }
            
            // AllPrintingsJsonDatabase manages its own lifecycle, including closing if necessary,
            // but typically a singleton's DB connection would persist for app lifetime or be explicitly closed by a global shutdown.
            // For now, we won't explicitly close it here to avoid unintended side effects if other parts still expect it open.

            this.initialized = false;
            console.log('[DatabaseManager] AppDatabase closed. MTGJsonDatabase managed by its singleton.');
        } catch (error) {
            console.error('[DatabaseManager] Error closing databases:', error);
            throw error;
        }
    }
} 