import RNFS from 'react-native-fs';
import { Image } from 'react-native';

export interface ImageCacheConfig {
  maxCacheSize: number; // in MB
  compressionQuality: 'high' | 'medium' | 'compressed';
  enableProgressiveDownload: boolean;
  enableBulkDownload: boolean;
}

export interface DownloadProgress {
  current: number;
  total: number;
  setName?: string;
  cardName?: string;
}

export interface CacheStats {
  totalImages: number;
  totalSizeMB: number;
  availableSpaceMB: number;
  downloadedSets: string[];
}

class ImageCacheService {
  private cacheDir: string;
  private downloadQueue: Set<string> = new Set();
  private isDownloading = false;
  private config: ImageCacheConfig = {
    maxCacheSize: 500, // 500MB default
    compressionQuality: 'medium',
    enableProgressiveDownload: true,
    enableBulkDownload: false,
  };

  constructor() {
    this.cacheDir = `${RNFS.DocumentDirectoryPath}/lorcana_images`;
    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    try {
      const exists = await RNFS.exists(this.cacheDir);
      if (!exists) {
        await RNFS.mkdir(this.cacheDir);
      }
    } catch (error) {
      console.error('[ImageCacheService] Failed to initialize cache directory:', error);
    }
  }

  async updateConfig(newConfig: Partial<ImageCacheConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    // Save config to AsyncStorage if needed
  }

  getConfig(): ImageCacheConfig {
    return { ...this.config };
  }

  private getImageFileName(imageUrl: string, quality: string = this.config.compressionQuality): string {
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1] || 'unknown';
    const nameWithoutExt = fileName.split('.')[0];
    return `${nameWithoutExt}_${quality}.jpg`;
  }

  private async getImageLocalPath(imageUrl: string, quality?: string): Promise<string> {
    const fileName = this.getImageFileName(imageUrl, quality);
    return `${this.cacheDir}/${fileName}`;
  }

  async isImageCached(imageUrl: string, quality?: string): Promise<boolean> {
    try {
      const localPath = await this.getImageLocalPath(imageUrl, quality);
      return await RNFS.exists(localPath);
    } catch {
      return false;
    }
  }

  async getCachedImagePath(imageUrl: string, quality?: string): Promise<string | null> {
    try {
      const localPath = await this.getImageLocalPath(imageUrl, quality);
      const exists = await RNFS.exists(localPath);
      return exists ? `file://${localPath}` : null;
    } catch {
      return null;
    }
  }

  async downloadImage(
    imageUrl: string, 
    quality: string = this.config.compressionQuality,
    onProgress?: (progress: number) => void
  ): Promise<string | null> {
    try {
      const localPath = await this.getImageLocalPath(imageUrl, quality);
      
      // Check if already exists
      if (await RNFS.exists(localPath)) {
        return `file://${localPath}`;
      }

      // Download with progress tracking
      const downloadResult = await RNFS.downloadFile({
        fromUrl: imageUrl,
        toFile: localPath,
        progress: (res) => {
          if (onProgress) {
            const progress = (res.bytesWritten / res.contentLength) * 100;
            onProgress(progress);
          }
        },
      }).promise;

      if (downloadResult.statusCode === 200) {
        // Optionally compress the image here based on quality setting
        await this.compressImageIfNeeded(localPath, quality);
        return `file://${localPath}`;
      } else {
        throw new Error(`Download failed with status: ${downloadResult.statusCode}`);
      }
    } catch (error) {
      console.error('[ImageCacheService] Failed to download image:', imageUrl, error);
      return null;
    }
  }

  private async compressImageIfNeeded(localPath: string, quality: string): Promise<void> {
    // Implement image compression based on quality setting
    // For now, we'll skip compression but this could use a library like react-native-image-resizer
    if (quality === 'compressed') {
      // TODO: Implement compression logic
      // Could reduce size by 50-70% for grid views
    }
  }

  async downloadSetImages(
    setId: string,
    cards: Array<{ Image: string; Name: string }>,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (this.isDownloading) {
      console.log('[ImageCacheService] Download already in progress');
      return;
    }

    this.isDownloading = true;
    let downloaded = 0;
    const total = cards.length;

    try {
      for (const card of cards) {
        if (card.Image) {
          await this.downloadImage(card.Image, this.config.compressionQuality);
          downloaded++;
          
          if (onProgress) {
            onProgress({
              current: downloaded,
              total,
              setName: setId,
              cardName: card.Name,
            });
          }
        }
      }
    } finally {
      this.isDownloading = false;
    }
  }

  async downloadAllImages(
    allCards: Array<{ Image: string; Name: string; Set_ID?: string }>,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (this.isDownloading) {
      console.log('[ImageCacheService] Download already in progress');
      return;
    }

    this.isDownloading = true;
    let downloaded = 0;
    const total = allCards.filter(card => card.Image).length;

    try {
      for (const card of allCards) {
        if (card.Image) {
          await this.downloadImage(card.Image, this.config.compressionQuality);
          downloaded++;
          
          if (onProgress) {
            onProgress({
              current: downloaded,
              total,
              setName: card.Set_ID,
              cardName: card.Name,
            });
          }
        }
      }
    } finally {
      this.isDownloading = false;
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    try {
      const files = await RNFS.readDir(this.cacheDir);
      let totalSize = 0;
      const downloadedSets = new Set<string>();

      for (const file of files) {
        totalSize += file.size;
        // Extract set info from filename if needed
      }

      const freeSpace = await RNFS.getFSInfo();
      
      return {
        totalImages: files.length,
        totalSizeMB: totalSize / (1024 * 1024),
        availableSpaceMB: freeSpace.freeSpace / (1024 * 1024),
        downloadedSets: Array.from(downloadedSets),
      };
    } catch (error) {
      console.error('[ImageCacheService] Failed to get cache stats:', error);
      return {
        totalImages: 0,
        totalSizeMB: 0,
        availableSpaceMB: 0,
        downloadedSets: [],
      };
    }
  }

  async clearCache(): Promise<void> {
    try {
      const exists = await RNFS.exists(this.cacheDir);
      if (exists) {
        await RNFS.unlink(this.cacheDir);
        await RNFS.mkdir(this.cacheDir);
      }
    } catch (error) {
      console.error('[ImageCacheService] Failed to clear cache:', error);
    }
  }

  async clearOldCache(): Promise<void> {
    try {
      const stats = await this.getCacheStats();
      if (stats.totalSizeMB > this.config.maxCacheSize) {
        // Remove oldest files until under the limit
        const files = await RNFS.readDir(this.cacheDir);
        const sortedFiles = files.sort((a, b) => (a.mtime?.getTime() || 0) - (b.mtime?.getTime() || 0));
        
        let currentSize = stats.totalSizeMB;
        for (const file of sortedFiles) {
          if (currentSize <= this.config.maxCacheSize * 0.8) break; // Keep 20% buffer
          
          await RNFS.unlink(file.path);
          currentSize -= file.size / (1024 * 1024);
        }
      }
    } catch (error) {
      console.error('[ImageCacheService] Failed to clear old cache:', error);
    }
  }

  isDownloadInProgress(): boolean {
    return this.isDownloading;
  }

  async preloadSetImages(setId: string, cards: Array<{ Image: string; Name: string }>): Promise<void> {
    if (!this.config.enableProgressiveDownload) return;
    
    // Add to queue for background download
    for (const card of cards) {
      if (card.Image) {
        this.downloadQueue.add(card.Image);
      }
    }

    // Process queue in background
    this.processDownloadQueue();
  }

  private async processDownloadQueue(): Promise<void> {
    if (this.isDownloading || this.downloadQueue.size === 0) return;

    this.isDownloading = true;
    const urls = Array.from(this.downloadQueue);
    this.downloadQueue.clear();

    try {
      for (const url of urls) {
        if (!(await this.isImageCached(url))) {
          await this.downloadImage(url);
        }
      }
    } finally {
      this.isDownloading = false;
    }
  }
}

export const imageCacheService = new ImageCacheService();
export default ImageCacheService; 