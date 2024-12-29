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
        // Ignore very short text that's likely just noise or partial scans
        if (!text || text.length < 3) {
            return;
        }

        console.log('[PriceLookupScreen] Scan detected text:', text);

        // Only show loading if we have a substantial text to search
        setIsLoading(true);
        try {
            console.log('[PriceLookupScreen] Attempting to search for card with text:', text);
            const searchResponse = await scryfallService.searchCards(text, 1);
            const foundCards = searchResponse.data;
            console.log(`[PriceLookupScreen] Search returned ${foundCards.length} results`);

            if (foundCards.length > 0) {
                const newCard = foundCards[0]; // Get the first (most likely) match
                console.log('[PriceLookupScreen] New card found:', newCard.name);

                // Add to database first
                await databaseService.addToScanHistory(newCard);

                // Update state using functional update to ensure we have the latest state
                setScannedCards(prevCards => {
                    const currentCards = Array.isArray(prevCards) ? prevCards : [];
                    // Check if card is already in the list
                    const isDuplicate = currentCards.some(card => card.id === newCard.id);
                    if (isDuplicate) {
                        return currentCards;
                    }
                    const updatedCards = [newCard, ...currentCards];
                    // Update total price after cards are updated
                    updateTotalPrice(updatedCards);
                    return updatedCards;
                });

                console.log('[PriceLookupScreen] State updated with new card');
            } else {
                console.log('[PriceLookupScreen] No results found for scanned text');
            }
        } catch (error) {
            console.error('[PriceLookupScreen] Error processing scan:', error);
            if (error instanceof Error && !error.message.includes('404')) {
                Alert.alert('Error', 'Failed to process scan. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleScanError = (error: Error) => {
        Alert.alert('Scan Error', error.message);
        setIsCameraActive(false);
    };

    const handleCardPress = (card: ExtendedCard) => {
        setSelectedCard(card);
        setIsCollectionSelectorVisible(true);
    };

    const handleSelectCollection = async (collection: Collection) => {
        if (!selectedCard) return;

        try {
            if (!selectedCard.uuid) {
                throw new Error('Card UUID is missing');
            }
            await databaseService.addCardToCollection(selectedCard.uuid, collection.id);
            await databaseService.markScannedCardAddedToCollection(selectedCard.id, collection.id);
            Alert.alert('Success', `Added ${selectedCard.name} to ${collection.name}`);
        } catch (error) {
            console.error('Error adding card to collection:', error);
            Alert.alert('Error', 'Failed to add card to collection');
        } finally {
            setIsCollectionSelectorVisible(false);
            setSelectedCard(null);
        }
    };

    const renderScannedCard = ({ item }: { item: ExtendedCard }) => (
        <TouchableOpacity
            style={styles.scannedCardItem}
            onPress={() => handleCardPress(item)}
        >
            <View style={styles.scannedCardContent}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardPrice}>
                    ${(item.prices?.usd ? Number(item.prices.usd) : 0).toFixed(2)}
                </Text>
            </View>
        </TouchableOpacity>
    );

    const renderCameraContent = () => (
        <View style={styles.cameraContainer}>
            <CardScanner
                onTextDetected={handleScan}
                onError={handleScanError}
                scannedCards={scannedCards}
                totalPrice={totalPrice}
                onCardPress={handleCardPress}
            />
        </View>
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
                    />
                    <TouchableOpacity
                        style={styles.searchButton}
                        onPress={handleManualSearch}
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
                            onPress={() => {
                                setIsCameraActive(false);
                            }}
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
});

export default PriceLookupScreen; 