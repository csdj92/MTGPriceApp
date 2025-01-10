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
import type { ExtendedCard, OcrResult } from '../../types/card';
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

    const handleScan = async (result: OcrResult) => {
        console.log('[PriceLookupScreen] -------------Handling scan----------------:', result);
        if (!result?.text?.trim() || result.text.length < 3) return;

        const normalizedText = result.text.toLowerCase().trim();
        console.log(`[PriceLookupScreen] Scan detected: ${result.text} (normalized: ${normalizedText})`);
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
            // Use the screen's mode instead of the OCR result's flag
            if (isLorcanaScan) {
                console.log('[PriceLookupScreen] Searching Lorcana database...');
                // Pass mainName and subtype separately
                const lorcanaResults = await searchLorcanaCards(result.mainName, result.subtype);
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
                            hasNonFoil: true,
                            hasFoil: true,
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
                const searchResponse = await scryfallService.searchCards(result.text, 1);
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
            
          

            {/* Camera Controls */}
            <View style={styles.cameraControls}>
                <TouchableOpacity 
                    style={styles.cameraButton}
                    onPress={() => setIsScanningPaused(!isScanningPaused)}
                >
                    <Icon 
                        name={isScanningPaused ? "play" : "pause"} 
                        size={24} 
                        color="white" 
                    />
                </TouchableOpacity>
                
                <TouchableOpacity 
                    style={styles.cameraButton}
                    onPress={() => setIsLorcanaScan(!isLorcanaScan)}
                >
                    <Icon 
                        name="swap-horizontal" 
                        size={24} 
                        color="white" 
                    />
                </TouchableOpacity>
            </View>

            {/* Recent Scans */}
            <View style={styles.recentScansContainer}>
                <View style={styles.recentScansHeader}>
                    <Text style={styles.recentScansTitle}>Recent Scans</Text>
                    <Text style={styles.totalPriceText}>
                        Total: ${totalPrice.toFixed(2)}
                    </Text>
                </View>
                
                <FlatList
                    data={scannedCards.slice(0, 5)}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.recentScansList}
                    contentContainerStyle={styles.recentScansContent}
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={styles.recentScanCard}
                            onPress={() => handleCardPress(item)}
                        >
                            <Text style={styles.recentScanName} numberOfLines={2}>
                                {item.name}
                            </Text>
                            <Text style={styles.recentScanPrice}>
                                ${(item.prices?.usd ? Number(item.prices.usd) : 0).toFixed(2)}
                            </Text>
                            <Text style={styles.recentScanTime}>
                                {new Date(item.scannedAt || Date.now()).toLocaleTimeString()}
                            </Text>
                        </TouchableOpacity>
                    )}
                    keyExtractor={keyExtractor}
                />
            </View>
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
                {scannedCards.length > 0 ? (
                    <FlatList
                        data={scannedCards}
                        renderItem={({ item }) => (
                            <View style={styles.scannedListItem}>
                                <View style={styles.cardInfo}>
                                    <Text style={styles.cardNameText}>{item.name}</Text>
                                    <Text style={styles.cardSetText}>{item.setName} ({item.setCode})</Text>
                                </View>
                                <View style={styles.cardPriceContainer}>
                                    <Text style={styles.priceText}>
                                        ${(item.prices?.usd ? Number(item.prices.usd) : 0).toFixed(2)}
                                    </Text>
                                    <Text style={styles.timeText}>
                                        {item.scannedAt ? new Date(item.scannedAt).toLocaleTimeString() : '--:--'}
                                    </Text>
                                </View>
                            </View>
                        )}
                        keyExtractor={keyExtractor}
                        style={styles.scannedList}
                        contentContainerStyle={styles.scannedListContent}
                        ListEmptyComponent={
                            <View style={styles.emptyListContainer}>
                                <Icon name="card-search-outline" size={48} color="#ccc" />
                                <Text style={styles.emptyListText}>No cards scanned yet</Text>
                            </View>
                        }
                    />
                ) : (
                    <View style={styles.emptyListContainer}>
                        <Icon name="card-search-outline" size={48} color="#ccc" />
                        <Text style={styles.emptyListText}>No cards scanned yet</Text>
                    </View>
                )}
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
                            <Icon name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                        
                        <View style={styles.scanningInfo}>
                            <Icon name="camera" size={16} color="#fff" style={styles.cameraIcon} />
                            <Text style={styles.scanningText}>
                                {isLorcanaScan ? 'Scanning Lorcana Cards' : 'Scanning MTG Cards'}
                            </Text>
                            
                            <View style={styles.counterBadge}>
                                <Text style={styles.counterText}>
                                    {scannedCards.length} ${totalPrice.toFixed(2)}
                                </Text>
                            </View>
                        </View>
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
        backgroundColor: '#f5f5f5',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#1a1a1a',
        height: 56,
    },
    closeButton: {
        padding: 8,
        marginRight: 8,
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
        top: '50%',
        transform: [{ translateY: -50 }],
        gap: 16,
    },
    cameraButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'white',
    },
    recentScansContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        paddingVertical: 16,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    recentScansHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    recentScansTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
    },
    totalPriceText: {
        color: '#4CAF50',
        fontSize: 16,
        fontWeight: '600',
    },
    recentScansList: {
        paddingHorizontal: 8,
    },
    recentScansContent: {
        gap: 8,
    },
    recentScanCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 12,
        width: 140,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    recentScanName: {
        color: 'white',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
    },
    recentScanPrice: {
        color: '#4CAF50',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    recentScanTime: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 12,
    },
});

export default PriceLookupScreen; 