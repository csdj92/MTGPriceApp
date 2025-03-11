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

export const getCachedImageUri = async (setCode: string, cardNumber: string, isBackFace = false): Promise<string> => {
    const fileName = isBackFace 
        ? `${setCode.toLowerCase()}_${cardNumber}_back.jpg`
        : `${setCode.toLowerCase()}_${cardNumber}.jpg`;
    const filePath = `${CACHE_DIR}/${fileName}`;
    
    try {
        const exists = await RNFS.exists(filePath);
        if (exists) {
            return `file://${filePath}`;
        }
        
        // If not in cache, download the image
        // Correctly format the Scryfall URL for double-sided cards
        let remoteUrl: string;
        if (isBackFace) {
            // For back faces, try the direct URL first
            remoteUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${cardNumber}?format=image&face=back`;
        } else {
            remoteUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${cardNumber}?format=image`;
        }
        
        console.log(`[imageCache] Downloading image from: ${remoteUrl}`);
        
        try {
            await RNFS.downloadFile({
                fromUrl: remoteUrl,
                toFile: filePath,
            }).promise;
        } catch (downloadError) {
            // If the first attempt fails, try an alternative URL format
            console.log(`[imageCache] First download attempt failed, trying alternative URL format`);
            
            if (isBackFace) {
                remoteUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${cardNumber}?format=image&version=normal&face=back`;
            } else {
                remoteUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${cardNumber}?format=image&version=normal`;
            }
            
            await RNFS.downloadFile({
                fromUrl: remoteUrl,
                toFile: filePath,
            }).promise;
        }
        
        return `file://${filePath}`;
    } catch (error) {
        console.error(`[imageCache] Error getting cached image for ${setCode}/${cardNumber}${isBackFace ? ' (back face)' : ''}:`, error);
        // If download fails, return the original URL
        if (isBackFace) {
            return `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${cardNumber}?format=image&face=back`;
        } else {
            return `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${cardNumber}?format=image`;
        }
    }
}; 