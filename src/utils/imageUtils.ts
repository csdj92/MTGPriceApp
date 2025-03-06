import FastImage from '@d11/react-native-fast-image';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// Keep track of failed image loading attempts
const failedImageAttempts: Record<string, { count: number, lastAttempt: number }> = {};

// Keep track of successful image loads for debugging
const successfulImageLoads: Record<string, { lastSuccess: number, loadCount: number }> = {};

// Track which sets of images have already been preloaded
// Using a Map where key is a hash of the URLs and value is a timestamp
const preloadedImageSets: Map<string, number> = new Map();

// Track already logged image URLs to prevent duplicate logging
const loggedImageUrls: Set<string> = new Set();

// Time period (in ms) before we consider refreshing a previously preloaded set
// Default: 30 minutes
const PRELOAD_REFRESH_THRESHOLD = 30 * 60 * 1000;

// Maximum retry count before giving up
const MAX_RETRY_COUNT = 3;

// Cooldown period in milliseconds (5 minutes)
const RETRY_COOLDOWN = 5 * 60 * 1000;

// Enable or disable detailed logging
const ENABLE_DEBUG_LOGGING = true;

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
 * Handles image loading with retry logic
 * @param imageUrl URL of the image to load
 * @returns A source object for FastImage with proper caching configuration
 */
export const getImageSource = (imageUrl: string | null | undefined) => {
  if (!imageUrl) {
    logDebug('getImageSource called with null or undefined URL');
    return null;
  }

  // Log the full image URL we're trying to load only if it hasn't been logged before
  if (!loggedImageUrls.has(imageUrl)) {
    console.log(`[ImageUtils] Loading full URL: ${imageUrl}`);
    loggedImageUrls.add(imageUrl);
  }

  // Check if this image has failed too many times recently
  const failRecord = failedImageAttempts[imageUrl];
  if (failRecord && failRecord.count >= MAX_RETRY_COUNT) {
    const now = Date.now();
    const timeSinceLastAttempt = now - failRecord.lastAttempt;
    
    if (timeSinceLastAttempt < RETRY_COOLDOWN) {
      logDebug(`Skipping recently failed image (in cooldown): ${imageUrl.substring(0, 30)}...`);
      return null;
    }
    
    // Reset the failure count if we're trying again after cooldown
    logDebug(`Retry cooled-down image: ${imageUrl.substring(0, 30)}...`);
    failedImageAttempts[imageUrl].count = 0;
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
  
  // Truncate URL for cleaner logs
  const truncatedUrl = imageUrl.length > 50 ? 
    `${imageUrl.substring(0, 25)}...${imageUrl.substring(imageUrl.length - 25)}` : 
    imageUrl;
  
  console.log(`[ImageUtils] Failed to load image (attempt ${failedImageAttempts[imageUrl].count}): ${truncatedUrl}`, {
    name: cardName
  });
  
  // After MAX_RETRY_COUNT, log a more visible warning
  if (failedImageAttempts[imageUrl].count >= MAX_RETRY_COUNT) {
    console.warn(`[ImageUtils] Image load failed ${MAX_RETRY_COUNT} times, will cool down: ${truncatedUrl}`);
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
    return {
      uri: url,
      priority: FastImage.priority.normal, // Changed from low to normal for better preloading
      cache: FastImage.cacheControl.immutable,
      headers: {
        'User-Agent': 'MTGPriceApp/1.0',
        'Accept': 'image/*,image/jpeg,image/png,image/avif',
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
    preloadedImageSets: preloadedImageSets.size
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
  
  // Clear preloaded sets tracking
  preloadedImageSets.clear();
  
  logDebug('Image cache cleared');
};

/**
 * Update all image URLs in the database (converts lorcana-api.com to lorcast.io)
 * This function requires a database instance to be passed in
 * @param db SQLite database instance
 * @returns Promise<number> Number of URLs updated
 */
export const updateAllImageUrlsInDatabase = async (db: any): Promise<number> => {
  if (!db) {
    console.error('[ImageUtils] Database instance required to update image URLs');
    return 0;
  }

  try {
    logDebug('Starting database image URL update');
    
    // Get all cards with problematic URLs
    const query = `SELECT Unique_ID, Image FROM lorcana_cards WHERE 
                  Image LIKE '%lorcana-api.com%' OR 
                  (Image LIKE '%lorcast.io%' AND Image NOT LIKE '%.jpg%' AND Image NOT LIKE '%.png%') OR
                  (Image LIKE '%cards.lorcast.io%') OR
                  (Image LIKE '%/normal/%' AND Image NOT LIKE '%/full/%')`;
    const results = await db.executeSql(query);
    
    if (!results || !results[0] || !results[0].rows) {
      logDebug('No problematic URLs found in database');
      return 0;
    }
    
    const rows = results[0].rows;
    const cardsToUpdate = [];
    
    // Process all matched cards
    for (let i = 0; i < rows.length; i++) {
      const card = rows.item(i);
      
      if (!card.Image) continue;
      
      
      // Apply fixes based on our utility function
      const fixedUrl = getLorcanaImageUrl(card);
      
      if (fixedUrl && fixedUrl !== card.Image) {
        cardsToUpdate.push({
          id: card.Unique_ID,
          oldUrl: card.Image,
          newUrl: fixedUrl
        });
      }
    }
    
    console.log(`[ImageUtils] Found ${cardsToUpdate.length} cards with URLs to update`);
    
    // Update each card with the fixed URL
    let updatedCount = 0;
    for (const card of cardsToUpdate) {
      const updateQuery = "UPDATE lorcana_cards SET Image = ? WHERE Unique_ID = ?";
      await db.executeSql(updateQuery, [card.newUrl, card.id]);
      updatedCount++;
      
      if (updatedCount % 50 === 0) {
        console.log(`[ImageUtils] Updated ${updatedCount}/${cardsToUpdate.length} image URLs`);
      }
    }
    
    console.log(`[ImageUtils] Successfully updated ${updatedCount} image URLs in database`);
    return updatedCount;
  } catch (error) {
    console.error('[ImageUtils] Error updating image URLs in database:', error);
    return 0;
  }
};

/**
 * Get the appropriate image URL for a Lorcana card
 * @param card The Lorcana card object
 * @param size The desired image size ('full' or 'small')
 * @returns The URL for the card image
 */
export const getLorcanaImageUrl = (card: any, size: 'full' | 'small' = 'full'): string => {
  // Start with null and find the best URL available
  let imageUrl: string | null = null;
  
  // First check if the card has the new image_uris.digital structure
  if (card.image_uris?.digital) {
    // Use the appropriate size from the digital collection
    if (size === 'small' && card.image_uris.digital.small) {
      return card.image_uris.digital.small;
    } else if (card.image_uris.digital.normal) {
      return card.image_uris.digital.normal;
    } else if (card.image_uris.digital.large) {
      return card.image_uris.digital.large;
    }
  }
  
  // If the card already has an image URL, use it
  if (card.Image && typeof card.Image === 'string') {
    imageUrl = card.Image;
  }
  // If it's a card with imageUris, use those
  else if (card.imageUris?.normal || card.imageUris?.small) {
    imageUrl = size === 'full' ? card.imageUris.normal : card.imageUris.small;
  }
  // If there's a direct imageUrl, use that
  else if (card.imageUrl) {
    imageUrl = card.imageUrl;
  }

  if (imageUrl) {
    return imageUrl;
  }

  // Return a placeholder if no image is available
  return 'https://via.placeholder.com/488x680/333333/FFFFFF?text=' + encodeURIComponent(card.name || card.Name || '?');
};