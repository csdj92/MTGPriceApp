import RNFS from 'react-native-fs';
import SQLite from 'react-native-sqlite-storage';

// Enable SQLite debugging in development
SQLite.DEBUG(true);
SQLite.enablePromise(true);

// Global MTGJson database reference for safety
let mtgJsonDb: SQLite.SQLiteDatabase | null = null;

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
        }
        return mtgJsonDb;
    }

    /**
     * Ensure the MTGJson database exists or create it
     */
    async ensureMTGJsonDatabaseExists(): Promise<void> {
        const mtgJsonPath = '/data/data/com.mtgpriceapp/databases/AllPrintings.sqlite';
        
        try {
            // Check if the file exists
            const exists = await RNFS.exists(mtgJsonPath);
            console.log('[DatabaseManager] MTGJson database exists:', exists);

            if (!exists) {
                console.log('[DatabaseManager] MTGJson database does not exist, downloading...');
                const success = await this.downloadMTGJsonDatabase();
                if (!success) {
                    throw new Error('Failed to download MTGJson database');
                }
            }

            // If we already have a connection, return
            if (mtgJsonDb) {
                return;
            }

            // Open the database
            console.log('[DatabaseManager] Opening MTGJson database...');
            mtgJsonDb = await SQLite.openDatabase({
                name: mtgJsonPath,
                createFromLocation: mtgJsonPath,
                location: 'default'
            });

            console.log('[DatabaseManager] MTGJson database opened successfully');
        } catch (error) {
            console.error('[DatabaseManager] Error ensuring MTGJson database exists:', error);
            throw error;
        }
    }

    /**
     * Download the MTGJson database
     */
    async downloadMTGJsonDatabase(): Promise<boolean> {
        const mtgJsonUrl = 'https://mtgjson.com/api/v5/AllPrintings.sqlite';
        const mtgJsonPath = `${RNFS.DocumentDirectoryPath}/AllPrintings.sqlite`;

        try {
            console.log('[DatabaseManager] Downloading MTGJson database...');
            const result = await RNFS.downloadFile({
                fromUrl: mtgJsonUrl,
                toFile: mtgJsonPath,
                background: true,
                discretionary: true,
                progressDivider: 10
            }).promise;

            if (result.statusCode === 200) {
                console.log('[DatabaseManager] MTGJson database downloaded successfully');
                return true;
            } else {
                console.error('[DatabaseManager] Failed to download MTGJson database. Status code:', result.statusCode);
                return false;
            }
        } catch (error) {
            console.error('[DatabaseManager] Error downloading MTGJson database:', error);
            return false;
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
            
            if (mtgJsonDb) {
                await mtgJsonDb.close();
                mtgJsonDb = null;
            }
            
            this.initialized = false;
            console.log('[DatabaseManager] Databases closed successfully');
        } catch (error) {
            console.error('[DatabaseManager] Error closing databases:', error);
            throw error;
        }
    }
} 