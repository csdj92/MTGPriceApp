import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DatabaseService from './src/services/DatabaseService';
import AppNavigator from './src/navigation/AppNavigator';
import LoadingScreen from './src/components/LoadingScreen';
import 'react-native-reanimated';
import { collectionCacheService } from './src/services/CollectionCacheService';
import { ActivityIndicator, View, Text, StyleSheet, StatusBar } from 'react-native';
import { setupFastImage, getImageLoadingStats } from './src/utils/imageUtils';
import FastImage from "@d11/react-native-fast-image";
import ErrorBoundary from './src/components/ErrorBoundary';
import DatabaseErrorScreen from './src/components/DatabaseErrorScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import AppStartup from './src/services/AppStartup';

const AppContent = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    // Initialize FastImage with improved caching settings
    setupFastImage();
    
    // Configure FastImage for optimal caching
    // Skip clearing the memory cache as it might remove valid cached images
    // Instead just log the current image stats
    console.log('App starting - current image cache stats:', getImageLoadingStats());
    
    const initializeApp = async () => {
      try {
        setIsLoading(true);
        
        // Use AppStartup service to initialize all services including databases
        const appStartup = AppStartup.getInstance();
        await appStartup.initialize();
        
        // Preload cache
        await collectionCacheService.preloadCache();
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setInitError(error instanceof Error ? error : new Error('Unknown initialization error'));
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  if (initError) {
    return (
      <LoadingScreen 
        message="Application initialization failed" 
        error={initError.message}
      />
    );
  }

  if (isLoading || !isInitialized) {
    return <LoadingScreen message="Initializing application..." />;
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle={theme.statusBar} />
      <AppNavigator />
    </NavigationContainer>
  );
};

const App = () => {
  return (
    <ErrorBoundary fallback={<DatabaseErrorScreen />}>
      <ThemeProvider>
        <SafeAreaProvider>
          <AppContent />
        </SafeAreaProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  errorHint: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

export default App;
