/**
 * Lightweight compatibility layer for older call sites.
 * The Lorcana app currently initializes services through AppStartup.
 */
export class ServiceFactory {
    private static initialized = false;
    private static initializing = false;

    static async initialize(): Promise<void> {
        if (this.initialized || this.initializing) {
            return;
        }
        this.initializing = true;
        this.initialized = true;
        this.initializing = false;
    }

    static isInitialized(): boolean {
        return this.initialized;
    }

    static getDatabaseManager(): never {
        throw new Error('DatabaseManager is deprecated. Use DatabaseService/AppStartup.');
    }

    static getPriceService(): never {
        throw new Error('PriceService is deprecated. Use LorcanaService.');
    }

    static async cleanup(): Promise<void> {
        this.initialized = false;
        this.initializing = false;
    }
}
