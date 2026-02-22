import RNFS from 'react-native-fs';

const CACHE_DIR = `${RNFS.DocumentDirectoryPath}/card_images`;
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export const ensureCacheDirectory = async (): Promise<void> => {
    try {
        const exists = await RNFS.exists(CACHE_DIR);
        if (!exists) {
            await RNFS.mkdir(CACHE_DIR);
            console.log(`Created cache directory at ${CACHE_DIR}`);
        }
    } catch (error) {
        console.error('Error ensuring cache directory exists:', error);
    }
};

/**
 * Get cached image URI for a Lorcana card
 * @param uniqueId - The unique ID of the card
 * @param imageUrl - The remote URL of the image
 * @returns Local file URI or remote URL
 */
export const getCachedImageUri = async (uniqueId: string, imageUrl: string): Promise<string> => {
    const fileName = `${uniqueId}.jpg`;
    const filePath = `${CACHE_DIR}/${fileName}`;

    try {
        const exists = await RNFS.exists(filePath);
        if (exists) {
            return `file://${filePath}`;
        }

        // If not in cache, download the image
        console.log(`[imageCache] Downloading image from: ${imageUrl}`);

        await RNFS.downloadFile({
            fromUrl: imageUrl,
            toFile: filePath,
        }).promise;

        return `file://${filePath}`;
    } catch (error) {
        console.error(`[imageCache] Error getting cached image for ${uniqueId}:`, error);
        // If download fails, return the original URL
        return imageUrl;
    }
};

/**
 * Clear the image cache
 */
export const clearImageCache = async (): Promise<void> => {
    try {
        const exists = await RNFS.exists(CACHE_DIR);
        if (exists) {
            await RNFS.unlink(CACHE_DIR);
            console.log(`Cleared image cache at ${CACHE_DIR}`);
            await ensureCacheDirectory();
        }
    } catch (error) {
        console.error('Error clearing image cache:', error);
    }
};
