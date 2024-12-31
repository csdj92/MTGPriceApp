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
import { downloadAndImportPriceData } from '../../utils/priceData';
import { databaseService } from '../../services/DatabaseService';
import { scryfallService } from '../../services/ScryfallService';
import CardList from '../../components/CardList';
import debounce from 'lodash/debounce';
import type { ExtendedCard } from '../../types/card';

const WatchlistScreen = () => {
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [priceData, setPriceData] = useState<any[]>([]);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'normal_price' | 'foil_price'>('normal_price');
    const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [cardDetails, setCardDetails] = useState<ExtendedCard[]>([]);
    const PAGE_SIZE = 50;

    const loadPriceData = async (isSearchUpdate = false) => {
        if (isSearchUpdate) {
            setIsSearching(true);
        } else {
            setIsLoading(true);
        }

        try {
            const prices = await databaseService.getCombinedPriceData(currentPage, PAGE_SIZE, searchQuery, sortBy);
            if (prices.length < PAGE_SIZE) {
                setHasMore(false);
            }
            setPriceData(prev => currentPage === 1 ? prices : [...prev, ...prices]);
        } catch (error) {
            console.error('Error loading price data:', error);
        } finally {
            setIsLoading(false);
            setIsSearching(false);
        }
    };

    // Debounced search function
    const debouncedSearch = useCallback(
        debounce((query: string) => {
            setSearchQuery(query);
            setCurrentPage(1);
            loadPriceData(true);
        }, 300),
        [loadPriceData]
    );

    useEffect(() => {
        loadPriceData();
    }, [currentPage, sortBy]);

    const handleSearch = (text: string) => {
        if (text.length === 0) {
            setSearchQuery('');
            setCurrentPage(1);
            loadPriceData();
        } else {
            debouncedSearch(text);
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
            <Text>Normal: ${item.normal_price.toFixed(2)} | Foil: ${item.foil_price.toFixed(2)}</Text>
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

    if (isLoading && currentPage === 1) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>
                    {downloadProgress > 0
                        ? `Updating price data... ${Math.round(downloadProgress)}%`
                        : 'Loading price data...'}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search cards or sets..."
                        onChangeText={handleSearch}
                        defaultValue={searchQuery}
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
});

export default WatchlistScreen; 