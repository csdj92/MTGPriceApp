import SQLite from 'react-native-sqlite-storage';
import { AddSetNumberToLorcanaCollections } from './002_AddSetNumberToLorcanaCollections';

// Define the migration interface
export interface Migration {
    version: number;
    up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

// Migration manager class
export class MigrationManager {
    private migrations: Migration[] = [];
    
    constructor(private db: SQLite.SQLiteDatabase) {}

    registerMigration(migration: Migration) {
        this.migrations.push(migration);
        // Sort migrations by version to ensure they run in order
        this.migrations.sort((a, b) => a.version - b.version);
    }

    async getCurrentVersion(): Promise<number> {
        try {
            const [result] = await this.db.executeSql('PRAGMA user_version;');
            return result.rows.item(0).user_version;
        } catch (error) {
            console.error('[MigrationManager] Error getting current version:', error);
            return 0;
        }
    }

    async setVersion(version: number): Promise<void> {
        await this.db.executeSql(`PRAGMA user_version = ${version};`);
    }

    async migrateToLatest(): Promise<void> {
        const currentVersion = await this.getCurrentVersion();
        const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

        if (pendingMigrations.length === 0) {
            console.log('[MigrationManager] Database is up to date');
            return;
        }

        console.log(`[MigrationManager] Running ${pendingMigrations.length} migrations`);

        for (const migration of pendingMigrations) {
            try {
                console.log(`[MigrationManager] Running migration to version ${migration.version}`);
                await this.db.transaction(async (tx) => {
                    await migration.up(this.db);
                    await this.setVersion(migration.version);
                });
                console.log(`[MigrationManager] Successfully migrated to version ${migration.version}`);
            } catch (error) {
                console.error(`[MigrationManager] Migration to version ${migration.version} failed:`, error);
                throw error;
            }
        }
    }
} 