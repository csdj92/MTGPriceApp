import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { databaseService } from '../services/DatabaseService';
import type { MTGJsonPriceData, CardPrices } from '../types/database';

const PRICE_DATA_URL = 'https://mtgjson.com/api/v5/AllPricesToday.json.zip';
const BATCH_SIZE = 100;
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

export const downloadAndImportPriceData = async (onProgress: (progress: number) => void, force: boolean = false) => {
    await databaseService.initDatabase();

    const zipFilePath = `${RNFS.DocumentDirectoryPath}/prices.zip`;
    const extractPath = `${RNFS.DocumentDirectoryPath}/prices`;
    const jsonFilePath = `${extractPath}/AllPricesToday.json`;
    const lastDownloadPath = `${RNFS.DocumentDirectoryPath}/last_price_download.txt`;

    try {
        // Check if we've already downloaded today
        let shouldDownload = force;
        if (!force) {
            try {
                if (await RNFS.exists(lastDownloadPath)) {
                    const lastDownloadStr = await RNFS.readFile(lastDownloadPath, 'utf8');
                    const lastDownload = new Date(lastDownloadStr);
                    const now = new Date();
                    
                    // Only download if it's a different day
                    shouldDownload = lastDownload.toDateString() !== now.toDateString();
                    console.log(`[PriceData] Last download: ${lastDownload.toISOString()}, should download: ${shouldDownload}`);
                } else {
                    shouldDownload = true;
                }
            } catch (error) {
                console.error('[PriceData] Error checking last download:', error);
                shouldDownload = true;
            }
        }

        // Check if we already have the JSON file
        const hasExistingJson = await RNFS.exists(jsonFilePath);
        
        if (!shouldDownload && hasExistingJson) {
            console.log('[PriceData] Using existing price data file');
            const jsonStats = await RNFS.stat(jsonFilePath);
            await processPriceDataFromDisk(jsonFilePath, jsonStats.size);
            return;
        }

        // If we need to download, clean up any existing files first
        console.log('[PriceData] Starting new download, cleaning up old files...');
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

        console.log('[PriceData] Starting file download from:', PRICE_DATA_URL);

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

        // Clean up zip file after extraction
        await RNFS.unlink(zipFilePath);

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

        // Update last download time
        await RNFS.writeFile(lastDownloadPath, new Date().toISOString(), 'utf8');

        // Price data import completed
        console.log('[PriceData] Price data import completed successfully');
    } catch (error: unknown) {
        console.error('[PriceData] Error downloading and importing price data:', error);
        if (error instanceof Error) {
            console.error('[PriceData] Error details:', error.message);
            console.error('[PriceData] Stack trace:', error.stack);
        }
        // Attempt to clean up only the zip file on error
        try {
            if (await RNFS.exists(zipFilePath)) {
                await RNFS.unlink(zipFilePath);
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
        console.log('[PriceData] Sample data structure:', JSON.stringify(Object.entries(rawData.data).slice(400, 600), null, 2));

        // Process in batches
        const entries = Object.entries(rawData.data).filter(([uuid, cardData]) => {

            // Filter out meta entries
            if (uuid === 'meta') return false;

            // Check for paper or MTGO prices
            const priceData = cardData as CardPrices;

            const hasPaperPrices = priceData.paper && (
                (priceData.paper.tcgplayer?.retail?.normal && Object.keys(priceData.paper.tcgplayer.retail.normal).length > 0) ||
                (priceData.paper.tcgplayer?.retail?.foil && Object.keys(priceData.paper.tcgplayer.retail.foil).length > 0) ||
                (priceData.paper.cardmarket?.retail?.normal && Object.keys(priceData.paper.cardmarket.retail.normal).length > 0) ||
                (priceData.paper.cardmarket?.retail?.foil && Object.keys(priceData.paper.cardmarket.retail.foil).length > 0) ||
                (priceData.paper.cardkingdom?.retail?.normal && Object.keys(priceData.paper.cardkingdom.retail.normal).length > 0) ||
                (priceData.paper.cardkingdom?.retail?.foil && Object.keys(priceData.paper.cardkingdom.retail.foil).length > 0) ||
                (priceData.paper.cardsphere?.retail?.normal && Object.keys(priceData.paper.cardsphere.retail.normal).length > 0) ||
                (priceData.paper.cardsphere?.retail?.foil && Object.keys(priceData.paper.cardsphere.retail.foil).length > 0)
            );

            const hasMtgoPrices = priceData.mtgo?.cardhoarder?.retail && (
                (priceData.mtgo.cardhoarder.retail.normal && Object.keys(priceData.mtgo.cardhoarder.retail.normal).length > 0) ||
                (priceData.mtgo.cardhoarder.retail.foil && Object.keys(priceData.mtgo.cardhoarder.retail.foil).length > 0)
            );

            if (!hasPaperPrices && !hasMtgoPrices) {
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
            const priceData: Record<string, { normal: number; foil: number; tcg_normal: number; tcg_foil: number; cardmarket_normal: number; cardmarket_foil: number; cardkingdom_normal: number; cardkingdom_foil: number; cardsphere_normal: number; cardsphere_foil: number; cardhoarder_normal: number; cardhoarder_foil: number }> = {};

            // Process each card in the batch
            for (const [uuid, cardData] of batch) {
                const priceInfo = cardData as CardPrices;
                const paperPrices = priceInfo.paper;
                let tcgNormal = 0;
                let tcgFoil = 0;
                let cardmarketNormal = 0;
                let cardmarketFoil = 0;
                let cardkingdomNormal = 0;
                let cardkingdomFoil = 0;
                let cardsphereNormal = 0;
                let cardsphereFoil = 0;
                let cardhoarderNormal = 0;
                let cardhoarderFoil = 0;

                if (paperPrices) {
                    // Get TCGPlayer prices
                    if (paperPrices.tcgplayer?.retail) {
                        const retail = paperPrices.tcgplayer.retail;
                        if (retail.normal) {
                            const dates = Object.keys(retail.normal);
                            if (dates.length > 0) {
                                const latestDate = dates.sort().pop()!;
                                tcgNormal = retail.normal[latestDate];
                            }
                        }
                        if (retail.foil) {
                            const dates = Object.keys(retail.foil);
                            if (dates.length > 0) {
                                const latestDate = dates.sort().pop()!;
                                tcgFoil = retail.foil[latestDate];
                            }
                        }
                    }

                    // Get Cardmarket prices (convert EUR to USD)
                    if (paperPrices.cardmarket?.retail) {
                        const retail = paperPrices.cardmarket.retail;
                        const isEUR = paperPrices.cardmarket.currency === 'EUR';
                        const rate = isEUR ? 1.1 : 1; // EUR to USD conversion
                        if (retail.normal) {
                            const dates = Object.keys(retail.normal);
                            if (dates.length > 0) {
                                const latestDate = dates.sort().pop()!;
                                cardmarketNormal = retail.normal[latestDate] * rate;
                            }
                        }
                        if (retail.foil) {
                            const dates = Object.keys(retail.foil);
                            if (dates.length > 0) {
                                const latestDate = dates.sort().pop()!;
                                cardmarketFoil = retail.foil[latestDate] * rate;
                            }
                        }
                    }

                    // Get Card Kingdom prices
                    if (paperPrices.cardkingdom?.retail) {
                        const retail = paperPrices.cardkingdom.retail;
                        if (retail.normal) {
                            const dates = Object.keys(retail.normal);
                            if (dates.length > 0) {
                                const latestDate = dates.sort().pop()!;
                                cardkingdomNormal = retail.normal[latestDate];
                            }
                        }
                        if (retail.foil) {
                            const dates = Object.keys(retail.foil);
                            if (dates.length > 0) {
                                const latestDate = dates.sort().pop()!;
                                cardkingdomFoil = retail.foil[latestDate];
                            }
                        }
                    }

                    // Get Cardsphere prices
                    if (paperPrices.cardsphere?.retail) {
                        const retail = paperPrices.cardsphere.retail;
                        if (retail.normal) {
                            const dates = Object.keys(retail.normal);
                            if (dates.length > 0) {
                                const latestDate = dates.sort().pop()!;
                                cardsphereNormal = retail.normal[latestDate];
                            }
                        }
                        if (retail.foil) {
                            const dates = Object.keys(retail.foil);
                            if (dates.length > 0) {
                                const latestDate = dates.sort().pop()!;
                                cardsphereFoil = retail.foil[latestDate];
                            }
                        }
                    }
                }

                // Get MTGO prices
                if (priceInfo.mtgo?.cardhoarder?.retail) {
                    const retail = priceInfo.mtgo.cardhoarder.retail;
                    if (retail.normal) {
                        const dates = Object.keys(retail.normal);
                        if (dates.length > 0) {
                            const latestDate = dates.sort().pop()!;
                            cardhoarderNormal = retail.normal[latestDate];
                        }
                    }
                    if (retail.foil) {
                        const dates = Object.keys(retail.foil);
                        if (dates.length > 0) {
                            const latestDate = dates.sort().pop()!;
                            cardhoarderFoil = retail.foil[latestDate];
                        }
                    }
                }

                // Use TCGPlayer as the default price if available, otherwise use the first non-zero price
                const normalPrice = tcgNormal || cardmarketNormal || cardkingdomNormal || cardsphereNormal || cardhoarderNormal || 0;
                const foilPrice = tcgFoil || cardmarketFoil || cardkingdomFoil || cardsphereFoil || cardhoarderFoil || 0;

                // Only add cards that have at least one price
                if (normalPrice > 0 || foilPrice > 0) {
                    priceData[uuid] = {
                        normal: normalPrice,
                        foil: foilPrice,
                        tcg_normal: tcgNormal,
                        tcg_foil: tcgFoil,
                        cardmarket_normal: cardmarketNormal,
                        cardmarket_foil: cardmarketFoil,
                        cardkingdom_normal: cardkingdomNormal,
                        cardkingdom_foil: cardkingdomFoil,
                        cardsphere_normal: cardsphereNormal,
                        cardsphere_foil: cardsphereFoil,
                        cardhoarder_normal: cardhoarderNormal,
                        cardhoarder_foil: cardhoarderFoil
                    };
                }
            }

            // Only import if we have prices in the batch
            if (Object.keys(priceData).length > 0) {
                // console.log(`[PriceData] Importing batch of ${Object.keys(priceData).length} card prices...`);
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