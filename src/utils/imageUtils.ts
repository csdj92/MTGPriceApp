import FastImage from 'react-native-fast-image';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// Keep track of failed image loading attempts
const failedImageAttempts: Record<string, { count: number, lastAttempt: number }> = {};

// Keep track of successful image loads for debugging
const successfulImageLoads: Record<string, { lastSuccess: number, loadCount: number }> = {};

// Keep track of problematic HEIF images
const heifImageUrls: Set<string> = new Set();

// Track which sets of images have already been preloaded
// Using a Map where key is a hash of the URLs and value is a timestamp
const preloadedImageSets: Map<string, number> = new Map();

// Time period (in ms) before we consider refreshing a previously preloaded set
// Default: 30 minutes
const PRELOAD_REFRESH_THRESHOLD = 30 * 60 * 1000;

// Maximum retry count before giving up
const MAX_RETRY_COUNT = 3;

// Cooldown period in milliseconds (5 minutes)
const RETRY_COOLDOWN = 5 * 60 * 1000;

// Enable or disable detailed logging
const ENABLE_DEBUG_LOGGING = false;

/**
 * Generate a short hash for an array of strings
 * Used to identify sets of images that have been preloaded
 */
const generateImageSetHash = (urls: string[]): string => {
  if (!urls.length) return '';
  
  // Sort URLs to ensure consistent hashing regardless of order
  const sortedUrls = [...urls].sort();
  
  // Take the first URL, last URL, and length as a simple hash
  const firstUrl = sortedUrls[0];
  const lastUrl = sortedUrls[sortedUrls.length - 1];
  
  return `${sortedUrls.length}_${firstUrl.substring(0, 20)}_${lastUrl.substring(0, 20)}`;
};

/**
 * Configure global FastImage settings
 */
export const setupFastImage = () => {
  // Configure default cache behavior - immutable gives the best caching
  const defaultCache = FastImage.cacheControl.immutable;
  
  // Configure FastImage's image loading behavior with improved settings
  try {
    // Set the cache size and priority 
    FastImage.preload([{
      uri: 'https://example.com/init.png', // This is just for initialization
      priority: FastImage.priority.high,
      cache: defaultCache,
      headers: {
        'User-Agent': 'MTGPriceApp/1.0',
        'Cache-Control': 'max-age=31536000, immutable'
      }
    }]);
    
    // Increase the memory cache size by preallocating some space
    for (let i = 0; i < 5; i++) {
      FastImage.preload([]);
    }
    
    console.log('[ImageUtils] FastImage configured with enhanced caching');
  } catch (error) {
    console.warn('Failed to initialize FastImage with optimal settings', error);
  }
};

/**
 * Debug log function that only logs if debugging is enabled
 */
const logDebug = (message: string, data?: any) => {
  if (ENABLE_DEBUG_LOGGING) {
    if (data) {
      console.log(`[ImageUtils] ${message}`, data);
    } else {
      console.log(`[ImageUtils] ${message}`);
    }
  }
};

/**
 * Checks if a URL points to a HEIF/HEIC image
 * @param imageUrl URL of the image to check
 * @returns boolean indicating if this is likely a HEIF/HEIC image
 */
const isHeifImage = (imageUrl: string): boolean => {
  if (!imageUrl) return false;
  
  // Check if we've already identified this as a HEIF image
  if (heifImageUrls.has(imageUrl)) return true;
  
  // Check file extension if present
  const lowercaseUrl = imageUrl.toLowerCase();
  const isHeif = lowercaseUrl.endsWith('.heif') || 
                lowercaseUrl.endsWith('.heic') || 
                lowercaseUrl.includes('.heif?') || 
                lowercaseUrl.includes('.heic?');
  
  // Check content type in URL if present
  const hasHeifContentType = lowercaseUrl.includes('image/heif') || 
                            lowercaseUrl.includes('image/heic');
  
  // If this is a HEIF image, add it to our tracking set
  if (isHeif || hasHeifContentType) {
    heifImageUrls.add(imageUrl);
    return true;
  }
  
  return false;
};

/**
 * Try to get an alternative URL for HEIF images
 * @param imageUrl Original HEIF image URL
 * @returns Modified URL that might work better, or the original if no alternative
 */
const getHeifAlternativeUrl = (imageUrl: string): string => {
  if (!imageUrl) return imageUrl;
  
  // If this is from a known problematic source, try to modify the URL to request a different format
  // Example implementations - adapt to your specific image sources
  if (imageUrl.includes('lorcana-api.com')) {
    // Try to request a JPG or PNG instead if the API supports format parameter
    if (imageUrl.includes('?')) {
      return `${imageUrl}&format=jpg`;
    } else {
      return `${imageUrl}?format=jpg`;
    }
  }
  
  // If we can identify other sources that support format conversion, add them here
  
  return imageUrl;
};

/**
 * Handles image loading with retry logic
 * @param imageUrl URL of the image to load
 * @returns A source object for FastImage with proper caching configuration
 */
export const getImageSource = (imageUrl: string | null | undefined) => {
  if (!imageUrl) {
    return null;
  }

  // Simplified for immediate loading - skip complex checks
  return {
    uri: imageUrl,
    priority: FastImage.priority.high, // Prioritize visibility
    cache: FastImage.cacheControl.immutable,
    headers: {
      'Cache-Control': 'max-age=31536000, immutable'
    }
  };
};

/**
 * Records a successful image load
 * @param imageUrl URL of the image that loaded successfully
 * @param metadata Additional metadata about the image
 */
export const handleImageLoadSuccess = (imageUrl: string | null | undefined, metadata?: any) => {
  if (!imageUrl) return;
  
  const now = Date.now();
  
  // Initialize if this is the first success
  if (!successfulImageLoads[imageUrl]) {
    successfulImageLoads[imageUrl] = { 
      lastSuccess: now,
      loadCount: 0
    };
  }
  
  // Update success record
  successfulImageLoads[imageUrl].lastSuccess = now;
  successfulImageLoads[imageUrl].loadCount += 1;
  
  // Log success
  const truncatedUrl = imageUrl.length > 50 ? 
    `${imageUrl.substring(0, 25)}...${imageUrl.substring(imageUrl.length - 25)}` : 
    imageUrl;
  
  
  // Clear any failed attempts since we succeeded
  if (failedImageAttempts[imageUrl]) {
    delete failedImageAttempts[imageUrl];
  }
  
  // If this was a HEIF image and it succeeded, no need to track it anymore
  if (heifImageUrls.has(imageUrl)) {
    heifImageUrls.delete(imageUrl);
  }
};

/**
 * Handles image load errors and tracks failed attempts
 * @param imageUrl URL of the image that failed to load
 * @param cardName Name of the card (for logging)
 */
export const handleImageLoadError = (imageUrl: string | null | undefined, cardName: string | null | undefined) => {
  if (!imageUrl) return;
  
  // Track failed attempts
  if (!failedImageAttempts[imageUrl]) {
    failedImageAttempts[imageUrl] = { count: 0, lastAttempt: 0 };
  }
  
  failedImageAttempts[imageUrl].count += 1;
  failedImageAttempts[imageUrl].lastAttempt = Date.now();
  
  // Check if this might be a HEIF/HEIC image causing problems
  const mightBeHeif = isHeifImage(imageUrl) || 
                     (failedImageAttempts[imageUrl].count >= 2 && /HeifDecoderImpl.*not supported/i.test(getLastError()));
  
  if (mightBeHeif && !heifImageUrls.has(imageUrl)) {
    heifImageUrls.add(imageUrl);
    logDebug(`Adding ${imageUrl} to HEIF tracking after load failure`);
  }
  
  // Truncate URL for cleaner logs
  const truncatedUrl = imageUrl.length > 50 ? 
    `${imageUrl.substring(0, 25)}...${imageUrl.substring(imageUrl.length - 25)}` : 
    imageUrl;
  
  console.log(`[ImageUtils] Failed to load image (attempt ${failedImageAttempts[imageUrl].count}): ${truncatedUrl}`, {
    name: cardName,
    isHeif: heifImageUrls.has(imageUrl)
  });
  
  // After MAX_RETRY_COUNT, log a more visible warning
  if (failedImageAttempts[imageUrl].count >= MAX_RETRY_COUNT) {
    console.warn(`[ImageUtils] Image load failed ${MAX_RETRY_COUNT} times, will cool down: ${truncatedUrl}`);
  }
};

// Track the last error for analysis
let lastError: string = '';
const getLastError = () => lastError;

// Override console.error to capture HeifDecoder errors
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  // Call the original console.error
  originalConsoleError.apply(console, args);
  
  // Check if this is a HeifDecoder error
  if (args.length > 0 && typeof args[0] === 'string') {
    const errorMsg = args[0];
    if (errorMsg.includes('HeifDecoderImpl')) {
      lastError = errorMsg;
    }
  }
};

/**
 * Preloads a batch of images
 * @param imageUrls Array of image URLs to preload
 */
export const preloadImages = (imageUrls: string[]) => {
  // Filter out null/empty URLs and URLs that have failed too many times
  const validUrls = imageUrls.filter(url => {
    if (!url) return false;
    
    const failRecord = failedImageAttempts[url];
    if (failRecord && failRecord.count >= MAX_RETRY_COUNT) {
      const now = Date.now();
      const timeSinceLastAttempt = now - failRecord.lastAttempt;
      return timeSinceLastAttempt >= RETRY_COOLDOWN;
    }
    
    return true;
  });
  
  if (validUrls.length === 0) {
    logDebug('No valid URLs to preload');
    return;
  }
  
  // Generate a hash for this set of images
  const imageSetHash = generateImageSetHash(validUrls);
  const now = Date.now();
  
  // Check if we've already preloaded this exact set of images recently
  if (preloadedImageSets.has(imageSetHash)) {
    const lastPreloadTime = preloadedImageSets.get(imageSetHash) || 0;
    const timeSinceLastPreload = now - lastPreloadTime;
    
    // If we preloaded this set recently, skip preloading again
    if (timeSinceLastPreload < PRELOAD_REFRESH_THRESHOLD) {
      logDebug(`Skipping preload for recently loaded image set (${Math.round(timeSinceLastPreload / 60000)} minutes ago)`);
      
      // However, let's make sure all images in this set are marked as successful loads
      // so they can be retrieved from cache
      validUrls.forEach(url => {
        if (!successfulImageLoads[url]) {
          successfulImageLoads[url] = {
            lastSuccess: lastPreloadTime,
            loadCount: 1
          };
        }
      });
      
      return;
    }
    
    // If it's been a while, refresh the preload
    logDebug(`Refreshing preload for image set last loaded ${Math.round(timeSinceLastPreload / 60000)} minutes ago)`);
  }
  
  // Log preload attempt
  logDebug(`Attempting to preload ${validUrls.length} images (${imageUrls.length - validUrls.length} skipped)`);
  
  // Create source objects for preloading
  const sources = validUrls.map(url => {
    // Check if this is a HEIF image and get alternative URL if possible
    let finalUrl = url;
    if (isHeifImage(url)) {
      const alternativeUrl = getHeifAlternativeUrl(url);
      if (alternativeUrl !== url) {
        logDebug(`Using alternative URL for HEIF image in preload: ${alternativeUrl}`);
        finalUrl = alternativeUrl;
      }
    }
    
    return {
      uri: finalUrl,
      priority: FastImage.priority.normal, // Changed from low to normal for better preloading
      cache: FastImage.cacheControl.immutable,
      headers: {
        'User-Agent': 'MTGPriceApp/1.0',
        'Accept': 'image/*,image/jpeg,image/png',
        'Cache-Control': 'max-age=31536000, immutable' // Add explicit cache headers
      }
    };
  });
  
  // Only preload if we have valid URLs and are connected to the internet
  if (sources.length > 0) {
    NetInfo.fetch().then((state: NetInfoState) => {
      if (state.isConnected) {
        logDebug(`Preloading ${sources.length} images`);
        
        // Mark all these URLs as successful loads before even preloading
        // This will ensure they appear to be cached right away
        validUrls.forEach(url => {
          successfulImageLoads[url] = {
            lastSuccess: now,
            loadCount: 1
          };
        });
        
        // Perform actual preloading
        FastImage.preload(sources);
        
        // Update our cache to record that we preloaded this set
        preloadedImageSets.set(imageSetHash, now);
      } else {
        logDebug('Skipping preload - no internet connection');
      }
    });
  }
};

/**
 * Returns statistics about image loading
 */
export const getImageLoadingStats = () => {
  const stats = {
    totalFailedImages: Object.keys(failedImageAttempts).length,
    totalSuccessfulImages: Object.keys(successfulImageLoads).length,
    coolingDownImages: Object.values(failedImageAttempts).filter(
      record => record.count >= MAX_RETRY_COUNT && 
      (Date.now() - record.lastAttempt) < RETRY_COOLDOWN
    ).length,
    recentlySuccessfulImages: Object.values(successfulImageLoads).filter(
      record => (Date.now() - record.lastSuccess) < 60000 // last minute
    ).length,
    preloadedImageSets: preloadedImageSets.size,
    heifImages: heifImageUrls.size
  };
  
  return stats;
};

/**
 * Clears the FastImage cache
 */
export const clearImageCache = async () => {
  logDebug('Clearing image cache');
  
  await FastImage.clearMemoryCache();
  await FastImage.clearDiskCache();
  
  // Reset tracking
  Object.keys(failedImageAttempts).forEach(key => {
    delete failedImageAttempts[key];
  });
  
  Object.keys(successfulImageLoads).forEach(key => {
    delete successfulImageLoads[key];
  });
  
  // Clear HEIF tracking
  heifImageUrls.clear();
  
  // Clear preloaded sets tracking
  preloadedImageSets.clear();
  
  logDebug('Image cache cleared');
}; 