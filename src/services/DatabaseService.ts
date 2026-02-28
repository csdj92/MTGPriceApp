import SQLite from 'react-native-sqlite-storage';
import DatabaseInitializer from './DatabaseInitializer';

SQLite.enablePromise(true);
SQLite.DEBUG(false);

const log = (...args: unknown[]) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(...args);
    }
};

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

export interface DatabaseDiagnostics {
    isHealthy: boolean;
    integrityCheck: string;
    missingTables: string[];
    availableTables: string[];
}

export default class DatabaseService {
    private db: SQLite.SQLiteDatabase | null = null;
    private initPromise: Promise<void> | null = null;
    private isInitialized = false;

    async initDatabase(): Promise<void> {
        if (this.isInitialized && this.db) return;
        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.initPromise = (async () => {
            try {
                log('[DatabaseService] Initializing database...');
                await DatabaseInitializer.initializeAllDatabases();
                this.db = await DatabaseInitializer.getDatabase('lorcana');

                // Enable foreign keys and verify schema
                await this.db.executeSql('PRAGMA foreign_keys = ON;');
                await this.verifyDatabaseStructure();

                log('[DatabaseService] Database initialized successfully');
                this.isInitialized = true;
            } catch (error) {
                console.error('[DatabaseService] Initialization error:', error);
                this.db = null;
                this.isInitialized = false;
                throw error;
            }
        })();

        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    }

    private async verifyDatabaseStructure(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

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

        await this.db.executeSql(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);

        log('[DatabaseService] Database structure verified');
    }

    async verifyDatabaseState(): Promise<DatabaseDiagnostics> {
        await this.initDatabase();

        const expectedTables = ['collections', 'collection_cards', 'app_settings'];

        const [integrityResult] = await this.db!.executeSql('PRAGMA integrity_check;');
        const integrityCheck = String(integrityResult.rows.item(0)?.integrity_check ?? 'unknown');

        const [tablesResult] = await this.db!.executeSql(
            `SELECT name FROM sqlite_master
             WHERE type = 'table' AND name IN (?, ?, ?)`,
            expectedTables
        );

        const availableTables: string[] = [];
        for (let i = 0; i < tablesResult.rows.length; i++) {
            availableTables.push(String(tablesResult.rows.item(i).name));
        }

        const missingTables = expectedTables.filter(tableName => !availableTables.includes(tableName));
        const isHealthy = integrityCheck.toLowerCase() === 'ok' && missingTables.length === 0;

        return {
            isHealthy,
            integrityCheck,
            missingTables,
            availableTables,
        };
    }

    async createCollection(name: string, description?: string): Promise<Collection> {
        await this.initDatabase();

        const id = `collection_${Date.now()}`;
        const now = new Date().toISOString();

        await this.db!.executeSql(
            'INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [id, name, description || null, now, now]
        );

        return {
            id,
            name,
            description: description || null,
            createdAt: now,
            updatedAt: now,
            totalValue: 0,
            cardCount: 0,
        };
    }

    async getCollections(): Promise<Collection[]> {
        await this.initDatabase();

        const [result] = await this.db!.executeSql(
            `SELECT
                c.id,
                c.name,
                c.description,
                c.created_at as createdAt,
                c.updated_at as updatedAt,
                COALESCE(SUM(cc.quantity), 0) as cardCount,
                c.total_value as totalValue
            FROM collections c
            LEFT JOIN collection_cards cc ON c.id = cc.collection_id
            GROUP BY c.id
            ORDER BY c.created_at DESC`
        );

        return result.rows.raw() as Collection[];
    }

    async getSetCollections(): Promise<(Collection & SetCollectionStats)[]> {
        await this.initDatabase();

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

        return (result.rows.raw() as Collection[]).map(collection => ({
            ...collection,
            totalCards: 0,
            collectedCards: (collection as any).cardCount || 0,
            completionPercentage: 0,
        }));
    }

    async deleteCollection(collectionId: string): Promise<void> {
        await this.initDatabase();
        await this.db!.executeSql('DELETE FROM collections WHERE id = ?', [collectionId]);
    }

    async removeCardFromCollection(cardUuid: string, collectionId: string): Promise<void> {
        await this.initDatabase();
        await this.db!.executeSql(
            'DELETE FROM collection_cards WHERE card_uuid = ? AND collection_id = ?',
            [cardUuid, collectionId]
        );
    }

    async closeDatabase(): Promise<void> {
        await DatabaseInitializer.closeAllDatabases();
        this.db = null;
        this.isInitialized = false;
        this.initPromise = null;
    }
}

export const databaseService = new DatabaseService();
