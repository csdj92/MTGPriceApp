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
        console.log('[PriceLookupScreen] Scan detected text:', text);
        setIsLoading(true);
        try {
            console.log('[PriceLookupScreen] Attempting to search for card with text:', text);
            const searchResponse = await scryfallService.searchCards(text, 1);
            const foundCards = searchResponse.data;
            console.log(`[PriceLookupScreen] Search returned ${foundCards.length} results`);

            if (foundCards.length > 0) {
                const newCard = foundCards[0]; // Get the first (most likely) match
                // Add to cache first to ensure UUID is generated
                const cardWithUuid = await databaseService.addToCache(newCard);
                await databaseService.addToScanHistory(cardWithUuid);
                const updatedCards = Array.isArray(scannedCards) ? [...scannedCards, cardWithUuid] : [cardWithUuid];
                updateTotalPrice(updatedCards);
                setScannedCards(updatedCards);
            } else {
                console.log('[PriceLookupScreen] No results found for scanned text');
                // Don't show alert for no results, just log it
            }
        } catch (error) {
            console.error('[PriceLookupScreen] Error processing scan:', error);
            // Only show error alert for non-search related errors
            if (!(error instanceof Error && error.message.includes('Scryfall API error: 400'))) {
                Alert.alert('Error', 'Failed to process scan. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleScanError = (error: Error) => {
        console.error('[PriceLookupScreen] Scan error:', error);
        // Only show critical errors, not search-related ones
        if (!error.message.includes('camera') && !error.message.includes('permission')) {
            return;
        }
        Alert.alert('Error', error.message);
    };

    const handleCardPress = (card: ExtendedCard) => {
        setSelectedCard(card);
        setIsCollectionSelectorVisible(true);
    };

    const handleSelectCollection = async (collection: Collection) => {
        if (!selectedCard) return;

        try {
            // First ensure the card is in the cache and has a UUID
            const cardWithUuid = await databaseService.addToCache(selectedCard);
            await databaseService.addCardToCollection(cardWithUuid.uuid!, collection.id);
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
            {/* Commenting out the total price overlay
            <View style={styles.totalPriceContainer}>
                <Text style={styles.totalPriceText}>
                    Total: ${totalPrice.toFixed(2)}
                </Text>
            </View>
            */}
            <View style={[styles.cameraPreviewContainer, { width: 1344, height: 2992 }]}>
                <CardScanner
                    onTextDetected={handleScan}
                    onError={handleScanError}
                />
            </View>
            {/* Commenting out the scanned cards overlay
            <View style={styles.scannedCardsOverlay}>
                <FlatList
                    data={scannedCards}
                    renderItem={renderScannedCard}
                    keyExtractor={(item, index) => `${item.id}-${index}`}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scannedCardsList}
                />
            </View>
            */}
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
                    {/* Commenting out the header
                    <View style={styles.modalHeader}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => {
                                setIsCameraActive(false);
                                setScannedCards([]);
                                setTotalPrice(0);
                            }}
                        >
                            <Icon name="close" size={24} color="#666" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Scan Card</Text>
                    </View>
                    */}
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
    cameraContainer: {
        flex: 1,
        backgroundColor: 'black',
    },
    cameraPreviewContainer: {
        flex: 1,
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