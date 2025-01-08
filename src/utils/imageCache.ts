import RNFS from 'react-native-fs';

const CACHE_DIR = `${RNFS.CachesDirectoryPath}/card_images`;
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export const ensureCacheDirectory = async () => {
    try {
        const exists = await RNFS.exists(CACHE_DIR);
        if (!exists) {
            await RNFS.mkdir(CACHE_DIR);
        }
    } catch (error) {
        console.error('[ImageCache] Error creating cache directory:', error);
    }
};

export const getCachedImageUri = async (setCode: string, number: string): Promise<string> => {
    const fileName = `${setCode.toLowerCase()}_${number}.jpg`;
    const filePath = `${CACHE_DIR}/${fileName}`;

    try {
        // Check if file exists and is not expired
        if (await RNFS.exists(filePath)) {
            const stats = await RNFS.stat(filePath);
            const fileAge = Date.now() - new Date(stats.mtime).getTime();
            
            if (fileAge < CACHE_EXPIRY) {
                return `file://${filePath}`;
            }
            // File is expired, delete it
            await RNFS.unlink(filePath);
        }

        // File doesn't exist or was expired, download it
        const imageUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${number}?format=image&version=small`;
        await RNFS.downloadFile({
            fromUrl: imageUrl,
            toFile: filePath,
        }).promise;

        return `file://${filePath}`;
    } catch (error) {
        console.error('[ImageCache] Error handling cached image:', error);
        // Return the original URL if caching fails
        return `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${number}?format=image&version=small`;
    }
}; 