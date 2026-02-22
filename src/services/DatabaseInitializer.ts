import SQLite from 'react-native-sqlite-storage';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { Logger } from '../utils/logger';

// Enable SQLite debugging in development
SQLite.DEBUG(true);
SQLite.enablePromise(true);

export interface DatabaseConfig {
  name: string;
  location?: string;
  createFromLocation?: number;
}

class DatabaseInitializer {
  private static initialized = false;
  private static databases: {
    [key: string]: {
      db: SQLite.SQLiteDatabase | null;
      lastAccess: number;
    };
  } = {};


  // Configuration for each database
  private static configs = {
    mtg: {
      name: 'mtg.db',
      location: 'default',
    },
    mtgjson: {
      name: '/data/data/com.mtgpriceapp/files/mtgjson.db',
      location: 'absolute',
    },
    lorcana: {
      name: 'lorcana.db',
      location: 'default',
    },
  };

  constructor() {
    // This constructor intentionally left empty
  }

  /**
   * Initialize all databases on app start
   */
  public static async initializeAllDatabases(): Promise<void> {
    if (this.initialized) {
      Logger.info('[DatabaseInitializer] Databases already initialized');
      return;
    }

    try {
      Logger.info('[DatabaseInitializer] Starting database initialization');
      
      // Initialize each database
      await this.initializeMTGDatabase();
      await this.initializeMTGJsonDatabase();
      await this.initializeLorcanaDatabase();
      
      this.initialized = true;
      Logger.info('[DatabaseInitializer] All databases initialized successfully');
    } catch (error) {
      Logger.error('[DatabaseInitializer] Failed to initialize databases', error);
      throw error;
    }
  }

  /**
   * Get a database connection
   */
  public static async getDatabase(dbType: 'mtg' | 'mtgjson' | 'lorcana'): Promise<SQLite.SQLiteDatabase> {
    try {
      // Check if database exists in cache and return it
      if (this.databases[dbType]?.db) {
        this.databases[dbType].lastAccess = Date.now();
        return this.databases[dbType].db;
      }

      // Open the database
      const config = this.configs[dbType];
      const db = await SQLite.openDatabase(config);
      
      // Cache the database connection
      this.databases[dbType] = {
        db,
        lastAccess: Date.now(),
      };

      return db;
    } catch (error) {
      Logger.error(`[DatabaseInitializer] Error getting ${dbType} database`, error);
      throw error;
    }
  }

  /**
   * Check if database file exists
   */
  private static async databaseFileExists(dbName: string): Promise<boolean> {
    try {
      const dbPath = this.getDatabasePath(dbName);
      return await RNFS.exists(dbPath);
    } catch (error) {
      Logger.error(`[DatabaseInitializer] Error checking if database exists: ${dbName}`, error);
      return false;
    }
  }

  /**
   * Get the database file path
   */
  private static getDatabasePath(dbName: string): string {
    // Special handling for mtgjson database
    if (dbName === 'mtgjson.db') {
      return '/data/data/com.mtgpriceapp/files/mtgjson.db';
    }
    
    // Regular handling for other databases
    if (Platform.OS === 'ios') {
      return `${RNFS.DocumentDirectoryPath}/${dbName}`;
    } else {
      return `${RNFS.ExternalDirectoryPath}/${dbName}`;
    }
  }

  /**
   * Initialize MTG main database
   */
  private static async initializeMTGDatabase(): Promise<void> {
    try {
      Logger.info('[DatabaseInitializer] Initializing MTG database');
      const db = await this.getDatabase('mtg');
      
      // Enable foreign keys
      await db.executeSql('PRAGMA foreign_keys = ON;');
      
      // Create all tables for MTG database
      await this.createMTGTables(db);
      Logger.info('[DatabaseInitializer] MTG database initialized');
    } catch (error) {
      Logger.error('[DatabaseInitializer] Error initializing MTG database', error);
      throw error;
    }
  }

  /**
   * Initialize MTGJson database
   */
  private static async initializeMTGJsonDatabase(): Promise<void> {
    try {
      // MTGJson support was removed in the Lorcana-focused app.
      // Keep this method as a no-op to preserve startup flow compatibility.
      Logger.info('[DatabaseInitializer] Skipping MTGJson initialization (deprecated)');
    } catch (error) {
      Logger.error('[DatabaseInitializer] Error initializing MTGJson database', error);
      throw error;
    }
  }

  /**
   * Initialize Lorcana database
   */
  private static async initializeLorcanaDatabase(): Promise<void> {
    try {
      Logger.info('[DatabaseInitializer] Initializing Lorcana database');
      const db = await this.getDatabase('lorcana');
      
      // Enable foreign keys
      await db.executeSql('PRAGMA foreign_keys = ON;');
      
      // Create all tables for Lorcana database
      await this.createLorcanaTables(db);
      Logger.info('[DatabaseInitializer] Lorcana database initialized');
    } catch (error) {
      Logger.error('[DatabaseInitializer] Error initializing Lorcana database', error);
      throw error;
    }
  }

  /**
   * Create all tables for MTG database
   */
  private static async createMTGTables(db: SQLite.SQLiteDatabase): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Collections table
        await tx.executeSql(`
          CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            total_value REAL DEFAULT 0,
            card_count INTEGER DEFAULT 0
          );
        `);

        // Cached cards table
        await tx.executeSql(`
          CREATE TABLE IF NOT EXISTS cached_cards (
            uuid TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            set_code TEXT,
            rarity TEXT,
            mana_cost TEXT,
            type TEXT,
            text TEXT,
            image_url TEXT,
            price REAL,
            cached_at TEXT NOT NULL
          );
        `);

        // Collection cards table
        await tx.executeSql(`
          CREATE TABLE IF NOT EXISTS collection_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_id TEXT NOT NULL,
            card_uuid TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            added_at TEXT NOT NULL,
            missing INTEGER DEFAULT 0,
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
          );
        `);

        // Scan history table
        await tx.executeSql(`
          CREATE TABLE IF NOT EXISTS scan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_uuid TEXT NOT NULL,
            scanned_at TEXT NOT NULL,
            added_to_collection INTEGER DEFAULT 0,
            collection_id TEXT
          );
        `);

        // Card hash table
        await tx.executeSql(`
          CREATE TABLE IF NOT EXISTS card_hashes (
            uuid TEXT NOT NULL,
            hash TEXT NOT NULL PRIMARY KEY
          );
        `);

        // Create price tables
        await this.createPriceTables(tx);

        // Create deck tables
        await tx.executeSql(`
          CREATE TABLE IF NOT EXISTS decks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);

        await tx.executeSql(`
          CREATE TABLE IF NOT EXISTS deck_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id INTEGER NOT NULL,
            card_uuid TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
          );
        `);

        // Create indices for better performance
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_collection_cards_collection_id ON collection_cards(collection_id);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_collection_cards_card_uuid ON collection_cards(card_uuid);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_cached_cards_name ON cached_cards(name);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_cached_cards_set_code ON cached_cards(set_code);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_scan_history_card_uuid ON scan_history(card_uuid);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_card_hashes_uuid ON card_hashes(uuid);');
      });

      Logger.info('[DatabaseInitializer] MTG tables created successfully');
    } catch (error) {
      Logger.error('[DatabaseInitializer] Error creating MTG tables', error);
      throw error;
    }
  }

  /**
   * Create price tables
   */
  public static async createPriceTables(tx: SQLite.Transaction): Promise<void> {
    // Current prices table
    await tx.executeSql(`
      CREATE TABLE IF NOT EXISTS current_prices (
        uuid TEXT PRIMARY KEY NOT NULL,
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
        last_updated INTEGER NOT NULL
      );
    `);

    // Price history table
    await tx.executeSql(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
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
        cardhoarder_foil_price REAL DEFAULT 0
      );
    `);

    // Last price update timestamp table
    await tx.executeSql(`
      CREATE TABLE IF NOT EXISTS price_update_timestamp (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_update INTEGER NOT NULL
      );
    `);

    // Create indices for price tables
    await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_price_history_uuid ON price_history(uuid);');
    await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp);');
  }

  /**
   * Create all tables for Lorcana database
   */
  private static async createLorcanaTables(db: SQLite.SQLiteDatabase): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Lorcana cards table
        await tx.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          Artist TEXT, Body_Text TEXT, Card_Num INTEGER, Classifications TEXT,
          Color TEXT, Cost INTEGER, Date_Added TEXT, Date_Modified TEXT,
          Flavor_Text TEXT, Franchise TEXT, Image TEXT, Inkable INTEGER,
          Lore INTEGER, Name TEXT, Rarity TEXT, Set_ID TEXT, Set_Name TEXT,
          Set_Num INTEGER, Strength INTEGER, Type TEXT, Unique_ID TEXT UNIQUE,
          Willpower INTEGER, price_usd TEXT, price_usd_foil TEXT,
          last_updated TEXT, collected INTEGER DEFAULT 0
        );`);

        // Lorcana collections table
        await tx.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_collections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          total_value REAL DEFAULT 0,
          card_count INTEGER DEFAULT 0
        );`);

        // Lorcana collection cards table
        await tx.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_collection_cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          collection_id TEXT NOT NULL,
          card_id TEXT NOT NULL,
          quantity INTEGER DEFAULT 1,
          added_at TEXT NOT NULL,
          FOREIGN KEY (collection_id) REFERENCES lorcana_collections(id) ON DELETE CASCADE
        );`);

        // Lorcana card prices table
        await tx.executeSql(`CREATE TABLE IF NOT EXISTS lorcana_card_prices (
          card_id TEXT PRIMARY KEY NOT NULL,
          usd REAL,
          usd_foil REAL,
          tcgplayer_id INTEGER,
          last_updated TEXT NOT NULL,
          FOREIGN KEY (card_id) REFERENCES lorcana_cards(Unique_ID) ON DELETE CASCADE
        );`);

        // Create indices for better performance
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_name ON lorcana_cards(Name);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_unique_id ON lorcana_cards(Unique_ID);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_collection_cards_collection_id ON lorcana_collection_cards(collection_id);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_collection_cards_card_id ON lorcana_collection_cards(card_id);');
        await tx.executeSql('CREATE INDEX IF NOT EXISTS idx_lorcana_card_prices_card_id ON lorcana_card_prices(card_id);');
      });

      Logger.info('[DatabaseInitializer] Lorcana tables created successfully');
    } catch (error) {
      Logger.error('[DatabaseInitializer] Error creating Lorcana tables', error);
      throw error;
    }
  }

  /**
   * Close all database connections
   */
  public static async closeAllDatabases(): Promise<void> {
    try {
      for (const dbType in this.databases) {
        const db = this.databases[dbType]?.db;
        if (db) {
          await db.close();
          Logger.info(`[DatabaseInitializer] ${dbType} database closed`);
        }
      }
      
      this.databases = {};
      this.initialized = false;
    } catch (error) {
      Logger.error('[DatabaseInitializer] Error closing databases', error);
      throw error;
    }
  }
}

export default DatabaseInitializer; 
