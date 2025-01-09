import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { scryfallService } from '../../services/ScryfallService';
import { databaseService } from '../../services/DatabaseService';
import { searchLorcanaCards, getLorcanaCardWithPrice, markCardAsCollected, initializeLorcanaDatabase, listAllCardNames, clearLorcanaDatabase, reloadLorcanaCards, getOrCreateLorcanaSetCollection, addCardToLorcanaCollection } from '../../services/LorcanaService';
import CardList from '../../components/CardList';
import CardScanner from '../../components/CardScanner';
import type { ExtendedCard } from '../../types/card';
import type { LorcanaCard } from '../../types/lorcana';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import CollectionSelector from '../../components/CollectionSelector';
import type { Collection } from '../../services/DatabaseService';
import LorcanaCardList from '../../components/LorcanaCardList';
import { CommonActions } from '@react-navigation/native';

type PriceLookupScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'PriceLookup'>;
};

type SelectedCard = ExtendedCard | LorcanaCard;
type ScannedCard = Omit<ExtendedCard, 'type'> & { type: 'MTG' | 'Lorcana' };

const SCAN_COOLDOWN_MS = 1000; // 1 second cooldown between scans
const RECENT_SCANS_CLEAR_INTERVAL = 30000; // Clear recent scans every 30 seconds

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
    const lastScannedRef = useRef<{
        text: string;
        timestamp: number;
    } | null>(null);
    const recentScansRef = useRef<Set<string>>(new Set());

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
        console.log('[PriceLookupScreen] Switching to MTG scan mode');
        setIsLorcanaScan(false);
        setIsCameraActive(true);
    };

    // Clear recent scans periodically
    useEffect(() => {
        const interval = setInterval(() => {
            recentScansRef.current.clear();
        }, RECENT_SCANS_CLEAR_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    const handleScan = async (text: string) => {
        if (!text?.trim() || text.length < 3) return;

        const normalizedText = text.toLowerCase().trim();
        console.log(`[PriceLookupScreen] Scan detected: ${text} (normalized: ${normalizedText})`);
        console.log(`[PriceLookupScreen] Scan mode: ${isLorcanaScan ? 'Lorcana' : 'MTG'}`);

        // Check if we've seen this text very recently (within cooldown)
        const now = Date.now();
        if (lastScannedRef.current) {
            const timeSinceLastScan = now - lastScannedRef.current.timestamp;
            // Only apply cooldown if it's the exact same text
            if (timeSinceLastScan < SCAN_COOLDOWN_MS && lastScannedRef.current.text === normalizedText) {
                console.log('[PriceLookupScreen] Scan ignored - within cooldown period');
                return; // Still in cooldown period for this exact text
            }
        }

        // Set the last scanned reference immediately to prevent duplicate processing
        lastScannedRef.current = { text: normalizedText, timestamp: now };

        try {
            if (isLorcanaScan) {
                console.log('[PriceLookupScreen] Searching Lorcana database...');
                const lorcanaResults = await searchLorcanaCards(text);
                console.log(`[PriceLookupScreen] Found ${lorcanaResults?.length || 0} Lorcana results`);

                if (lorcanaResults && lorcanaResults.length > 0) {
                    const card = lorcanaResults[0];
                    const cardWithPrice = await getLorcanaCardWithPrice(card.Unique_ID);
                    
                    if (cardWithPrice) {
                        const scannedCard: ScannedCard = {
                            id: cardWithPrice.Unique_ID,
                            uuid: cardWithPrice.Unique_ID,
                            name: cardWithPrice.Name || cardWithPrice.name,
                            setName: cardWithPrice.Set_Name || cardWithPrice.set_name,
                            setCode: cardWithPrice.Set_ID || cardWithPrice.set_id || '',
                            collectorNumber: String(cardWithPrice.Card_Num || cardWithPrice.card_num),
                            imageUris: { normal: cardWithPrice.Image || cardWithPrice.image },
                            prices: {
                                usd: cardWithPrice.price_usd || cardWithPrice.prices?.usd || null,
                                usdFoil: cardWithPrice.price_usd_foil || cardWithPrice.prices?.usd_foil || null
                            },
                            type: 'Lorcana',
                            purchaseUrls: {},
                            legalities: {},
                            scannedAt: now,
                            rarity: cardWithPrice.Rarity || cardWithPrice.rarity
                        };

                        // Add to scanned cards list
                        setScannedCards(prevCards => {
                            // Check for duplicates
                            const isDuplicate = prevCards.some(card => 
                                card.id === scannedCard.id && 
                                (card.scannedAt || 0) > now - SCAN_COOLDOWN_MS
                            );
                            if (isDuplicate) return prevCards;
                            return [scannedCard, ...prevCards];
                        });

                        // Update total price
                        setTotalPrice(prevTotal => {
                            const cardPrice = scannedCard.prices?.usd ? Number(scannedCard.prices.usd) : 0;
                            return prevTotal + cardPrice;
                        });

                        // Add to set collection
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

                                    // Show toast notification
                                    if (Platform.OS === 'android') {
                                        ToastAndroid.show(`Added ${cardWithPrice.Name}`, ToastAndroid.SHORT);
                                    }

                                    // Keep scanning - removed navigation to Collection tab
                                    console.log('[PriceLookupScreen] Card added, continuing scan...');
                                } else {
                                    console.error('[PriceLookupScreen] Failed to create set collection');
                                }
                            } catch (error) {
                                console.error('[PriceLookupScreen] Error adding to set collection:', error);
                            }
                        }

                        // Mark as collected
                        await markCardAsCollected(cardWithPrice.Unique_ID);
                    }
                }
            } else {
                // MTG card scanning
                const searchResponse = await scryfallService.searchCards(text, 1);
                const foundCards = searchResponse.data;

                if (foundCards.length > 0) {
                    const newCard = foundCards[0];

                    // Double check we haven't just added this card (race condition check)
                    const lastFewCards = scannedCards.slice(0, 3);
                    const isDuplicate = lastFewCards.some(card => {
                        const timeDiff = now - (card.scannedAt || 0);
                        return card.name.toLowerCase() === newCard.name.toLowerCase() && timeDiff < SCAN_COOLDOWN_MS;
                    });

                    if (isDuplicate) {
                        return;
                    }

                    const cardWithUuid = await databaseService.addToCache(newCard);

                    if (!cardWithUuid.uuid) {
                        throw new Error('Failed to generate UUID for card');
                    }

                    const scannedCard: ScannedCard = {
                        ...cardWithUuid,
                        type: 'MTG',
                        scannedAt: now
                    };

                    await databaseService.addToScanHistory(scannedCard);

                    // Add to set collection
                    if (scannedCard.uuid) {
                        const setCode = scannedCard.setCode || 'UNKNOWN';
                        const setName = scannedCard.setName || setCode;
                        const setCollectionId = await databaseService.getOrCreateSetCollection(setCode, setName);
                        await databaseService.addCardToCollection(scannedCard.uuid, setCollectionId);
                    }

                    setScannedCards(prevCards => [scannedCard, ...prevCards]);

                    setTotalPrice(prevTotal => {
                        const cardPrice = scannedCard.prices?.usd ? Number(scannedCard.prices.usd) : 0;
                        return prevTotal + cardPrice;
                    });

                    if (Platform.OS === 'android') {
                        ToastAndroid.show(`Added ${scannedCard.name}`, ToastAndroid.SHORT);
                    }
                }
            }
        } catch (error) {
            // On error, clear the last scanned reference to allow retry
            lastScannedRef.current = null;
            console.error('Error processing scan:', error);
            if (error instanceof Error && !error.message.includes('404')) {
                Alert.alert('Error', 'Failed to process scan. Please try again.');
            }
        }
    };

    const handleScanError = (error: Error) => {
        Alert.alert('Scan Error', error.message);
        setIsCameraActive(false);
    };

    const handleCardPress = (card: SelectedCard) => {
        setIsScanningPaused(true);
        setSelectedCard(card);
        setIsCardDetailsVisible(true);
    };

    const handleCloseCardDetails = () => {
        setIsCardDetailsVisible(false);
        setSelectedCard(null);
        setIsScanningPaused(false);
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
        console.log('[PriceLookupScreen] Switching to Lorcana scan mode');
        setIsLorcanaScan(true);
        setIsCameraActive(true);
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

    const renderScannedCard = ({ item }: { item: ScannedCard }) => (
        <TouchableOpacity
            style={styles.scannedCardItem}
            onPress={() => handleCardPress(item as ExtendedCard)}
            onLongPress={() => handleAddToCollection(item as ExtendedCard)}
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
                onTextDetected={handleScan}
                onError={handleScanError}
                scannedCards={scannedCards}
                totalPrice={totalPrice}
                onCardPress={handleCardPress}
                isPaused={isScanningPaused}
            />
            <View style={styles.scanModeIndicator}>
                <Text style={styles.scanModeText}>
                    {isLorcanaScan ? 'Scanning Lorcana Cards' : 'Scanning MTG Cards'}
                </Text>
            </View>
            {scannedCards.length > 0 && (
                <View style={styles.scannedCardsContainer}>
                    <FlatList<ScannedCard>
                        data={scannedCards}
                        renderItem={renderScannedCard}
                        keyExtractor={keyExtractor}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.scannedCardsList}
                        contentContainerStyle={{ paddingHorizontal: 5 }}
                    />
                </View>
            )}
        </View>
    );

    const renderCardDetailsModal = () => (
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
                </View>
                {selectedCard && (
                    'Name' in selectedCard ? (
                        <LorcanaCardList
                            cards={[selectedCard]}
                            isLoading={false}
                            onCardPress={() => {}}
                            onAddToCollection={(card) => handleAddToCollection(card)}
                        />
                    ) : (
                        <CardList
                            cards={[{ ...selectedCard, isExpanded: true }]}
                            isLoading={false}
                            onAddToCollection={(card) => handleAddToCollection(card)}
                        />
                    )
                )}
            </SafeAreaView>
        </Modal>
    );

    useEffect(() => {
        console.log(`[PriceLookupScreen] Scan mode changed: ${isLorcanaScan ? 'Lorcana' : 'MTG'}`);
    }, [isLorcanaScan]);

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
                        style={styles.scanButton}
                        onPress={handleScanPress}
                    >
                        <Icon name="camera" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.scanButton, { marginLeft: 10, backgroundColor: '#4a148c' }]}
                        onPress={handleLorcanaScan}
                    >
                        <Icon name="cards" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.scanButton, { marginLeft: 10, backgroundColor: '#d32f2f' }]}
                        onPress={handleClearLorcanaDB}
                    >
                        <Icon name="database-remove" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.scanButton, { marginLeft: 10, backgroundColor: '#388e3c' }]}
                        onPress={handleReloadLorcanaCards}
                        disabled={isLoading}
                    >
                        <Icon name="database-sync" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
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
                    <View style={styles.modalHeader}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setIsCameraActive(false)}
                        >
                            <Icon name="close" size={24} color="#666" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Scan Card</Text>
                    </View>
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
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    searchContainer: {
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    inputContainer: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    input: {
        flex: 1,
        height: 48,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        paddingHorizontal: 16,
        fontSize: 16,
        marginRight: 8,
    },
    searchButton: {
        width: 48,
        height: 48,
        backgroundColor: '#2196F3',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchButtonDisabled: {
        backgroundColor: '#B0BEC5',
    },
    scanButton: {
        flexDirection: 'row',
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 8,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    closeButton: {
        padding: 8,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '500',
        marginLeft: 16,
    },
    cameraContainer: {
        flex: 1,
        position: 'relative',
    },
    scannedCardsContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        paddingVertical: 10,
    },
    scannedCardsList: {
        paddingHorizontal: 10,
    },
    scannedCardItem: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 8,
        marginHorizontal: 5,
        padding: 10,
        width: 150,
    },
    scannedCardContent: {
        alignItems: 'center',
    },
    cardName: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
        textAlign: 'center',
        marginBottom: 4,
    },
    cardPrice: {
        fontSize: 14,
        color: '#2196F3',
        fontWeight: 'bold',
    },
    buttonContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    scanModeIndicator: {
        position: 'absolute',
        top: 20,
        left: 0,
        right: 0,
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingVertical: 5,
    },
    scanModeText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
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
});

export default PriceLookupScreen; 