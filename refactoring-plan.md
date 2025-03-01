# Database Services Refactoring Plan

## Current Issues
- The `DatabaseService` class is too large (~3000 lines)
- Handles multiple responsibilities: 
  - Main application database
  - MTGJson database
  - Card data
  - Collections
  - Prices
  - Sets
  - Decks
  - Scan history
  - Caching
- Difficult to maintain and extend
- Violates Single Responsibility Principle

## Proposed Architecture

### 1. Core Database Module

#### `DatabaseManager` class
```typescript
// src/services/database/DatabaseManager.ts
export class DatabaseManager {
    private appDb: SQLite.SQLiteDatabase | null = null;
    private mtgJsonDb: SQLite.SQLiteDatabase | null = null;
    
    // Core database initialization
    async initialize(): Promise<void> { /* ... */ }
    
    // Safe database operations
    async safeExecuteSQL<T>(db: SQLite.SQLiteDatabase | null, sql: string, params: any[]): Promise<T> { /* ... */ }
    
    // Database access methods
    getAppDatabase(): SQLite.SQLiteDatabase | null { /* ... */ }
    getMTGJsonDatabase(): SQLite.SQLiteDatabase | null { /* ... */ }
    
    // MTGJson specific operations
    async downloadMTGJsonDatabase(): Promise<boolean> { /* ... */ }
    async ensureMTGJsonDatabaseExists(): Promise<void> { /* ... */ }
    
    // Cleanup
    async closeDatabase(): Promise<void> { /* ... */ }
}
```

### 2. Domain-Specific Services

#### `CardService` class
```typescript
// src/services/card/CardService.ts
export class CardService {
    constructor(private dbManager: DatabaseManager) {}
    
    async getCardByUUID(uuid: string): Promise<ExtendedCard | null> { /* ... */ }
    async getCardDetailsByUuid(uuid: string): Promise<any> { /* ... */ }
    async getCardVariants(cardName: string): Promise<ExtendedCard[]> { /* ... */ }
    async getCardByHash(hash: string): Promise<string | null> { /* ... */ }
    async insertCardHash(uuid: string, hash: string): Promise<void> { /* ... */ }
}
```

#### `PriceService` class
```typescript
// src/services/price/PriceService.ts
export class PriceService {
    constructor(private dbManager: DatabaseManager) {}
    
    async createPriceTables(): Promise<void> { /* ... */ }
    async updatePrices(priceData: Record<string, PriceData>): Promise<void> { /* ... */ }
    async getCardPriceHistory(uuid: string): Promise<PriceHistoryEntry[]> { /* ... */ }
    async getCardPriceHistoryStats(uuid: string): Promise<PriceHistoryStats> { /* ... */ }
    async shouldUpdatePrices(force: boolean = false): Promise<boolean> { /* ... */ }
    async getLastPriceUpdate(): Promise<number | null> { /* ... */ }
    async verifyPriceDataIntegrity(): Promise<PriceIntegrityResult> { /* ... */ }
}
```

#### `CollectionService` class
```typescript
// src/services/collection/CollectionService.ts
export class CollectionService {
    constructor(private dbManager: DatabaseManager, private cardService: CardService) {}
    
    async createCollection(name: string, description?: string): Promise<Collection> { /* ... */ }
    async getCollections(): Promise<Collection[]> { /* ... */ }
    async getCollectionCards(collectionId: string, page?: number, pageSize?: number): Promise<ExtendedCard[]> { /* ... */ }
    async addCardToCollection(cardUuid: string, collectionId: string): Promise<void> { /* ... */ }
    async removeCardFromCollection(cardUuid: string, collectionId: string): Promise<void> { /* ... */ }
    async deleteCollection(collectionId: string): Promise<void> { /* ... */ }
}
```

#### `SetService` class
```typescript
// src/services/set/SetService.ts
export class SetService {
    constructor(private dbManager: DatabaseManager) {}
    
    async getSetList(): Promise<SetInfo[]> { /* ... */ }
    async getAllCardsBySet(setCode: string, pageSize: number, offset: number): Promise<any[]> { /* ... */ }
    async getSetCollections(): Promise<(Collection & SetCollectionStats)[]> { /* ... */ }
    async getSetMissingCards(setCode: string): Promise<ExtendedCard[]> { /* ... */ }
    async clearSetListCache(): Promise<void> { /* ... */ }
}
```

#### `DeckService` class
```typescript
// src/services/deck/DeckService.ts
export class DeckService {
    constructor(private dbManager: DatabaseManager) {}
    
    async createDecksTable(): Promise<void> { /* ... */ }
    async getDecks(): Promise<Deck[]> { /* ... */ }
    async createDeck(name: string): Promise<number> { /* ... */ }
    async getDeckCards(deckId: number): Promise<ExtendedCard[]> { /* ... */ }
    async addCardToDeck(deckId: number, cardUUID: string): Promise<void> { /* ... */ }
}
```

#### `ScanHistoryService` class
```typescript
// src/services/scan/ScanHistoryService.ts
export class ScanHistoryService {
    constructor(private dbManager: DatabaseManager) {}
    
    async addToScanHistory(card: ExtendedCard): Promise<void> { /* ... */ }
    async getScanHistory(): Promise<ExtendedCard[]> { /* ... */ }
    async clearScanHistory(): Promise<void> { /* ... */ }
    async markScannedCardAddedToCollection(cardId: string, collectionId: string): Promise<void> { /* ... */ }
}
```

### 3. Service Factory

```typescript
// src/services/ServiceFactory.ts
export class ServiceFactory {
    private static databaseManager: DatabaseManager | null = null;
    private static cardService: CardService | null = null;
    private static priceService: PriceService | null = null;
    // ... other services
    
    static async initialize(): Promise<void> {
        this.databaseManager = new DatabaseManager();
        await this.databaseManager.initialize();
        
        this.cardService = new CardService(this.databaseManager);
        this.priceService = new PriceService(this.databaseManager);
        // Initialize other services
    }
    
    static getCardService(): CardService {
        if (!this.cardService) throw new Error('Services not initialized');
        return this.cardService;
    }
    
    static getPriceService(): PriceService {
        if (!this.priceService) throw new Error('Services not initialized');
        return this.priceService;
    }
    
    // Getters for other services
}
```

## Implementation Steps

1. **Create the basic structure**
   - Create the folder structure for the new services
   - Implement the DatabaseManager class first

2. **Migrate services one by one**
   - Start with simpler services like CardService or ScanHistoryService
   - Move methods from DatabaseService to the new service classes
   - Update and test each service individually

3. **Update consumers**
   - Update import statements in all files that use DatabaseService
   - Use the ServiceFactory to access the appropriate services

4. **Clean up and testing**
   - Remove the old DatabaseService class
   - Comprehensive testing of all functionality
   - Performance testing to ensure no regressions

## Benefits

- Better code organization
- Improved maintainability
- Easier to extend with new features
- Better testability of individual components
- Reduced risk when making changes
- Clear separation of concerns 