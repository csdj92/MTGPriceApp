import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { databaseService } from '../services/DatabaseService';
import type { MTGJsonPriceData, CardPrices } from '../types/database';

const PRICE_DATA_URL = 'https://mtgjson.com/api/v5/AllPricesToday.json.zip';
const BATCH_SIZE = 100;
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

export const downloadAndImportPriceData = async (onProgress: (progress: number) => void) => {
    await databaseService.initDatabase();

    // Check if we need to update prices
    const shouldUpdate = await databaseService.shouldUpdatePrices();
    if (!shouldUpdate) {
        console.log('[PriceData] Prices are up to date, skipping download');
        return;
    }

    const zipFilePath = `${RNFS.DocumentDirectoryPath}/prices.zip`;
    const extractPath = `${RNFS.DocumentDirectoryPath}/prices`;
    const jsonFilePath = `${extractPath}/AllPricesToday.json`;

    try {
        console.log('[PriceData] Starting file download from:', PRICE_DATA_URL);

        // Clean up any existing files first
        try {
            if (await RNFS.exists(zipFilePath)) {
                await RNFS.unlink(zipFilePath);
            }
            if (await RNFS.exists(extractPath)) {
                await RNFS.unlink(extractPath);
            }
        } catch (cleanupError) {
            console.log('[PriceData] Cleanup error (non-fatal):', cleanupError);
        }

        // Create extraction directory
        try {
            await RNFS.mkdir(extractPath);
        } catch (mkdirError) {
            console.log('[PriceData] Directory creation error (might already exist):', mkdirError);
        }

        // Download the ZIP file
        console.log('[PriceData] Downloading to:', zipFilePath);
        const response = await RNFS.downloadFile({
            fromUrl: PRICE_DATA_URL,
            toFile: zipFilePath,
            progress: (res: { bytesWritten: number; contentLength: number }) => {
                const progress = (res.bytesWritten / res.contentLength) * 100;
                console.log('[PriceData] Download progress:', progress);
                onProgress(progress);
            }
        }).promise;

        console.log('[PriceData] Download completed with status:', response.statusCode);

        // Verify zip file exists and has content
        const zipStats = await RNFS.stat(zipFilePath);
        console.log('[PriceData] Downloaded file size:', zipStats.size);
        if (zipStats.size === 0) {
            throw new Error('Downloaded zip file is empty');
        }

        // Extract the ZIP file
        console.log('[PriceData] Extracting zip file to:', extractPath);
        await unzip(zipFilePath, extractPath);

        // Verify JSON file exists
        if (!await RNFS.exists(jsonFilePath)) {
            throw new Error(`Extracted JSON file not found at: ${jsonFilePath}`);
        }

        // Get the extracted file size
        const jsonStats = await RNFS.stat(jsonFilePath);
        console.log('[PriceData] Extracted JSON file size:', jsonStats.size);
        if (jsonStats.size === 0) {
            throw new Error('Extracted JSON file is empty');
        }

        // Process the JSON file
        console.log('[PriceData] Processing price data in batches...');
        await processPriceDataFromDisk(jsonFilePath, jsonStats.size);

        // Clean up temporary files only after successful processing
        console.log('[PriceData] Cleaning up temporary files...');
        try {
            await RNFS.unlink(zipFilePath);
            await RNFS.unlink(extractPath);
        } catch (cleanupError) {
            console.log('[PriceData] Final cleanup error (non-fatal):', cleanupError);
        }

        // After successful processing, update the last check timestamp
        await databaseService.updateLastPriceCheck();
        console.log('[PriceData] Price data import completed successfully');
    } catch (error: unknown) {
        console.error('[PriceData] Error downloading and importing price data:', error);
        if (error instanceof Error) {
            console.error('[PriceData] Error details:', error.message);
            console.error('[PriceData] Stack trace:', error.stack);
        }
        // Attempt to clean up on error
        try {
            if (await RNFS.exists(zipFilePath)) {
                await RNFS.unlink(zipFilePath);
            }
            if (await RNFS.exists(extractPath)) {
                await RNFS.unlink(extractPath);
            }
        } catch (cleanupError) {
            console.log('[PriceData] Error cleanup failed:', cleanupError);
        }
        throw error;
    }
};

const processPriceDataFromDisk = async (filePath: string, fileSize: number) => {
    try {
        await databaseService.initDatabase();
        let fileContent = '';
        let totalBytesRead = 0;
        let lastProgressLog = 0;

        console.log('[PriceData] Starting to read file...');
        // Read file sequentially in chunks
        for (let offset = 0; offset < fileSize; offset += CHUNK_SIZE) {
            const length = Math.min(CHUNK_SIZE, fileSize - offset);
            const chunk = await RNFS.read(filePath, length, offset, 'utf8');
            fileContent += chunk;
            totalBytesRead = offset + length;

            // Only log progress every 5%
            const currentProgress = Math.round((totalBytesRead / fileSize) * 100);
            if (currentProgress >= lastProgressLog + 5) {
                console.log(`[PriceData] Reading file: ${currentProgress}% (${totalBytesRead.toLocaleString()}/${fileSize.toLocaleString()} bytes)`);
                lastProgressLog = currentProgress;
            }
        }

        console.log('[PriceData] File reading completed. Starting JSON verification...');
        // Verify JSON content
        if (!fileContent.startsWith('{') || !fileContent.endsWith('}')) {
            throw new Error('Invalid JSON format: content does not start with { or end with }');
        }

        console.log('[PriceData] Parsing JSON data...');
        const rawData = JSON.parse(fileContent) as MTGJsonPriceData;
        console.log('[PriceData] Sample data structure:', JSON.stringify(Object.entries(rawData.data).slice(0, 1), null, 2));

        // Process in batches
        const entries = Object.entries(rawData.data).filter(([uuid, cardData]) => {
            // Filter out meta entries
            if (uuid === 'meta') return false;

            // Check for paper prices
            const priceData = cardData as CardPrices;
            const hasPaperPrices = priceData.paper && (
                (priceData.paper.tcgplayer?.retail?.normal) ||
                (priceData.paper.cardmarket?.retail?.normal) ||
                (priceData.paper.cardkingdom?.retail?.normal) ||
                (priceData.paper.cardsphere?.retail?.normal)
            );

            if (!hasPaperPrices) {
                return false;
            }

            return true;
        });

        const totalEntries = entries.length;
        console.log(`[PriceData] Found ${totalEntries.toLocaleString()} valid card entries with paper prices`);
        console.log('[PriceData] First valid entry sample:', JSON.stringify(entries[0], null, 2));

        if (totalEntries === 0) {
            throw new Error('No valid card entries found in price data');
        }

        console.log(`[PriceData] Processing ${totalEntries.toLocaleString()} valid card entries in batches of ${BATCH_SIZE}...`);

        let processedCount = 0;
        let progressLog = 0;

        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
            const batch = entries.slice(i, i + BATCH_SIZE);
            const priceData: Record<string, { normal: number; foil: number }> = {};

            // Process each card in the batch
            for (const [uuid, cardData] of batch) {
                const priceInfo = cardData as CardPrices;
                // Get the best available paper price
                const paperPrices = priceInfo.paper;
                let normalPrice = 0;
                let foilPrice = 0;

                if (paperPrices) {
                    // Try each source in order of preference
                    const sources = ['tcgplayer', 'cardmarket', 'cardkingdom', 'cardsphere'] as const;
                    for (const source of sources) {
                        const priceData = paperPrices[source]?.retail;
                        if (priceData?.normal) {
                            const latestDate = Object.keys(priceData.normal).sort().pop();
                            if (latestDate) {
                                normalPrice = priceData.normal[latestDate];
                                break;
                            }
                        }
                    }
                    for (const source of sources) {
                        const priceData = paperPrices[source]?.retail;
                        if (priceData?.foil) {
                            const latestDate = Object.keys(priceData.foil).sort().pop();
                            if (latestDate) {
                                foilPrice = priceData.foil[latestDate];
                                break;
                            }
                        }
                    }
                }

                // Only add cards that have at least one price
                if (normalPrice > 0 || foilPrice > 0) {
                    priceData[uuid] = { normal: normalPrice, foil: foilPrice };
                }
            }

            // Only import if we have prices in the batch
            if (Object.keys(priceData).length > 0) {
                console.log(`[PriceData] Importing batch of ${Object.keys(priceData).length} card prices...`);
                await databaseService.updatePrices(priceData);
            }

            // Update progress
            processedCount += batch.length;
            const currentProgress = Math.round((processedCount / totalEntries) * 100);
            if (currentProgress >= progressLog + 5) {
                console.log(`[PriceData] Processed ${processedCount.toLocaleString()}/${totalEntries.toLocaleString()} entries (${currentProgress}%)`);
                progressLog = currentProgress;
            }
        }

        console.log('[PriceData] Finished processing price data');
    } catch (error: unknown) {
        console.error('[PriceData] Error processing price data:', error);
        if (error instanceof Error) {
            console.error('[PriceData] Error details:', error.message);
            console.error('[PriceData] Error stack:', error.stack);
        }
        throw error;
    }
}; 