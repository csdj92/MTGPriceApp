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
    const PAGE_SIZE = 5000000;
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

                if (setCards.length > 0) {
                    // Sort the cards by price
                    setCards.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

                    setPriceData([{
                        setCode,
                        cards: setCards
                    }]);
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
                setPriceData(prev => currentPage === 1 ? prices : [...prev, ...prices]);
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
            const details = await scryfallService.getCardByNameAndSet(card.name, card.setCode);
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

    const renderCard = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.cardItem}
            onPress={() => handleCardPress(item)}
        >
            <Text style={styles.cardName}>
                {item.name || 'Unknown Card'} ({item.number || 'Unknown Number'})
            </Text>
            <Text>Normal: ${item.normal_price?.toFixed(2) || '0.00'} | Foil: ${item.foil_price?.toFixed(2) || '0.00'}</Text>
            <Text style={styles.lastUpdated}>
                Last Updated: {new Date(item.last_updated).toLocaleString()}
            </Text>
        </TouchableOpacity>
    );

    const renderSetSection = ({ section }: { section: { setCode: string; data: any[] } }) => (
        <View style={styles.setHeader}>
            <Text style={styles.setTitle}>{section.setCode}</Text>
            <Text style={styles.cardCount}>{section.data.length} cards</Text>
        </View>
    );

    const handleRefreshPrices = async () => {
        try {
            setIsRefreshing(true);
            // Force the price data update
            await databaseService.shouldUpdatePrices(true); // Force update
            await downloadAndImportPriceData((progress) => {
                console.log(`[WatchlistScreen] Price data download progress: ${progress}%`);
            });
            // Reload price data after update
            await loadPriceData(searchQuery, false);
        } catch (error) {
            console.error('[WatchlistScreen] Error refreshing prices:', error);
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
            </View>

            <SectionList
                sections={priceData.map(set => ({
                    setCode: set.setCode,
                    data: set.cards
                }))}
                renderItem={renderCard}
                renderSectionHeader={renderSetSection}
                keyExtractor={(item) => item.uuid}
                onEndReached={() => {
                    if (!isLoading && !isSearching && hasMore) {
                        setCurrentPage(prev => prev + 1);
                    }
                }}
                onEndReachedThreshold={0.5}
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
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    cardName: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 5,
    },
    lastUpdated: {
        fontSize: 12,
        color: '#666',
        marginTop: 5,
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
});

export default WatchlistScreen; 