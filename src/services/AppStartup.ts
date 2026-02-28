import DatabaseInitializer from './DatabaseInitializer';
import Logger from './Logger';
import {
  initializeLorcanaDatabase,
  LorcanaInitializationStatus,
} from './LorcanaService';

export interface AppStartupOptions {
  onStatusChange?: (status: LorcanaInitializationStatus) => void;
}

export interface AppStartupResult {
  didImportCards: boolean;
  importedSetNames: string[];
}

/**
 * AppStartup handles initialization of all services and databases
 * during app launch.
 */
class AppStartup {
  private static instance: AppStartup;
  private static initialized = false;
  private static initPromise: Promise<AppStartupResult> | null = null;
  private static lastResult: AppStartupResult = { didImportCards: false, importedSetNames: [] };

  private constructor() {}

  public static getInstance(): AppStartup {
    if (!AppStartup.instance) {
      AppStartup.instance = new AppStartup();
    }
    return AppStartup.instance;
  }

  public async initialize(options: AppStartupOptions = {}): Promise<AppStartupResult> {
    if (AppStartup.initialized) {
      Logger.info('[AppStartup] App already initialized, skipping');
      return AppStartup.lastResult;
    }

    if (AppStartup.initPromise) {
      Logger.info('[AppStartup] Initialization already in progress, waiting...');
      return AppStartup.initPromise;
    }

    AppStartup.initPromise = this.runInitialization(options);
    return AppStartup.initPromise;
  }

  private async runInitialization(options: AppStartupOptions): Promise<AppStartupResult> {
    try {
      Logger.info('[AppStartup] Starting app initialization');

      Logger.info('[AppStartup] Initializing databases');
      await DatabaseInitializer.initializeAllDatabases();

      const lorcanaResult = await initializeLorcanaDatabase(options.onStatusChange);
      Logger.info('[AppStartup] Lorcana initialization result', lorcanaResult);

      if (!lorcanaResult.success) {
        throw new Error('Lorcana data initialization failed');
      }

      const result: AppStartupResult = {
        didImportCards: lorcanaResult.didImportCards,
        importedSetNames: lorcanaResult.importedSetNames,
      };

      AppStartup.initialized = true;
      AppStartup.lastResult = result;
      Logger.info('[AppStartup] App initialization completed successfully');
      return result;
    } catch (error) {
      Logger.error('[AppStartup] Error during app initialization', error);
      AppStartup.initialized = false;
      AppStartup.lastResult = { didImportCards: false, importedSetNames: [] };
      throw error;
    } finally {
      AppStartup.initPromise = null;
    }
  }

  public isInitialized(): boolean {
    return AppStartup.initialized;
  }

  public reset(): void {
    AppStartup.initialized = false;
    AppStartup.initPromise = null;
    AppStartup.lastResult = { didImportCards: false, importedSetNames: [] };
  }
}

export default AppStartup;
