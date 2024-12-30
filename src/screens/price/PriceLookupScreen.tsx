import React, { useState, useEffect } from 'react';
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
    Animated,
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

const PriceLookupScreen: React.FC<PriceLookupScreenProps> = ({ navigation }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<ExtendedCard[]>([]);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [scannedCards, setScannedCards] = useState<ExtendedCard[]>([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [isCollectionSelectorVisible, setIsCollectionSelectorVisible] = useState(false);
    const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
    const [isScanning, setIsScanning] = useState(true);
    const [isProcessingScan, setIsProcessingScan] = useState(false);
    const [isCardDetailsVisible, setIsCardDetailsVisible] = useState(false);

    // Reset states when closing camera
    const handleCloseCamera = () => {
        setIsCameraActive(false);
        setIsScanning(true);
        setIsProcessingScan(false);
    };

    // Handle back button press
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (isCameraActive) {
                handleCloseCamera();
                return true;
            }
            return false;
        });

        return () => backHandler.remove();
    }, [isCameraActive]);

    const resumeScanning = () => {
        setIsScanning(true);
    };

    useEffect(() => {
        loadScanHistory();
    }, []);

    // Add monitoring for scanned cards changes
    useEffect(() => {
        console.log('[PriceLookupScreen] Scanned cards updated:', {
            count: scannedCards?.length,
            cards: scannedCards?.map(card => card.name)
        });
    }, [scannedCards]);

    const loadScanHistory = async () => {
        try {
            const history = await databaseService.getScanHistory();
            if (Array.isArray(history)) {
                setScannedCards(history);
                updateTotalPrice(history);
            }
        } catch (error) {
            console.error('Error loading scan history:', error);
            // Initialize with empty state if there's an error
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

    const handleScan = async (text: string) => {
        // Ignore empty, short text, or if we're already processing
        if (!text?.trim() || text.length < 3 || isProcessingScan) {
            return;
        }

        // Clean up the text - remove extra spaces and special characters
        const cleanedText = text.trim().replace(/\s+/g, ' ');

        console.log('[PriceLookupScreen] Scan detected text:', cleanedText);

        // Set processing state
        setIsProcessingScan(true);

        try {
            console.log('[PriceLookupScreen] Attempting to search for card with text:', cleanedText);
            const searchResponse = await scryfallService.searchCards(cleanedText, 1);
            const foundCards = searchResponse.data;
            console.log(`[PriceLookupScreen] Search returned ${foundCards.length} results`);

            if (foundCards.length > 0) {
                const newCard = foundCards[0];
                console.log('[PriceLookupScreen] New card found:', newCard.name);

                try {
                    // Add to database and get back card with UUID
                    const cardWithUuid = await databaseService.addToCache(newCard);
                    if (!cardWithUuid.uuid) {
                        throw new Error('Failed to generate UUID for card');
                    }

                    // Add timestamp to card
                    const cardWithTimestamp = {
                        ...cardWithUuid,
                        scannedAt: Date.now()
                    };

                    // Now add to scan history with the UUID
                    await databaseService.addToScanHistory(cardWithTimestamp);

                    // Update scanned cards state
                    setScannedCards(prevCards => {
                        const currentCards = Array.isArray(prevCards) ? prevCards : [];
                        return [cardWithTimestamp, ...currentCards];
                    });

                    // Update total price in a separate state update
                    setTotalPrice(prevTotal => {
                        const cardPrice = cardWithUuid.prices?.usd ? Number(cardWithUuid.prices.usd) : 0;
                        return prevTotal + cardPrice;
                    });

                    // Show success feedback
                    if (Platform.OS === 'android') {
                        ToastAndroid.show(`Added ${cardWithUuid.name}`, ToastAndroid.SHORT);
                    }

                } catch (dbError) {
                    console.error('[PriceLookupScreen] Database error:', dbError);
                    Alert.alert('Error', 'Failed to save card to database');
                }
            }
        } catch (error) {
            console.error('[PriceLookupScreen] Error processing scan:', error);
            if (error instanceof Error && !error.message.includes('404')) {
                Alert.alert('Error', 'Failed to process scan. Please try again.');
            }
        } finally {
            // Reset processing state immediately
            setIsProcessingScan(false);
        }
    };

    const handleScanError = (error: Error) => {
        Alert.alert('Scan Error', error.message);
        setIsCameraActive(false);
    };

    const handleCardPress = (card: ExtendedCard) => {
        setIsScanning(false); // Pause scanning
        setSelectedCard(card);
        setIsCardDetailsVisible(true);
    };

    const handleCloseCardDetails = () => {
        setIsCardDetailsVisible(false);
        setSelectedCard(null);
        setTimeout(resumeScanning, 500); // Resume scanning after a short delay
    };

    const handleAddToCollection = (card: ExtendedCard) => {
        setIsCardDetailsVisible(false); // Close the card details modal first
        setSelectedCard(card);
        setIsCollectionSelectorVisible(true);
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
                        // Resume scanning after a short delay
                        setTimeout(resumeScanning, 500);
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
                        // Resume scanning even if there was an error
                        setTimeout(resumeScanning, 500);
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

    // Update keyExtractor to use timestamp or fallback to UUID + random
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
                isScanning={isScanning && !isProcessingScan}
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

    // Add this new Modal for card details
    const renderCardDetailsModal = () => (
        <Modal
            visible={isCardDetailsVisible}
            animationType="slide"
            onRequestClose={handleCloseCardDetails}
        >
            <SafeAreaView style={[styles.modalContainer, { backgroundColor: '#f5f5f5' }]}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={handleCloseCardDetails}
                    >
                        <Icon name="close" size={24} color="#666" />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Card Details</Text>
                </View>
                {selectedCard && (
                    <CardList
                        cards={[selectedCard]}
                        isLoading={false}
                        onCardPress={handleAddToCollection}
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
                onRequestClose={handleCloseCamera}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={handleCloseCamera}
                        >
                            <Icon name="close" size={24} color="#666" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Scan Card</Text>
                        {isProcessingScan && (
                            <ActivityIndicator size="small" color="#2196F3" style={styles.processingIndicator} />
                        )}
                    </View>
                    {renderCameraContent()}
                </SafeAreaView>
            </Modal>

            <CollectionSelector
                visible={isCollectionSelectorVisible}
                onClose={() => {
                    setIsCollectionSelectorVisible(false);
                    setSelectedCard(null);
                    setTimeout(resumeScanning, 500);
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
        backgroundColor: 'black',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
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
    totalPriceContainer: {
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: 'rgba(33, 150, 243, 0.9)',
        borderRadius: 20,
        padding: 10,
        zIndex: 1,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    totalPriceText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
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
    processingIndicator: {
        marginTop: 10,
    },
});

export default PriceLookupScreen; 