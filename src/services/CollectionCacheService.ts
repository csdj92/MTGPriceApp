import { ToastAndroid } from 'react-native';
import { databaseService } from './DatabaseService';
import type { Collection } from './DatabaseService';

// Cache validity period - 5 minutes
const CACHE_VALIDITY_PERIOD = 5 * 60 * 1000;

interface SetCollection extends Collection {
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
}

export class CollectionCacheService {
    private collectionsCache: {
        collections: Collection[];
        timestamp: number;
    } | null = null;
    
    private setCollectionsCache: {
        collections: SetCollection[];
        timestamp: number;
    } | null = null;

    private cache: Map<string, any> = new Map();
    private lastUpdate: number = 0;
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    /**
     * Get collections with caching
     * @param forceRefresh Force a database refresh instead of using cache
     * @returns Promise resolving to collections array
     */
    async getCollections(forceRefresh = false): Promise<Collection[]> {
        // Use cache if valid and not forcing refresh
        if (this.isCacheValid() && !forceRefresh) {
            console.log('[CollectionCacheService] Using cached collections data');
            //show toast
            ToastAndroid.show('Using cached collections data', ToastAndroid.SHORT);
            return this.collectionsCache!.collections;
        }
        
        console.log('[CollectionCacheService] Loading collections from database');
        //show toast
        ToastAndroid.show('Loading collections from database', ToastAndroid.SHORT);
        try {
            const loadedCollections = await databaseService.getCollections();
            
            // Update the cache
            this.collectionsCache = {
                collections: loadedCollections,
                timestamp: Date.now()
            };
            
            return loadedCollections;
        } catch (error) {
            console.error('[CollectionCacheService] Error loading collections:', error);
            
            // If we have stale cache data, return it as fallback
            if (this.collectionsCache) {
                console.log('[CollectionCacheService] Returning stale cache data as fallback');
                return this.collectionsCache.collections;
            }
            
            // Otherwise, propagate the error
            throw error;
        }
    }
    
    /**
     * Get set collections with caching
     * @param forceRefresh Force a database refresh instead of using cache
     * @returns Promise resolving to set collections array
     */
    async getSetCollections(forceRefresh = false): Promise<SetCollection[]> {
        // Use cache if valid and not forcing refresh
        if (this.isSetCacheValid() && !forceRefresh) {
            console.log('[CollectionCacheService] Using cached set collections data');
            return this.setCollectionsCache!.collections;
        }
        
        console.log('[CollectionCacheService] Loading set collections from database');
        try {
            const loadedCollections = await databaseService.getSetCollections();
            
            // Update the cache
            this.setCollectionsCache = {
                collections: loadedCollections,
                timestamp: Date.now()
            };
            
            return loadedCollections;
        } catch (error) {
            console.error('[CollectionCacheService] Error loading set collections:', error);
            
            // If we have stale cache data, return it as fallback
            if (this.setCollectionsCache) {
                console.log('[CollectionCacheService] Returning stale set cache data as fallback');
                return this.setCollectionsCache.collections;
            }
            
            // Otherwise, propagate the error
            throw error;
        }
    }

    /**
     * Add a new collection to the cache
     * @param collection The collection to add
     */
    addCollectionToCache(collection: Collection) {
        if (this.collectionsCache) {
            this.collectionsCache.collections = [
                ...this.collectionsCache.collections,
                collection
            ];
            this.collectionsCache.timestamp = Date.now();
        }
    }

    /**
     * Update a collection in the cache
     * @param updatedCollection The updated collection
     */
    updateCollectionInCache(updatedCollection: Collection) {
        if (this.collectionsCache) {
            this.collectionsCache.collections = this.collectionsCache.collections.map(
                collection => collection.id === updatedCollection.id ? updatedCollection : collection
            );
            this.collectionsCache.timestamp = Date.now();
        }
    }

    /**
     * Remove a collection from the cache
     * @param collectionId ID of collection to remove
     */
    removeCollectionFromCache(collectionId: string) {
        if (this.collectionsCache) {
            this.collectionsCache.collections = this.collectionsCache.collections.filter(
                collection => collection.id !== collectionId
            );
            this.collectionsCache.timestamp = Date.now();
        }
        
        if (this.setCollectionsCache) {
            this.setCollectionsCache.collections = this.setCollectionsCache.collections.filter(
                collection => collection.id !== collectionId
            );
        }
    }

    /**
     * Clear the cache entirely
     */
    clearCache() {
        this.collectionsCache = null;
        this.setCollectionsCache = null;
    }

    /**
     * Check if the regular collections cache is valid
     */
    isCacheValid(): boolean {
        return (
            this.collectionsCache !== null && 
            Date.now() - this.collectionsCache.timestamp < CACHE_VALIDITY_PERIOD
        );
    }
    
    /**
     * Check if the set collections cache is valid
     */
    isSetCacheValid(): boolean {
        return (
            this.setCollectionsCache !== null && 
            Date.now() - this.setCollectionsCache.timestamp < CACHE_VALIDITY_PERIOD
        );
    }

    /**
     * Preload collections into the cache
     */
    async preloadCollections(): Promise<void> {
        try {
            // Preload both regular and set collections
            const tasks = [];
            
            // Only preload if cache is invalid or empty
            if (!this.isCacheValid()) {
                console.log('[CollectionCacheService] Preloading regular collections');
                tasks.push(
                    databaseService.getCollections()
                    .then(collections => {
                        this.collectionsCache = {
                            collections,
                            timestamp: Date.now()
                        };
                        console.log('[CollectionCacheService] Preloaded', collections.length, 'regular collections');
                    })
                    .catch(error => {
                        console.error('[CollectionCacheService] Error preloading regular collections:', error);
                        // Don't fail the entire operation, just log the error
                        return [];
                    })
                );
            }
            
            // Preload set collections as well
            if (!this.isSetCacheValid()) {
                console.log('[CollectionCacheService] Preloading set collections');
                tasks.push(
                    databaseService.getSetCollections()
                    .then(collections => {
                        this.setCollectionsCache = {
                            collections,
                            timestamp: Date.now()
                        };
                        console.log('[CollectionCacheService] Preloaded', collections.length, 'set collections');
                    })
                    .catch(error => {
                        console.error('[CollectionCacheService] Error preloading set collections:', error);
                        // Don't fail the entire operation, just log the error
                        return [];
                    })
                );
            }
            
            // Wait for all preloading to complete
            await Promise.all(tasks);
        } catch (error) {
            console.error('[CollectionCacheService] Preloading error:', error);
            // Don't throw the error up - just log it
        }
    }

    async preloadCache(): Promise<void> {
        try {
            console.log('[CollectionCacheService] Starting cache preload');
            // Preload collections
            await this.preloadCollections();
            console.log('[CollectionCacheService] Cache preload complete');
        } catch (error) {
            console.error('[CollectionCacheService] Error preloading cache:', error);
            throw error;
        }
    }
}

// Export a singleton instance
export const collectionCacheService = new CollectionCacheService(); 