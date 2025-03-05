/**
 * Logger utility for consistent logging across the app
 * - Debug logs only appear in development
 * - Error logs appear in both development and production
 * - Could be extended to send errors to a reporting service
 */

const DEBUG = __DEV__;

export const Logger = {
  /**
   * Debug-level logging (only in dev environment)
   */
  debug: (message: string, ...args: any[]) => {
    if (DEBUG) console.log(`[DEBUG] ${message}`, ...args);
  },
  
  /**
   * Info-level logging (only in dev environment)
   */
  info: (message: string, ...args: any[]) => {
    if (DEBUG) console.info(`[INFO] ${message}`, ...args);
  },
  
  /**
   * Warning-level logging (only in dev environment)
   */
  warn: (message: string, ...args: any[]) => {
    if (DEBUG) console.warn(`[WARN] ${message}`, ...args);
  },
  
  /**
   * Error-level logging (in all environments)
   */
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
    // TODO: Send to error reporting service in production
  },
  
  /**
   * Database-related logging (critical for both dev and prod)
   */
  database: (message: string, ...args: any[]) => {
    // Always log database errors regardless of environment
    console.log(`[DATABASE] ${message}`, ...args);
  },
  
  /**
   * Log method start/end for performance tracking (only in dev)
   */
  traceMethod: (methodName: string, callback: () => any) => {
    if (!DEBUG) return callback();
    
    console.time(`[TRACE] ${methodName}`);
    try {
      return callback();
    } finally {
      console.timeEnd(`[TRACE] ${methodName}`);
    }
  },
  
  /**
   * Log async method start/end for performance tracking (only in dev)
   */
  traceAsyncMethod: async (methodName: string, callback: () => Promise<any>) => {
    if (!DEBUG) return callback();
    
    console.time(`[TRACE-ASYNC] ${methodName}`);
    try {
      return await callback();
    } finally {
      console.timeEnd(`[TRACE-ASYNC] ${methodName}`);
    }
  }
}; 