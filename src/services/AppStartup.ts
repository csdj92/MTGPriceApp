import { Platform } from 'react-native';
import DatabaseInitializer from './DatabaseInitializer';
import Logger from './Logger';

/**
 * AppStartup handles initialization of all services and databases
 * during app launch.
 */
class AppStartup {
  private static instance: AppStartup;
  private static initialized = false;
  private static initializing = false;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AppStartup {
    if (!AppStartup.instance) {
      AppStartup.instance = new AppStartup();
    }
    return AppStartup.instance;
  }

  /**
   * Initialize all app services
   */
  public async initialize(): Promise<void> {
    if (AppStartup.initialized) {
      Logger.info('[AppStartup] App already initialized, skipping');
      return;
    }

    if (AppStartup.initializing) {
      Logger.info('[AppStartup] Initialization already in progress, waiting...');
      await this.waitForInitialization();
      return;
    }

    try {
      AppStartup.initializing = true;
      Logger.info('[AppStartup] Starting app initialization');

      // Initialize all databases
      await this.initializeDatabases();

      // Perform platform-specific initialization
      await this.platformSpecificSetup();

      // You can add more initialization steps here, for example:
      // - Initialize authentication services
      // - Load user preferences
      // - Set up analytics
      // - Initialize third-party services

      AppStartup.initialized = true;
      Logger.info('[AppStartup] App initialization completed successfully');
    } catch (error) {
      Logger.error('[AppStartup] Error during app initialization', error);
      // Reset for retry on next attempt
      AppStartup.initialized = false;
      throw error;
    } finally {
      AppStartup.initializing = false;
    }
  }

  /**
   * Initialize all databases
   */
  private async initializeDatabases(): Promise<void> {
    try {
      Logger.info('[AppStartup] Initializing databases');
      await DatabaseInitializer.initializeAllDatabases();
      Logger.info('[AppStartup] Database initialization completed');
    } catch (error) {
      Logger.error('[AppStartup] Database initialization failed', error);
      throw error;
    }
  }

  /**
   * Perform platform-specific setup
   */
  private async platformSpecificSetup(): Promise<void> {
    try {
      if (Platform.OS === 'android') {
        // Android-specific setup
        Logger.info('[AppStartup] Performing Android-specific setup');
        // Add Android-specific initialization if needed
      } else if (Platform.OS === 'ios') {
        // iOS-specific setup
        Logger.info('[AppStartup] Performing iOS-specific setup');
        // Add iOS-specific initialization if needed
      }
    } catch (error) {
      Logger.error(`[AppStartup] Error during ${Platform.OS}-specific setup`, error);
      throw error;
    }
  }

  /**
   * Wait for any in-progress initialization to complete
   */
  private async waitForInitialization(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkInitialization = () => {
        if (!AppStartup.initializing) {
          resolve();
        } else {
          setTimeout(checkInitialization, 100);
        }
      };
      checkInitialization();
    });
  }

  /**
   * Check if app is fully initialized
   */
  public isInitialized(): boolean {
    return AppStartup.initialized;
  }

  /**
   * Reset initialization state for testing purposes
   */
  public reset(): void {
    AppStartup.initialized = false;
    AppStartup.initializing = false;
  }
}

export default AppStartup; 