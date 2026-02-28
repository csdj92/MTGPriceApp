import { databaseService } from './DatabaseService';
import type { Collection } from './DatabaseService';

// Cache validity period - 5 minutes
const CACHE_VALIDITY_PERIOD = 5 * 60 * 1000;

interface SetCollection extends Collection {
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export class CollectionCacheService {
    private collectionsCache: CacheEntry<Collection[]> | null = null;
    private setCollectionsCache: CacheEntry<SetCollection[]> | null = null;
    private collectionsPromise: Promise<Collection[]> | null = null;
    private setCollectionsPromise: Promise<SetCollection[]> | null = null;

    private debugLog(message: string, ...args: unknown[]): void {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log(message, ...args);
        }
    }

    private isCacheEntryValid(entry: CacheEntry<unknown> | null): boolean {
        return entry !== null && Date.now() - entry.timestamp < CACHE_VALIDITY_PERIOD;
    }

    private async fetchWithCache<T>(
        getCache: () => CacheEntry<T> | null,
        setCache: (entry: CacheEntry<T>) => void,
        getInflight: () => Promise<T> | null,
        setInflight: (p: Promise<T> | null) => void,
        fetcher: () => Promise<T>,
        label: string,
        forceRefresh: boolean,
    ): Promise<T> {
        if (this.isCacheEntryValid(getCache()) && !forceRefresh) {
            return getCache()!.data;
        }

        const inflight = getInflight();
        if (inflight) return inflight;

        this.debugLog(`[CollectionCacheService] Loading ${label} from database`);

        const promise = fetcher()
            .then((data) => {
                setCache({ data, timestamp: Date.now() });
                return data;
            })
            .catch((error) => {
                console.error(`[CollectionCacheService] Error loading ${label}:`, error);
                const cached = getCache();
                if (cached) return cached.data;
                throw error;
            })
            .finally(() => {
                setInflight(null);
            });

        setInflight(promise);
        return promise;
    }

    async getCollections(forceRefresh = false): Promise<Collection[]> {
        return this.fetchWithCache(
            () => this.collectionsCache,
            (entry) => { this.collectionsCache = entry; },
            () => this.collectionsPromise,
            (p) => { this.collectionsPromise = p; },
            () => databaseService.getCollections(),
            'collections',
            forceRefresh,
        );
    }

    async getSetCollections(forceRefresh = false): Promise<SetCollection[]> {
        return this.fetchWithCache(
            () => this.setCollectionsCache,
            (entry) => { this.setCollectionsCache = entry; },
            () => this.setCollectionsPromise,
            (p) => { this.setCollectionsPromise = p; },
            () => databaseService.getSetCollections(),
            'set collections',
            forceRefresh,
        );
    }

    addCollectionToCache(collection: Collection) {
        if (this.collectionsCache) {
            this.collectionsCache = {
                data: [...this.collectionsCache.data, collection],
                timestamp: Date.now(),
            };
        }
    }

    updateCollectionInCache(updatedCollection: Collection) {
        if (this.collectionsCache) {
            this.collectionsCache = {
                data: this.collectionsCache.data.map(
                    c => c.id === updatedCollection.id ? updatedCollection : c,
                ),
                timestamp: Date.now(),
            };
        }
    }

    removeCollectionFromCache(collectionId: string) {
        const filter = <T extends { id: string }>(arr: T[]) =>
            arr.filter(c => c.id !== collectionId);

        if (this.collectionsCache) {
            this.collectionsCache = { data: filter(this.collectionsCache.data), timestamp: Date.now() };
        }
        if (this.setCollectionsCache) {
            this.setCollectionsCache = { data: filter(this.setCollectionsCache.data), timestamp: Date.now() };
        }
    }

    clearCache() {
        this.collectionsCache = null;
        this.setCollectionsCache = null;
        this.collectionsPromise = null;
        this.setCollectionsPromise = null;
    }

    isCacheValid(): boolean {
        return this.isCacheEntryValid(this.collectionsCache);
    }

    isSetCacheValid(): boolean {
        return this.isCacheEntryValid(this.setCollectionsCache);
    }

    async preloadCollections(): Promise<void> {
        try {
            const tasks: Promise<unknown>[] = [];
            if (!this.isCacheValid()) {
                tasks.push(this.getCollections(true).catch(error => {
                    console.error('[CollectionCacheService] Error preloading regular collections:', error);
                }));
            }
            if (!this.isSetCacheValid()) {
                tasks.push(this.getSetCollections(true).catch(error => {
                    console.error('[CollectionCacheService] Error preloading set collections:', error);
                }));
            }
            await Promise.all(tasks);
        } catch (error) {
            console.error('[CollectionCacheService] Preloading error:', error);
        }
    }

    async preloadCache(): Promise<void> {
        await this.preloadCollections();
    }
}

// Export a singleton instance
export const collectionCacheService = new CollectionCacheService();
