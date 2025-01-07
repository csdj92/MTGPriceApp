import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
    SectionList,
    Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { databaseService } from '../../services/DatabaseService';
import { scryfallService } from '../../services/ScryfallService';
import CardList from '../../components/CardList';
import debounce from 'lodash/debounce';
import type { ExtendedCard } from '../../types/card';
import { downloadAndImportPriceData } from '../../utils/priceData';

const WatchlistScreen = () => {
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [priceData, setPriceData] = useState<any[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'normal_price' | 'foil_price'>('normal_price');
    const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [cardDetails, setCardDetails] = useState<ExtendedCard[]>([]);
    const PAGE_SIZE = 10;
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadPriceData = useCallback(async (query: string, isSearchUpdate = false) => {
        if (isSearchUpdate) {
            setIsSearching(true);
        } else {
            setIsLoading(true);
        }

        try {
            if (query.toLowerCase().startsWith('set:')) {
                const setCode = query.split(':')[1].trim().toUpperCase();
                console.log(`[WatchlistScreen] Searching for set: ${setCode}`);

                // Get all cards from the set with prices
                const setCards = await databaseService.getAllCardsBySet(setCode, 1000, 0);
                console.log(`[WatchlistScreen] Found ${setCards.length} cards in set ${setCode}`);
                // console.log('[WatchlistScreen] First card sample:', JSON.stringify(setCards[0], null, 2));

                if (setCards.length > 0) {
                    // Sort the cards by price
                    setCards.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
                    
                    const sectionData = [{
                        setCode,
                        data: setCards
                    }];
                    // console.log('[WatchlistScreen] Section data structure:', JSON.stringify(sectionData[0], null, 2));
                    setPriceData(sectionData);
                    setHasMore(false); // No need to load more since we got all cards
                } else {
                    setPriceData([]);
                    setHasMore(false);
                }
            } else {
                // Regular search
                const prices = await databaseService.getCombinedPriceData(currentPage, PAGE_SIZE, query, sortBy);
                if (prices.length < PAGE_SIZE) {
                    setHasMore(false);
                }
                // Transform the data structure to match SectionList requirements
                const transformedPrices = prices.map(section => ({
                    setCode: section.setCode,
                    data: section.cards
                }));
                setPriceData(prev => currentPage === 1 ? transformedPrices : [...prev, ...transformedPrices]);
            }
        } catch (error) {
            console.error('Error loading price data:', error);
        } finally {
            setIsLoading(false);
            setIsSearching(false);
        }
    }, [currentPage, sortBy]);

    // Debounced search function with immediate execution for set: queries
    const debouncedSearch = useCallback(
        debounce((text: string) => {
            setCurrentPage(1);
            loadPriceData(text, true);
        }, 300),
        [loadPriceData]
    );

    useEffect(() => {
        if (searchQuery.toLowerCase().startsWith('set:')) {
            // Immediate execution for set: queries
            const setCode = searchQuery.split(':')[1].trim();
            if (setCode.length > 0) {
                setCurrentPage(1);
                loadPriceData(searchQuery, true);
            }
        } else {
            debouncedSearch(searchQuery);
        }
    }, [searchQuery, debouncedSearch]);

    const handleSearch = (text: string) => {
        setSearchQuery(text);
        if (text.length === 0) {
            setCurrentPage(1);
            loadPriceData('', false);
        }
    };

    const handleCardPress = async (card: any) => {
        try {
            setIsModalVisible(true);
            const details = await scryfallService.getCardByNameAndSet(card.number, card.setCode);
            if (details) {
                setCardDetails([{
                    ...details,
                    isExpanded: true
                }]);
            } else {
                // Fallback to name-only search if exact match fails
                const fallbackDetails = await scryfallService.getCardByName(card.name);
                if (fallbackDetails) {
                    setCardDetails([{
                        ...fallbackDetails,
                        isExpanded: true
                    }]);
                }
            }
        } catch (error) {
            console.error('Error fetching card details:', error);
        }
    };

    const renderCard = useCallback((card: any) => {
        const formatPrice = (price: number) => price ? `$${price.toFixed(2)}` : 'N/A';

        // Get prices from the card's prices object
        const prices = card.prices || {
            tcgplayer: { normal: 0, foil: 0 },
            cardmarket: { normal: 0, foil: 0 },
            cardkingdom: { normal: 0, foil: 0 },
            cardsphere: { normal: 0, foil: 0 }
        };

        return (
            <TouchableOpacity 
                style={styles.cardItem}
                onPress={() => handleCardPress(card)}
            >
                <View style={styles.cardHeader}>
                    <Text style={styles.cardName}>{card.name}</Text>
                    <Text style={styles.setCode}>{card.setCode} #{card.number}</Text>
                </View>
                
                <View style={styles.priceGrid}>
                    <View style={styles.priceSource}>
                        <Text style={styles.sourceHeader}>TCGplayer</Text>
                        <Text>Normal: {formatPrice(prices.tcgplayer.normal)}</Text>
                        <Text>Foil: {formatPrice(prices.tcgplayer.foil)}</Text>
                    </View>
                    
                    <View style={styles.priceSource}>
                        <Text style={styles.sourceHeader}>Cardmarket</Text>
                        <Text>Normal: {formatPrice(prices.cardmarket.normal)}</Text>
                        <Text>Foil: {formatPrice(prices.cardmarket.foil)}</Text>
                    </View>
                    
                    <View style={styles.priceSource}>
                        <Text style={styles.sourceHeader}>Card Kingdom</Text>
                        <Text>Normal: {formatPrice(prices.cardkingdom.normal)}</Text>
                        <Text>Foil: {formatPrice(prices.cardkingdom.foil)}</Text>
                    </View>
                    
                    <View style={styles.priceSource}>
                        <Text style={styles.sourceHeader}>Cardsphere</Text>
                        <Text>Normal: {formatPrice(prices.cardsphere.normal)}</Text>
                        <Text>Foil: {formatPrice(prices.cardsphere.foil)}</Text>
                    </View>
                </View>

                <Text style={styles.lastUpdated}>
                    Last updated: {card.last_updated ? new Date(card.last_updated).toLocaleString() : 'Never'}
                </Text>
            </TouchableOpacity>
        );
    }, []);

    const renderSetSection = ({ section }: { section: { setCode: string; data: any[] } }) => (
        <View style={styles.setHeader}>
            <Text style={styles.setTitle}>{section.setCode}</Text>
            <Text style={styles.cardCount}>{section.data.length} cards</Text>
        </View>
    );

    useEffect(() => {
        const verifyDatabase = async () => {
            const isValid = await databaseService.verifyDatabaseState();
            if (!isValid) {
                console.log('[WatchlistScreen] Database verification failed, forcing price refresh...');
                await handleRefreshPrices();
            } else {
                loadPriceData(searchQuery, false);
            }
        };
        
        verifyDatabase();
    }, []);

    const handleRefreshPrices = async () => {
        try {
            setIsRefreshing(true);
            console.log('[WatchlistScreen] Starting price refresh...');
            
            // Reinitialize database if needed
            await databaseService.reinitializePrices();
            
            // Force the price data update
            const shouldUpdate = await databaseService.shouldUpdatePrices(true);
            console.log('[WatchlistScreen] Should update prices:', shouldUpdate);
            
            if (shouldUpdate) {
                // Download and import price data
                console.log('[WatchlistScreen] Starting price data download...');
                await downloadAndImportPriceData((progress) => {
                    console.log(`[WatchlistScreen] Price data download progress: ${progress}%`);
                }, true);
                console.log('[WatchlistScreen] Price data download and import completed');

                // Verify price data was imported
                const priceCount = await databaseService.getPriceCount();
                console.log(`[WatchlistScreen] Total prices in database after refresh: ${priceCount}`);
                
                if (priceCount === 0) {
                    console.error('[WatchlistScreen] Price data import failed - no prices found in database');
                    throw new Error('Price data import failed');
                }
            } else {
                console.error('[WatchlistScreen] Force update failed - shouldUpdate returned false');
                throw new Error('Force update failed');
            }
            
            // Reload price data after update
            console.log('[WatchlistScreen] Reloading price data...');
            await loadPriceData(searchQuery, false);
            console.log('[WatchlistScreen] Price refresh completed');
        } catch (error) {
            console.error('[WatchlistScreen] Error refreshing prices:', error);
            // You might want to show an error message to the user here
        } finally {
            setIsRefreshing(false);
        }
    };

    if (isLoading && currentPage === 1) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading price data...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Type 'set:CODE' to view all cards in a set"
                        onChangeText={handleSearch}
                        value={searchQuery}
                    />
                    {isSearching && (
                        <ActivityIndicator
                            size="small"
                            color="#2196F3"
                            style={styles.searchSpinner}
                        />
                    )}
                </View>
                <TouchableOpacity
                    style={styles.sortButton}
                    onPress={() => setSortBy(prev => prev === 'normal_price' ? 'foil_price' : 'normal_price')}
                >
                    <Text>Sort by: {sortBy === 'normal_price' ? 'Normal' : 'Foil'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.refreshButton, isRefreshing && styles.refreshButtonDisabled]}
                    onPress={handleRefreshPrices}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Icon name="refresh" size={20} color="#fff" />
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.debugButton}
                    onPress={() => databaseService.printTenCardsRows()}
                >
                    <Icon name="bug" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            <SectionList
                sections={priceData}
                renderItem={({ item }) => renderCard(item)}
                renderSectionHeader={renderSetSection}
                keyExtractor={(item) => item.uuid}
                onEndReached={() => {
                    if (!isLoading && !isSearching && hasMore) {
                        setCurrentPage(prev => prev + 1);
                    }
                }}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={() => (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No cards found</Text>
                    </View>
                )}
                ListFooterComponent={() => (
                    isLoading && !isSearching ? (
                        <ActivityIndicator size="small" color="#2196F3" style={styles.footer} />
                    ) : null
                )}
            />

            <Modal
                visible={isModalVisible}
                animationType="slide"
                onRequestClose={() => setIsModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => setIsModalVisible(false)}
                    >
                        <Icon name="close" size={24} color="#000" />
                    </TouchableOpacity>
                    <CardList
                        cards={cardDetails}
                        isLoading={false}
                        onCardPress={() => { }}
                    />
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    searchContainer: {
        padding: 10,
        backgroundColor: '#f5f5f5',
        flexDirection: 'row',
        alignItems: 'center',
    },
    searchInputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 20,
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        height: 40,
        paddingHorizontal: 15,
    },
    searchSpinner: {
        marginRight: 10,
    },
    sortButton: {
        padding: 10,
        backgroundColor: '#fff',
        borderRadius: 20,
    },
    setHeader: {
        backgroundColor: '#f0f0f0',
        padding: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    setTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    cardCount: {
        color: '#666',
    },
    cardItem: {
        backgroundColor: 'white',
        padding: 16,
        marginVertical: 8,
        marginHorizontal: 16,
        borderRadius: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    cardHeader: {
        marginBottom: 12,
    },
    cardName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1a1a1a',
    },
    setCode: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    priceGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginVertical: 8,
    },
    priceSource: {
        width: '48%',
        backgroundColor: '#f5f5f5',
        padding: 8,
        borderRadius: 4,
        marginBottom: 8,
    },
    sourceHeader: {
        fontWeight: '600',
        marginBottom: 4,
        color: '#333',
    },
    lastUpdated: {
        fontSize: 12,
        color: '#999',
        marginTop: 8,
        textAlign: 'right',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    footer: {
        padding: 16,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#fff',
    },
    closeButton: {
        padding: 16,
        alignItems: 'flex-end',
    },
    refreshButton: {
        backgroundColor: '#2196F3',
        padding: 10,
        borderRadius: 20,
        marginLeft: 10,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    refreshButtonDisabled: {
        opacity: 0.7,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
    },
    debugButton: {
        backgroundColor: '#FF9800',
        padding: 10,
        borderRadius: 20,
        marginLeft: 10,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default WatchlistScreen; 