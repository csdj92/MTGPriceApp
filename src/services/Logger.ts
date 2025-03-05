class Logger {
  static info(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }

  static error(message: string, error?: any): void {
    console.error(message);
    
    if (error) {
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      } else {
        console.error('Unknown error:', error);
      }
    }
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(message, ...args);
  }

  static debug(message: string, ...args: any[]): void {
    if (__DEV__) {
      console.debug(message, ...args);
    }
  }
}

export default Logger; 