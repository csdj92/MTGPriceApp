import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Alert,
    Modal,
    SafeAreaView,
    FlatList,
    ActivityIndicator,
    BackHandler,
    Platform,
    ToastAndroid,
    Linking,
    NativeModules
} from 'react-native';
import { scryfallService } from '../../services/ScryfallService';
import { databaseService } from '../../services/DatabaseService';
import { searchLorcanaCards, getLorcanaCardWithPrice, markCardAsCollected, initializeLorcanaDatabase, listAllCardNames, clearLorcanaDatabase, reloadLorcanaCards, getOrCreateLorcanaSetCollection, addCardToLorcanaCollection } from '../../services/LorcanaService';
import { CardProcessingService, VerificationStatus } from '../../services/CardProcessingService';
import CardList from '../../components/CardList';
import CardScanner from '../../components/CardScanner';
import CardVersionChecker from '../../components/price-lookup/CardVersionChecker';
import type { ExtendedCard, OcrResult, ScannedCard } from '../../types/card';
import type { LorcanaCard, PartialLorcanaCard, PartialLorcanaCardWithPrice } from '../../types/lorcana';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import CollectionSelector from '../../components/CollectionSelector';
import type { Collection } from '../../services/DatabaseService';
import LorcanaCardList from '../../components/LorcanaCardList';
import { CommonActions } from '@react-navigation/native';
import LorcanaCardSelectionModal from '../../components/LorcanaCardSelectionModal';
import CameraTest from '../../components/test';
import { Camera } from 'react-native-vision-camera';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { LiveOcrModule } from '../../types/NativeModules';
import { CameraService } from '../../services/CameraService';
import { Logger } from '../../utils/logger';
import ZoomControls from '../../components/price-lookup/ZoomControls';
import CameraControls from '../../components/price-lookup/CameraControls';
import ScanHeaderInfo from '../../components/price-lookup/ScanHeaderInfo';
import ScannedCardsList from '../../components/price-lookup/ScannedCardsList';
import VariationsTab from '../../components/CardDetail/VariationsTab';
const Icon = MaterialCommunityIcons as any; // Temporary type assertion

type PriceLookupScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'PriceLookup'>;
};

type SelectedCard = ExtendedCard | LorcanaCard;
// Define LorcanaCardType for compatibility with the Lorcana components
type LorcanaCardType = LorcanaCard | PartialLorcanaCard | PartialLorcanaCardWithPrice;

const SCAN_COOLDOWN_MS = 1750; // 1.75 second cooldown between scans
const RECENT_SCANS_CLEAR_INTERVAL = 30000; // Clear recent scans every 30 seconds
const MAX_RECENT_SCANS = 10; // Maximum number of recent scans to track

const PriceLookupScreen: React.FC<PriceLookupScreenProps> = ({ navigation }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<SelectedCard[]>([]);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [isCollectionSelectorVisible, setIsCollectionSelectorVisible] = useState(false);
    const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
    const [isCardDetailsVisible, setIsCardDetailsVisible] = useState(false);
    const [isScanningPaused, setIsScanningPaused] = useState(false);
    const [isLorcanaScan, setIsLorcanaScan] = useState(false);
    const [multipleCardsModalVisible, setMultipleCardsModalVisible] = useState(false);
    const [multipleCardsFound, setMultipleCardsFound] = useState<LorcanaCard[]>([]);
    const lastScannedRef = useRef<{
        text: string;
        timestamp: number;
    } | null>(null);
    const recentScansRef = useRef<Set<string>>(new Set());
    const [cameraPermission, setCameraPermission] = useState<'not-determined' | 'granted' | 'denied'>('not-determined');
    const [useClassifier, setUseClassifier] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
        isVerifying: false,
        card: null,
        originalText: '',
        verificationScore: 0,
        isVerified: null
    });
    const [showVersionSelector, setShowVersionSelector] = useState(false);
    const [cardVersions, setCardVersions] = useState<ExtendedCard[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<ExtendedCard | null>(null);

    // Handle back button press
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (isCameraActive) {
                setIsCameraActive(false);
                return true;
            }
            return false;
        });

        return () => backHandler.remove();
    }, [isCameraActive]);

    useEffect(() => {
        loadScanHistory();
        // Initialize Lorcana database
        const initLorcanaDB = async () => {
            try {
                console.log('[PriceLookupScreen] Initializing Lorcana database...');
                await initializeLorcanaDatabase();
                console.log('[PriceLookupScreen] Lorcana database initialized');
                // List some card names to verify database content
                await listAllCardNames();
            } catch (error) {
                console.error('Error initializing Lorcana database:', error);
                Alert.alert(
                    'Database Error',
                    'Failed to initialize Lorcana database. Lorcana card scanning may not work correctly. Would you like to retry?',
                    [
                        {
                            text: 'Retry',
                            onPress: () => initLorcanaDB()
                        },
                        {
                            text: 'Cancel',
                            style: 'cancel'
                        }
                    ]
                );
            }
        };
        initLorcanaDB();
    }, []);

    const loadScanHistory = async () => {
        try {
            const history = await databaseService.getScanHistory();
            if (Array.isArray(history)) {
                setScannedCards(history.map(card => ({ ...card, type: 'MTG' })));
                updateTotalPrice(history);
            }
        } catch (error) {
            console.error('Error loading scan history:', error);
            setScannedCards([]);
            setTotalPrice(0);
        }
    };

    const updateTotalPrice = (cards: ExtendedCard[]) => {
        if (!Array.isArray(cards)) return;
        const total = cards.reduce((sum, card) => {
            const price = card.prices?.usd ? Number(card.prices.usd) : 0;
            return sum + price;
        }, 0);
        setTotalPrice(total);
    };

    const handleManualSearch = async () => {
        if (!searchQuery.trim()) return;

        setIsLoading(true);
        try {
            if (isLorcanaScan) {
                const results = await searchLorcanaCards(searchQuery);
                setSearchResults(results);
            } else {
                const { data } = await scryfallService.searchCards(searchQuery);
                setSearchResults(data);
            }
        } catch (error) {
            console.error('Error searching cards:', error);
            Alert.alert('Error', 'Failed to search cards');
            setSearchResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleScanPress = () => {
        Logger.debug('Switching to MTG scan mode');
        setIsLorcanaScan(false);
        setIsCameraActive(true);
        
        // Set the native module to MTG scan mode
        CameraService.setLorcanaScanMode(false);
    };

    // Clear recent scans periodically
    useEffect(() => {
        const interval = setInterval(() => {
            recentScansRef.current.clear();
        }, RECENT_SCANS_CLEAR_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    const handleScan = async (result: OcrResult) => {
        // Check if scan should be ignored
        if (isScanningPaused) {
            return;
        }
        
        if (!result?.text?.trim()) {
            Logger.debug('Skipping empty OCR result');
            return;
        }
        
        Logger.debug(`Scan result: ${result.text} (isLorcana: ${result.isLorcana})`);

        try {
            // Use CardProcessingService to handle OCR processing 
            const scannedCard = await CardProcessingService.processOcrResult(result);
            
            // If no card was found or verification failed, just return
            if (!scannedCard) {
                return;
            }
            
            // Add the card to our state
            addScannedCard(scannedCard);
            
            // For Lorcana cards, additional processing may be needed
            if (scannedCard.type === 'Lorcana') {
                await handleLorcanaCollection(scannedCard as any); // Type cast as any since the types might not match exactly
            }
        } catch (error) {
            Logger.error('Error processing scan:', error);
            if (error instanceof Error && !error.message.includes('404')) {
                Alert.alert('Error', 'Failed to process scan. Please try again.');
            }
        }
    };

    const addScannedCard = async (scannedCard: ScannedCard) => {
        // First check if this is a known card (avoid duplicates)
        const existing = scannedCards.find(c => 
            c.name === scannedCard.name && 
            c.setCode === scannedCard.setCode
        );
        
        if (existing) {
            ToastAndroid.show('Card already scanned', ToastAndroid.SHORT);
            return;
        }
        
        // For MTG cards, check if there are different versions
        if (scannedCard.type === 'MTG') {
            const hasVersions = await checkCardVersions(scannedCard as ExtendedCard);
            if (hasVersions) {
                // Will be handled by version selector
                return;
            }
        }
        
        // Original card addition logic
        const newScannedCards = [...scannedCards, scannedCard];
        setScannedCards(newScannedCards);
        updateTotalPrice(newScannedCards as ExtendedCard[]);
    };

    const handleLorcanaCollection = async (cardWithPrice: LorcanaCard) => {
        if (cardWithPrice.Set_ID && cardWithPrice.Set_Name) {
            try {
                console.log('[PriceLookupScreen] Adding to Lorcana set collection...');
                const setCollectionId = await getOrCreateLorcanaSetCollection(
                    cardWithPrice.Set_ID,
                    cardWithPrice.Set_Name
                );
                if (setCollectionId) {
                    await addCardToLorcanaCollection(cardWithPrice.Unique_ID, setCollectionId);
                    console.log('[PriceLookupScreen] Successfully added to set collection');
                    await markCardAsCollected(cardWithPrice.Unique_ID);
                }
            } catch (error) {
                console.error('[PriceLookupScreen] Error adding to set collection:', error);
            }
        }
    };

    const handleLorcanaCardSelection = async (selectedLorcanaCard: LorcanaCard) => {
        setMultipleCardsModalVisible(false);
        
        try {
            // Create an OcrResult object to pass to the processing service
            const ocrResult: OcrResult = {
                text: selectedLorcanaCard.Name,
                mainName: selectedLorcanaCard.Name,
                subtype: null,
                isLorcana: true
            };
            
            // Process the card using CardProcessingService
            const scannedCard = await CardProcessingService.processOcrResult(ocrResult);
            
            if (scannedCard) {
                addScannedCard(scannedCard);
            }
        } catch (error) {
            Logger.error('Error processing selected Lorcana card:', error);
        }
        
        // Add small delay before resuming to ensure modal is fully closed
        setTimeout(() => {
            setIsScanningPaused(false);
        }, 100);
    };

    const handleScanError = (error: Error) => {
        Logger.error('Camera scan error:', error);
        
        // Show feedback to user
        if (Platform.OS === 'android') {
            ToastAndroid.show(`Scanner error: ${error.message}`, ToastAndroid.LONG);
        } else {
            Alert.alert('Scanner Error', error.message);
        }
        
        // Create a delay before allowing scanning again
        setIsScanningPaused(true);
        setTimeout(() => {
            setIsScanningPaused(false);
        }, 2000);
    };

    const handleCardPress = (card: SelectedCard | LorcanaCardType) => {
        const cardName = 'name' in card ? card.name : (card.Name || 'Unknown Card');
        Logger.debug(`Card selected: ${cardName}`);
        
        if ('Unique_ID' in card) {
            // Handle Lorcana card
            setSelectedCard(card as LorcanaCard);
        } else {
            // Handle MTG card
            setSelectedCard(card as ExtendedCard);
        }
        setIsCardDetailsVisible(true);
    };

    const handleCloseCardDetails = () => {
        setIsCardDetailsVisible(false);
        setSelectedCard(null);
        setIsScanningPaused(false);
    };

    const handleAddToLorcanaCollection = (card: LorcanaCardType) => {
        if (card.Unique_ID) {
            markCardAsCollected(card.Unique_ID);
            ToastAndroid.show('Card added to collection', ToastAndroid.SHORT);
        } else {
            ToastAndroid.show('Could not add card to collection', ToastAndroid.SHORT);
        }
    };

    const handleAddToCollection = (card: SelectedCard) => {
        setIsCardDetailsVisible(false);
        setSelectedCard(card);
        setIsCollectionSelectorVisible(true);
        setIsScanningPaused(true);
    };

    const handleSelectCollection = async (collection: Collection) => {
        if (!selectedCard) return;

        try {
            if ('name' in selectedCard) {
                // Handle MTG card
                let cardToAdd = selectedCard;
                if (!cardToAdd.uuid) {
                    cardToAdd = await databaseService.addToCache(selectedCard);
                    if (!cardToAdd.uuid) {
                        throw new Error('Failed to generate UUID for card');
                    }
                }

                await databaseService.addCardToCollection(cardToAdd.uuid, collection.id);
                await databaseService.markScannedCardAddedToCollection(cardToAdd.id, collection.id);
                Alert.alert('Success', `Added ${cardToAdd.name} to ${collection.name}`, [
                    {
                        text: 'OK',
                        onPress: () => {
                            setIsCollectionSelectorVisible(false);
                            setSelectedCard(null);
                            setIsScanningPaused(false);
                        }
                    }
                ]);
            } else {
                // Handle Lorcana card
                Alert.alert('Success', `Added ${selectedCard.Name} to ${collection.name}`, [
                    {
                        text: 'OK',
                        onPress: () => {
                            setIsCollectionSelectorVisible(false);
                            setSelectedCard(null);
                            setIsScanningPaused(false);
                        }
                    }
                ]);
            }
        } catch (error) {
            console.error('Error adding card to collection:', error);
            Alert.alert('Error', 'Failed to add card to collection', [
                {
                    text: 'OK',
                    onPress: () => {
                        setIsCollectionSelectorVisible(false);
                        setSelectedCard(null);
                        setIsScanningPaused(false);
                    }
                }
            ]);
        }
    };

    const handleLorcanaScan = () => {
        Logger.debug('Switching to Lorcana scan mode');
        setIsLorcanaScan(true);
        setIsCameraActive(true);
        
        // Set the native module to Lorcana scan mode
        CameraService.setLorcanaScanMode(true);
    };

    const handleClearLorcanaDB = async () => {
        try {
            await clearLorcanaDatabase();
            Alert.alert('Success', 'Lorcana database cleared successfully');
        } catch (error) {
            console.error('Error clearing Lorcana database:', error);
            Alert.alert('Error', 'Failed to clear Lorcana database');
        }
    };

    const handleReloadLorcanaCards = async () => {
        try {
            setIsLoading(true);
            await reloadLorcanaCards();
            Alert.alert('Success', 'Lorcana cards reloaded successfully');
        } catch (error) {
            console.error('Error reloading Lorcana cards:', error);
            Alert.alert('Error', 'Failed to reload Lorcana cards');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCardCollection = (card: any) => {
        // Check if it's a Lorcana card or MTG card
        if ('Unique_ID' in card) {
            handleAddToLorcanaCollection(card as LorcanaCardType);
        } else {
            handleAddToCollection(card as SelectedCard);
        }
    };

    const renderScannedCard = ({ item }: { item: ScannedCard }) => (
        <TouchableOpacity
            style={styles.scannedCardItem}
            onPress={() => handleCardPress(item as ExtendedCard)}
            onLongPress={() => handleCardCollection(item as ExtendedCard)}
            activeOpacity={0.8}
            delayLongPress={500}
        >
            <View style={styles.scannedCardContent}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardPrice}>
                    ${(item.prices?.usd ? Number(item.prices.usd) : 0).toFixed(2)}
                </Text>
            </View>
        </TouchableOpacity>
    );

    const keyExtractor = (item: ScannedCard) => {
        if (item.scannedAt) {
            return `${item.uuid || item.id}-${item.scannedAt}`;
        }
        return `${item.uuid || item.id}-${Math.random().toString(36).substr(2, 9)}`;
    };

    const renderCameraContent = () => (
        <View style={styles.cameraContainer}>
            <CardScanner
                onTextDetected={(result: any) => {
                    // Adapt the result to match OcrResult type
                    const ocrResult: OcrResult = useClassifier 
                        ? {
                            text: result.text,
                            mainName: result.text,
                            subtype: '',
                            isLorcana: isLorcanaScan
                        } 
                        : {
                            // For LiveOcr results, preserve all properties including setCode and cardNumber
                            text: result.text,
                            mainName: result.mainName || result.text,
                            subtype: result.subtype || '',
                            isLorcana: isLorcanaScan,
                            setCode: result.setCode || null,
                            cardNumber: result.cardNumber || null
                        };
                    handleScan(ocrResult);
                }}
                onError={handleScanError}
                scannedCards={scannedCards}
                totalPrice={totalPrice}
                onCardPress={handleCardPress}
                isPaused={isScanningPaused}
                useClassifier={isLorcanaScan}
                cardVariations={showVersionSelector ? cardVersions : []}
                onVariationSelect={setSelectedVersion}
                selectedVariation={selectedVersion}
                onConfirmVariation={handleVersionConfirm}
            />
            
            {/* Card Version Checker */}
            <CardVersionChecker
                card={verificationStatus.card}
                originalText={verificationStatus.originalText}
                verificationScore={verificationStatus.verificationScore}
                isVerifying={verificationStatus.isVerifying}
                isVerified={verificationStatus.isVerified}
            />
            
            {/* Camera Controls using our new components */}
            <CameraControls 
                isScanning={!isScanningPaused}
                isLorcanaScan={isLorcanaScan}
                onToggleScan={() => setIsScanningPaused(!isScanningPaused)}
                onToggleLorcanaScan={() => setIsLorcanaScan(!isLorcanaScan)}
            />
            
            {/* Zoom Controls using our new component */}
            <ZoomControls 
                disabled={isScanningPaused}
            />
        </View>
    );

    const renderCardDetailsModal = () => {
        // Debug log to understand selected card structure
        if (selectedCard) {
            // Determine card type more reliably - check for specific Lorcana properties
            const isLorcanaCard = 
                ('Name' in selectedCard) || 
                // Check for Lorcana-specific properties
                ('Set_Num' in selectedCard) ||
                // Check if the card has imageUris with Lorcana URL patterns
                (selectedCard.imageUris?.normal && 
                 (selectedCard.imageUris.normal.includes('lorcast.io') || 
                  selectedCard.imageUris.normal.includes('lorcana')));
            
            console.log(`[renderCardDetailsModal] Selected card type: ${isLorcanaCard ? 'Lorcana' : 'MTG'}`);
            
            if (!isLorcanaCard) {
                console.log(`[renderCardDetailsModal] MTG card details: name=${selectedCard.name}, imageUrl=${selectedCard.imageUrl}, imageUris:`, selectedCard.imageUris);
            }
        }
        
        return (
            <Modal
                visible={isCardDetailsVisible}
                animationType="slide"
                onRequestClose={handleCloseCardDetails}
                transparent={false}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={handleCloseCardDetails} style={styles.closeButton}>
                            <Icon name="close" size={24} color="#666" />
                        </TouchableOpacity>
                        {selectedCard && (
                            <Text style={styles.modalHeaderTitle}>
                                {'Name' in selectedCard ? selectedCard.Name : selectedCard.name || 'Card Details'}
                            </Text>
                        )}
                    </View>
                    {selectedCard && (
                        <>
                            {/* Debug info to understand card structure */}
                            {__DEV__ && (
                                <View style={styles.debugInfo}>
                                    <Text>Card Type: {
                                        ('Name' in selectedCard || 
                                         'Set_Num' in selectedCard || 
                                         (selectedCard.imageUris?.normal && selectedCard.imageUris.normal.includes('lorcast.io'))) 
                                         ? 'Lorcana' : 'MTG'
                                    }</Text>
                                    <Text>Has Image: {'Name' in selectedCard 
                                        ? Boolean(selectedCard.Image) 
                                        : Boolean(selectedCard.imageUris?.normal || selectedCard.imageUris?.small || selectedCard.imageUrl)}
                                    </Text>
                                    {'name' in selectedCard && (
                                        <>
                                            <Text>imageUrl: {selectedCard.imageUrl || 'N/A'}</Text>
                                            <Text>imageUris?.normal: {selectedCard.imageUris?.normal || 'N/A'}</Text>
                                            <Text>imageUris?.small: {selectedCard.imageUris?.small || 'N/A'}</Text>
                                        </>
                                    )}
                                </View>
                            )}
                            
                            {('Name' in selectedCard || 
                              'Set_Num' in selectedCard || 
                              (selectedCard.imageUris?.normal && selectedCard.imageUris.normal.includes('lorcast.io'))) ? (
                                // Lorcana card
                                <LorcanaCardList
                                    cards={[
                                        'Name' in selectedCard ? selectedCard : {
                                            Name: selectedCard.name,
                                            Image: selectedCard.imageUris?.normal || selectedCard.imageUrl,
                                            // Add required Lorcana properties with fallback values
                                            Unique_ID: selectedCard.id,
                                            Set_Name: selectedCard.setName,
                                            Rarity: selectedCard.rarity || 'Unknown',
                                            Color: (selectedCard.colors && selectedCard.colors.length > 0) ? selectedCard.colors[0] : 'Unknown',
                                            Cost: parseInt(selectedCard.cmc?.toString() || '0', 10),
                                            Type: selectedCard.type || 'Unknown',
                                            // Additional properties that might be required
                                            Set_Num: parseInt(selectedCard.collectorNumber || '0', 10),
                                            Body_Text: selectedCard.text || '',
                                            Flavor_Text: selectedCard.flavorText || '',
                                            price_usd: selectedCard.prices?.usd,
                                            price_usd_foil: selectedCard.prices?.usdFoil
                                        } as LorcanaCard
                                    ]}
                                    isLoading={false}
                                    onCardPress={() => {}}
                                    onAddToCollection={(card) => handleCardCollection(card)}
                                />
                            ) : (
                                // MTG card - make sure we have all needed properties
                                <CardList
                                    cards={[{ 
                                        ...selectedCard, 
                                        isExpanded: true,
                                        // Ensure image URLs are available
                                        imageUris: selectedCard.imageUris || {
                                            normal: selectedCard.imageUrl,
                                            small: selectedCard.imageUrl
                                        }
                                    }]}
                                    isLoading={false}
                                    onCardPress={() => {}} // Don't re-trigger card press
                                    onAddToCollection={(card) => handleCardCollection(card)}
                                />
                            )}
                        </>
                    )}
                </SafeAreaView>
            </Modal>
        );
    };

    useEffect(() => {
        console.log(`[PriceLookupScreen] Scan mode changed: ${isLorcanaScan ? 'Lorcana' : 'MTG'}`);
    }, [isLorcanaScan]);

    // Listen for verification status updates
    useEffect(() => {
        const verificationEmitter = CardProcessingService.getVerificationEmitter();
        
        const handleVerificationUpdate = (status: VerificationStatus) => {
            Logger.debug(`Verification status update: isVerifying=${status.isVerifying}, isVerified=${status.isVerified}`);
            setVerificationStatus(status);
        };
        
        verificationEmitter.on('CardVerificationUpdate', handleVerificationUpdate);
        
        return () => {
            verificationEmitter.removeListener('CardVerificationUpdate', handleVerificationUpdate);
        };
    }, []);

    const handleVersionChange = (selectedCard: ExtendedCard) => {
        // Only update the selected version, don't reload the variations
        setSelectedVersion(selectedCard);
    };

    // Effect to handle scanning pause state updates
    useEffect(() => {
        // When version selector is shown, make sure camera is paused
        if (showVersionSelector) {
            setIsScanningPaused(true);
            // Show toast to let user know they need to select a version
            if (Platform.OS === 'android' && cardVersions.length > 0) {
                ToastAndroid.show('Please select a card version', ToastAndroid.SHORT);
            }
        }
    }, [showVersionSelector, cardVersions]);

    // Hide verification UI when variations are shown
    useEffect(() => {
        if (showVersionSelector && verificationStatus.isVerifying) {
            // Reset verification status when showing versions
            setVerificationStatus({
                isVerifying: false,
                card: null,
                originalText: '',
                verificationScore: 0,
                isVerified: null
            });
        }
    }, [showVersionSelector, verificationStatus.isVerifying]);

    const checkCardVersions = async (card: ExtendedCard) => {
        try {
            // Only check for versions for MTG cards
            if (card.type === 'MTG') {
                // Get versions from Scryfall
                const versions = await scryfallService.getCardVersions(card.name);
                
                if (versions && versions.length > 0) {
                    // Make sure we include the initially detected card in the list
                    // First check if the original card is already in the versions list
                    const originalCardInVersions = versions.some(v => 
                        v.id === card.id || 
                        (v.setCode === card.setCode && v.collectorNumber === card.collectorNumber)
                    );
                    
                    // If it's not already in the list, add it
                    if (!originalCardInVersions) {
                        versions.unshift({
                            ...card,
                            isOriginalScan: true // Mark this as the original scan
                        });
                    } else {
                        // Mark the original card in the versions list
                        versions.forEach(v => {
                            if (v.id === card.id || 
                                (v.setCode === card.setCode && v.collectorNumber === card.collectorNumber)) {
                                v.isOriginalScan = true;
                            }
                        });
                    }
                    
                    if (versions.length > 1) {
                        Logger.debug(`Found ${versions.length} versions of card: ${card.name}`);
                        setCardVersions(versions);
                        setSelectedVersion(card); // Start with the original card selected
                        setIsScanningPaused(true);
                        setShowVersionSelector(true);
                        return true;
                    }
                }
            }
            return false;
        } catch (error) {
            Logger.error('Error checking card versions:', error);
            return false;
        }
    };

    const handleVersionConfirm = () => {
        if (selectedVersion) {
            // Create a ScannedCard from the selectedVersion
            const scannedCard: ScannedCard = {
                ...selectedVersion,
                type: 'MTG',
                scannedAt: Date.now()
            };
            
            // Add to scanned cards list
            const newScannedCards = [...scannedCards, scannedCard];
            setScannedCards(newScannedCards);
            updateTotalPrice(newScannedCards as ExtendedCard[]);
            
            // Show feedback to the user
            ToastAndroid.show(`Added ${selectedVersion.name} (${selectedVersion.setName})`, ToastAndroid.SHORT);
        }
        
        // Hide the selector and resume scanning
        setShowVersionSelector(false);
        setCardVersions([]);
        setSelectedVersion(null);
        setIsScanningPaused(false);
    };

    // Clear versions when camera is deactivated
    useEffect(() => {
        if (!isCameraActive) {
            setCardVersions([]);
            setSelectedVersion(null);
            setShowVersionSelector(false);
        }
    }, [isCameraActive]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.searchContainer}>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter card name..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={handleManualSearch}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="none"
                    />
                    <TouchableOpacity
                        style={[styles.searchButton, isLoading && styles.searchButtonDisabled]}
                        onPress={handleManualSearch}
                        disabled={isLoading || !searchQuery.trim()}
                    >
                        <Icon name="magnify" size={24} color="white" />
                    </TouchableOpacity>
                </View>
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={handleScanPress}
                    >
                        <Icon name="camera" size={24} color="#fff" />
                        <Text style={styles.actionButtonText}>MTG Scan</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#4a148c' }]}
                        onPress={handleLorcanaScan}
                    >
                        <Icon name="cards" size={24} color="#fff" />
                        <Text style={styles.actionButtonText}>Lorcana</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#d32f2f' }]}
                        onPress={handleClearLorcanaDB}
                    >
                        <Icon name="database-remove" size={24} color="#fff" />
                        <Text style={styles.actionButtonText}>Clear DB</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#388e3c' }]}
                        onPress={handleReloadLorcanaCards}
                        disabled={isLoading}
                    >
                        <Icon name="database-sync" size={24} color="#fff" />
                        <Text style={styles.actionButtonText}>Reload</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#388e3c' }]}
                        onPress={() => navigation.navigate('CameraTest')}
                        disabled={isLoading}
                    >
                        <Icon name="camera" size={24} color="#fff" />
                        <Text style={styles.actionButtonText}>React Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#FF9800' }]}
                        onPress={() => setUseClassifier(prev => !prev)}
                    >
                        <Icon name="robot" size={24} color="#fff" />
                        <Text style={styles.actionButtonText}>Classifier</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.statsContainer}>
                <View style={styles.statCard}>
                    <Icon name="cards-outline" size={32} color="#2196F3" />
                    <Text style={styles.statNumber}>{scannedCards.length}</Text>
                    <Text style={styles.statLabel}>Scanned Cards</Text>
                </View>
                
                <View style={styles.statCard}>
                    <Icon name="currency-usd" size={32} color="#4CAF50" />
                    <Text style={styles.statNumber}>${totalPrice.toFixed(2)}</Text>
                    <Text style={styles.statLabel}>Total Value</Text>
                </View>
                
                <View style={styles.statCard}>
                    <Icon name="clock-outline" size={32} color="#FF9800" />
                    <Text style={styles.statNumber}>
                        {scannedCards[0]?.scannedAt 
                            ? new Date(scannedCards[0].scannedAt).toLocaleTimeString() 
                            : '--:--'}
                    </Text>
                    <Text style={styles.statLabel}>Last Scan</Text>
                </View>
            </View>

            <View style={styles.scannedListContainer}>
                <View style={styles.scannedListHeader}>
                    <Text style={styles.sectionTitle}>Recently Scanned</Text>
                    {scannedCards.length > 0 && (
                        <TouchableOpacity 
                            style={styles.clearButton}
                            onPress={() => {
                                Alert.alert(
                                    'Clear Scanned Cards',
                                    'Are you sure you want to clear all scanned cards?',
                                    [
                                        {
                                            text: 'Cancel',
                                            style: 'cancel'
                                        },
                                        {
                                            text: 'Clear',
                                            style: 'destructive',
                                            onPress: async () => {
                                                await databaseService.clearScanHistory();
                                                setScannedCards([]);
                                                setTotalPrice(0);
                                            }
                                        }
                                    ]
                                );
                            }}
                        >
                            <Icon name="delete" size={20} color="#FF5252" />
                            <Text style={styles.clearButtonText}>Clear All</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <ScannedCardsList
                    cards={scannedCards}
                    isLoading={isLoading}
                    onCardPress={handleCardPress}
                    keyExtractor={keyExtractor}
                />
            </View>

            {isLoading ? (
                <ActivityIndicator style={styles.loader} size="large" color="#2196F3" />
            ) : searchResults.length > 0 ? (
                isLorcanaScan ? (
                    <LorcanaCardList
                        cards={searchResults as LorcanaCard[]}
                        isLoading={isLoading}
                        onCardPress={handleCardPress}
                    />
                ) : (
                    <CardList
                        cards={searchResults as ExtendedCard[]}
                        isLoading={isLoading}
                        onCardPress={handleCardPress}
                    />
                )
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No cards found</Text>
                </View>
            )}

            <Modal
                visible={isCameraActive}
                animationType="slide"
                onRequestClose={() => setIsCameraActive(false)}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <ScanHeaderInfo 
                        isLorcanaScan={isLorcanaScan}
                        scannedCardsCount={scannedCards.length}
                        totalPrice={totalPrice}
                        onClose={() => setIsCameraActive(false)}
                    />
                    {renderCameraContent()}
                </SafeAreaView>
            </Modal>

            <CollectionSelector
                visible={isCollectionSelectorVisible}
                onClose={() => {
                    setIsCollectionSelectorVisible(false);
                    setSelectedCard(null);
                }}
                onSelectCollection={handleSelectCollection}
            />

            {renderCardDetailsModal()}

            <LorcanaCardSelectionModal
                visible={multipleCardsModalVisible}
                cards={multipleCardsFound}
                onSelect={(card) => {
                    if (handleLorcanaCardSelection) {
                        handleLorcanaCardSelection(card);
                    } else {
                        // Fallback if handler is undefined
                        console.warn('handleLorcanaCardSelection is undefined');
                        setMultipleCardsModalVisible(false);
                        setTimeout(() => {
                            setIsScanningPaused(false);
                        }, 100);
                    }
                }}
                onClose={() => {
                    setMultipleCardsModalVisible(false);
                    // Add small delay before resuming camera to ensure modal is fully closed
                    setTimeout(() => {
                        setIsScanningPaused(false);
                    }, 100);
                }}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    searchContainer: {
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        marginBottom: 12,
        alignItems: 'center',
    },
    input: {
        flex: 1,
        height: 48,
        backgroundColor: '#f5f5f5',
        borderRadius: 24,
        paddingHorizontal: 20,
        fontSize: 16,
        marginRight: 8,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    searchButton: {
        width: 48,
        height: 48,
        backgroundColor: '#2196F3',
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    searchButtonDisabled: {
        backgroundColor: '#B0BEC5',
    },
    scanButton: {
        flexDirection: 'row',
        backgroundColor: '#4CAF50',
        borderRadius: 24,
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        flex: 1,
        maxWidth: 80,
    },
    scanButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 8,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#2196F3',
    },
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanningInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    cameraIcon: {
        marginRight: 8,
    },
    scanningText: {
        color: '#fff',
        fontSize: 16,
    },
    counterBadge: {
        position: 'absolute',
        right: 0,
        backgroundColor: '#2196F3',
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 16,
    },
    counterText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    cameraContainer: {
        flex: 1,
        backgroundColor: 'black',
    },
    scannedCardsContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        paddingVertical: 12,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    scannedCardsList: {
        paddingHorizontal: 10,
    },
    scannedCardItem: {
        backgroundColor: 'white',
        borderRadius: 12,
        marginHorizontal: 6,
        padding: 12,
        width: 160,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
    },
    scannedCardContent: {
        alignItems: 'center',
    },
    cardName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1a1a1a',
        textAlign: 'center',
        marginBottom: 6,
    },
    cardPrice: {
        fontSize: 16,
        color: '#2196F3',
        fontWeight: '700',
    },
    buttonContainer: {
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: 12,
    },
    scanModeIndicator: {
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(33, 150, 243, 0.9)',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        gap: 8,
    },
    scanModeText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    loader: {
        marginTop: 20,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#666',
        textAlign: 'center',
    },
    actionButton: {
        flexDirection: 'column',
        backgroundColor: '#4CAF50',
        borderRadius: 12,
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        flex: 1,
        minHeight: 80,
    },
    actionButtonText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
        textAlign: 'center',
    },
    statsContainer: {
        flexDirection: 'row',
        padding: 16,
        justifyContent: 'space-between',
        backgroundColor: 'white',
        marginTop: 16,
        marginHorizontal: 16,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    statCard: {
        flex: 1,
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    statNumber: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginTop: 8,
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    scannedListContainer: {
        flex: 1,
        backgroundColor: 'white',
        margin: 16,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    scannedListHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1a1a1a',
    },
    clearButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
    },
    clearButtonText: {
        color: '#FF5252',
        marginLeft: 4,
        fontSize: 14,
        fontWeight: '500',
    },
    scannedList: {
        flex: 1,
    },
    scannedListContent: {
        padding: 8,
    },
    scannedListItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    cardInfo: {
        flex: 1,
    },
    cardNameText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#1a1a1a',
    },
    cardSetText: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    cardPriceContainer: {
        alignItems: 'flex-end',
    },
    priceText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2196F3',
    },
    timeText: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
    },
    emptyListContainer: {
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyListText: {
        marginTop: 8,
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    cameraControls: {
        position: 'absolute',
        right: 20,
        bottom: 100,
        gap: 16,
    },
    controlButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'white',
    },
    zoomControls: {
        position: 'absolute',
        left: 20,
        top: '50%',
        transform: [{ translateY: -50 }],
        gap: 16,
    },
    zoomButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'white',
    },
    modalHeaderTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 12,
    },
    debugInfo: {
        padding: 12,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
        marginLeft: 12,
    },
    versionSelectorContainer: {
        flex: 1,
        padding: 16,
        backgroundColor: '#1a1a1a',
    },
    confirmButton: {
        backgroundColor: '#2196F3',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 16,
    },
    confirmButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    versionSelectorHelp: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
});

export default PriceLookupScreen; 