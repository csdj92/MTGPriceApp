import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import 'react-native-reanimated';
import { collectionCacheService } from './src/services/CollectionCacheService';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { setupFastImage, getImageLoadingStats } from './src/utils/imageUtils';
import FastImage from "@d11/react-native-fast-image";

const App = () => {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Initialize FastImage with improved caching settings
    setupFastImage();
    
    // Configure FastImage for optimal caching
    // Skip clearing the memory cache as it might remove valid cached images
    // Instead just log the current image stats
    console.log('App starting - current image cache stats:', getImageLoadingStats());
    
    // Preload collections data when app starts
    const preloadData = async () => {
      try {
        // Preload collections
        await collectionCacheService.preloadCollections();
      } catch (error) {
        console.error('Error preloading app data:', error);
      } finally {
        // Set initialization as complete after 1 second minimum to avoid flickering
        setTimeout(() => {
          setIsInitializing(false);
        }, 1000);
      }
    };

    preloadData();
  }, []);

  // Show a splash screen while initializing
  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading MTG Price App...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    color: '#333',
  },
});

export default App;
