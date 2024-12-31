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
import CardList from '../../components/CardList';
import CardScanner from '../../components/CardScanner';
import type { ExtendedCard } from '../../types/card';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import CollectionSelector from '../../components/CollectionSelector';
import type { Collection } from '../../services/DatabaseService';

type PriceLookupScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'PriceLookup'>;
};

const SCAN_COOLDOWN_MS = 1000; // 1 second cooldown between scans
const RECENT_SCANS_CLEAR_INTERVAL = 30000; // Clear recent scans every 30 seconds

const PriceLookupScreen: React.FC<PriceLookupScreenProps> = ({ navigation }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<ExtendedCard[]>([]);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [scannedCards, setScannedCards] = useState<ExtendedCard[]>([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [isCollectionSelectorVisible, setIsCollectionSelectorVisible] = useState(false);
    const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
    const [isCardDetailsVisible, setIsCardDetailsVisible] = useState(false);
    const [isScanningPaused, setIsScanningPaused] = useState(false);
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
    }, []);

    const loadScanHistory = async () => {
        try {
            const history = await databaseService.getScanHistory();
            if (Array.isArray(history)) {
                setScannedCards(history);
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
        if (!searchQuery.trim()) {
            Alert.alert('Error', 'Please enter a card name');
            return;
        }

        setIsLoading(true);
        try {
            const { data: results } = await scryfallService.searchCards(searchQuery);
            setSearchResults(results);
            if (results.length === 0) {
                Alert.alert('No Results', 'No cards found matching your search.');
            }
        } catch (error) {
            console.error('Error searching cards:', error);
            Alert.alert('Error', 'Failed to search cards. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleScanPress = () => {
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

        // Check if we've seen this text very recently (within cooldown)
        const now = Date.now();
        if (lastScannedRef.current) {
            const timeSinceLastScan = now - lastScannedRef.current.timestamp;
            // Only apply cooldown if it's the exact same text
            if (timeSinceLastScan < SCAN_COOLDOWN_MS && lastScannedRef.current.text === normalizedText) {
                return; // Still in cooldown period for this exact text
            }
        }

        // Set the last scanned reference immediately to prevent duplicate processing
        lastScannedRef.current = { text: normalizedText, timestamp: now };

        try {
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

                const cardWithTimestamp = {
                    ...cardWithUuid,
                    scannedAt: now
                };

                await databaseService.addToScanHistory(cardWithTimestamp);

                setScannedCards(prevCards => {
                    const currentCards = Array.isArray(prevCards) ? prevCards : [];
                    return [cardWithTimestamp, ...currentCards];
                });

                setTotalPrice(prevTotal => {
                    const cardPrice = cardWithUuid.prices?.usd ? Number(cardWithUuid.prices.usd) : 0;
                    return prevTotal + cardPrice;
                });

                if (Platform.OS === 'android') {
                    ToastAndroid.show(`Added ${cardWithUuid.name}`, ToastAndroid.SHORT);
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

    const handleCardPress = (card: ExtendedCard) => {
        setIsScanningPaused(true);
        setSelectedCard(card);
        setIsCardDetailsVisible(true);
    };

    const handleCloseCardDetails = () => {
        setIsCardDetailsVisible(false);
        setSelectedCard(null);
        setIsScanningPaused(false);
    };

    const handleAddToCollection = (card: ExtendedCard) => {
        setIsCardDetailsVisible(false);
        setSelectedCard(card);
        setIsCollectionSelectorVisible(true);
        setIsScanningPaused(true);
    };

    const handleSelectCollection = async (collection: Collection) => {
        if (!selectedCard) return;

        try {
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

    const renderScannedCard = ({ item }: { item: ExtendedCard }) => (
        <TouchableOpacity
            style={styles.scannedCardItem}
            onPress={() => handleCardPress(item)}
            onLongPress={() => handleAddToCollection(item)}
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

    const keyExtractor = (item: ExtendedCard & { scannedAt?: number }) => {
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
            {scannedCards.length > 0 && (
                <View style={styles.scannedCardsContainer}>
                    <FlatList
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
                    <CardList
                        cards={[{ ...selectedCard, isExpanded: true }]}
                        isLoading={false}
                        onAddToCollection={handleAddToCollection}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );

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
                <TouchableOpacity
                    style={styles.scanButton}
                    onPress={handleScanPress}
                >
                    <Icon name="camera" size={24} color="white" />
                    <Text style={styles.scanButtonText}>Scan Card</Text>
                </TouchableOpacity>
            </View>

            <CardList
                cards={searchResults}
                isLoading={isLoading}
                onCardPress={handleCardPress}
            />

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
});

export default PriceLookupScreen; 