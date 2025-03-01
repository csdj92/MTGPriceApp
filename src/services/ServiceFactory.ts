import { DatabaseManager } from './database/DatabaseManager';
import { PriceService } from './price/PriceService';

/**
 * ServiceFactory manages instances of all services and provides a centralized access point.
 * This follows the Factory pattern to ensure proper initialization order and dependency injection.
 */
export class ServiceFactory {
    private static databaseManager: DatabaseManager | null = null;
    private static priceService: PriceService | null = null;
    // Add other services as they are implemented
    
    private static initialized = false;
    private static initializing = false;

    /**
     * Initialize all services in the correct order
     */
    static async initialize(): Promise<void> {
        if (this.initialized) return;
        if (this.initializing) {
            console.warn('[ServiceFactory] Already initializing, please wait...');
            return;
        }
        
        this.initializing = true;
        
        try {
            console.log('[ServiceFactory] Initializing services...');
            
            // Initialize the database manager first
            this.databaseManager = new DatabaseManager();
            await this.databaseManager.initialize();
            
            // Initialize other services
            this.priceService = new PriceService(this.databaseManager);
            await this.priceService.initialize();
            
            // Add initialization of other services here
            
            this.initialized = true;
            this.initializing = false;
            console.log('[ServiceFactory] Services initialized successfully');
        } catch (error) {
            this.initializing = false;
            console.error('[ServiceFactory] Error initializing services:', error);
            throw error;
        }
    }

    /**
     * Check if services are initialized
     */
    static isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get the database manager
     */
    static getDatabaseManager(): DatabaseManager {
        this.checkInitialized();
        return this.databaseManager!;
    }

    /**
     * Get the price service
     */
    static getPriceService(): PriceService {
        this.checkInitialized();
        return this.priceService!;
    }

    /**
     * Check if services are initialized
     */
    private static checkInitialized(): void {
        if (!this.initialized) {
            throw new Error('Services not initialized. Call ServiceFactory.initialize() first.');
        }
    }

    /**
     * Clean up all services
     */
    static async cleanup(): Promise<void> {
        if (!this.initialized) return;
        
        try {
            console.log('[ServiceFactory] Cleaning up services...');
            
            // Close the database connection
            if (this.databaseManager) {
                await this.databaseManager.closeDatabase();
            }
            
            // Reset all service instances
            this.databaseManager = null;
            this.priceService = null;
            
            this.initialized = false;
            console.log('[ServiceFactory] Services cleaned up successfully');
        } catch (error) {
            console.error('[ServiceFactory] Error cleaning up services:', error);
            throw error;
        }
    }
} 