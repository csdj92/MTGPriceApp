import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
    SectionList,
    Modal,
    FlatList,
    Image,
    Alert,
    Animated
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as any;
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { databaseService } from '../../services/DatabaseService';
import { scryfallService } from '../../services/ScryfallService';
import CardList from '../../components/CardList';
import debounce from 'lodash/debounce';
import type { ExtendedCard } from '../../types/card';
import type { SetInfo } from '../../services/DatabaseService';
import { downloadAndImportPriceData } from '../../utils/priceData';
import { getCachedImageUri, ensureCacheDirectory } from '../../utils/imageCache';
import AllPrintingsJsonDatabase from '../../services/database/AllPrintingsJsonDatabase';
import { PriceService } from '../../services/price/PriceService';
import { DatabaseManager } from '../../services/database/DatabaseManager';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Extracted components for better organization
const PriceRow = ({ label, value, formatPrice }: { label: string; value: number; formatPrice: (price: number) => string }) => (
    <View style={styles.priceGridRow}>
        <Text style={styles.priceGridLabel}>{label}:</Text>
        <Text style={styles.priceGridValue}>{formatPrice(value)}</Text>
    </View>
);

const PriceColumn = ({ title, prices, formatPrice }: { title: string; prices: { normal: number; foil: number }; formatPrice: (price: number) => string }) => (
    <View style={styles.priceColumn}>
        <Text style={styles.priceSourceTitle}>{title}</Text>
        <PriceRow label="Normal" value={prices.normal} formatPrice={formatPrice} />
        <PriceRow label="Foil" value={prices.foil} formatPrice={formatPrice} />
    </View>
);

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
    const [sets, setSets] = useState<SetInfo[]>([]);
    const [isSetModalVisible, setIsSetModalVisible] = useState(false);
    const [selectedSet, setSelectedSet] = useState<SetInfo | null>(null);
    const PAGE_SIZE = 20; // Increased from 10 to show more cards at once
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [setSearchText, setSetSearchText] = useState('');
    const [isSetLoading, setIsSetLoading] = useState(false);
    const [isSetModalLoading, setIsSetModalLoading] = useState(false);
    const [imageCache, setImageCache] = useState<{[key: string]: string}>({});

    // Format price helper function
    const formatPrice = useCallback((price: number) => price ? `$${price.toFixed(2)}` : 'N/A', []);

    // Remove the cleanup effects that clear data
    useEffect(() => {
        const unsubscribe = navigation.addListener('blur', () => {
            setIsSetModalVisible(false);
            setSetSearchText('');
        });

        return unsubscribe;
    }, [navigation]);

    const loadPriceData = useCallback(async (query: string, isSearchUpdate = false) => {
        if (selectedSet) {
            setIsSetLoading(true);
        } else if (isSearchUpdate) {
            setIsSearching(true);
        } else {
            setIsLoading(true);
        }

        try {
            if (selectedSet) {
                console.log(`[WatchlistScreen] Loading cards for set: ${selectedSet.code}`);

                // Get all cards from the set with prices
                const setCards = await AllPrintingsJsonDatabase.getInstance().getAllCardsBySet(selectedSet.code, 1000, 0);
                console.log(`[WatchlistScreen] Found ${setCards.length} cards in set ${selectedSet.code}`);

                if (setCards.length > 0) {
                    // Sort the cards by price
                    setCards.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
                    
                    const sectionData = [{
                        setCode: selectedSet.code,
                        data: setCards
                    }];
                    setPriceData(sectionData);
                    setHasMore(false); // No need to load more since we got all cards
                } else {
                    setPriceData([]);
                    setHasMore(false);
                }
            } else {
                // Get most expensive cards across all sets
                const cards = await AllPrintingsJsonDatabase.getInstance().getMostExpensiveCards(PAGE_SIZE, (currentPage - 1) * PAGE_SIZE, sortBy);
                if (cards.length < PAGE_SIZE) {
                    setHasMore(false);
                }

                // Group cards by set
                const cardsBySet = cards.reduce((acc: { [key: string]: any[] }, card: { setCode: string | undefined }) => {
                    const setCode = card.setCode || 'Unknown Set';
                    if (!acc[setCode]) {
                        acc[setCode] = [];
                    }
                    acc[setCode].push(card);
                    return acc;
                }, {});

                // Transform into sections
                const transformedPrices = Object.entries(cardsBySet).map(([setCode, cards]) => ({
                    setCode,
                    data: cards
                }));

                setPriceData(prev => currentPage === 1 ? transformedPrices : [...prev, ...transformedPrices]);
            }
        } catch (error) {
            console.error('Error loading price data:', error);
        } finally {
            setIsLoading(false);
            setIsSearching(false);
            setIsSetLoading(false);
        }
    }, [currentPage, sortBy, selectedSet, PAGE_SIZE]);

    // Add useFocusEffect to load data when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            const loadInitialData = async () => {
                if (!databaseService.isMTGJsonDatabaseInitialized()) {
                    console.log('[WatchlistScreen] Database not initialized, initializing...');
                    const isValid = await databaseService.verifyDatabaseState();
                    if (!isValid) {
                        console.log('[WatchlistScreen] Database verification failed, forcing price refresh...');
                        await handleRefreshPrices();
                    }
                }
                loadPriceData(searchQuery, false);
            };

            loadInitialData();
        }, [searchQuery, loadPriceData])
    );

    useEffect(() => {
        if (!databaseService.isMTGJsonDatabaseInitialized()) {
            console.log('[WatchlistScreen] Database not initialized, skipping set load');
            return;
        }

        const loadSets = async () => {
            try {
                setIsSetModalLoading(true);
                console.log('[WatchlistScreen] Loading sets...');
                const setList = await AllPrintingsJsonDatabase.getInstance().getSetList();
                console.log('[WatchlistScreen] Loaded sets:', setList.length);
                if (setList.length === 0) {
                    console.log('[WatchlistScreen] No sets found, checking database state...');
                    await databaseService.verifyDatabaseState();
                    // Try loading sets again
                    const retrySetList = await AllPrintingsJsonDatabase.getInstance().getSetList();
                    console.log('[WatchlistScreen] Retry loaded sets:', retrySetList.length);
                    setSets(retrySetList.map(set => ({
                        code: set.code,
                        name: set.name,
                        cardCount: set.totalCards || 0,
                        highestPrice: 0
                    })));
                } else {
                    setSets(setList.map(set => ({
                        code: set.code,
                        name: set.name,
                        cardCount: set.totalCards || 0,
                        highestPrice: 0
                    })));
                }
            } catch (error) {
                console.error('[WatchlistScreen] Error loading sets:', error);
            } finally {
                setIsSetModalLoading(false);
            }
        };

        loadSets();
    }, []);

    const handleSetModalOpen = () => {
        if (!databaseService.isMTGJsonDatabaseInitialized()) {
            console.log('[WatchlistScreen] Database not initialized, cannot open set modal');
            return;
        }
        setIsSetModalVisible(true);
    };

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
        if (text.length === 3) {
            setCurrentPage(1);
            loadPriceData('', false);
        }
    };

    const handleCardPress = async (card: any) => {
        try {
            setIsModalVisible(true);
            
            // Check if this is a double-sided card
            const isDoubleSided = 
                card.layout === 'transform' || 
                card.layout === 'modal_dfc' || 
                card.layout === 'flip' || 
                (card.side === 'a' && card.otherSide) || 
                (card.card_faces && card.card_faces.length > 1);
            
            // Get card details from Scryfall
            const details = await scryfallService.getCardByNameAndSet(card.number, card.setCode);
            if (details) {
                setCardDetails([{
                    ...details,
                    prices: card.prices || details.prices,
                    isExpanded: true,
                    isDoubleSided: isDoubleSided,
                    otherSide: card.otherSide,
                    otherSideName: card.otherSideName,
                    layout: card.layout || details.layout
                }]);
            } else {
                // Fallback to name-only search if exact match fails
                const fallbackDetails = await scryfallService.getCardByName(card.name);
                if (fallbackDetails) {
                    setCardDetails([{
                        ...fallbackDetails,
                        isExpanded: true,
                        isDoubleSided: isDoubleSided,
                        otherSide: card.otherSide,
                        otherSideName: card.otherSideName,
                        layout: card.layout || fallbackDetails.layout
                    }]);
                }
            }
        } catch (error) {
            console.error('Error fetching card details:', error);
        }
    };

    // Add initialization of cache directory
    useEffect(() => {
        ensureCacheDirectory();
    }, []);

    // Memoize the card rendering function
    const renderCard = useCallback(({ item: card }: { item: any }) => {
        const scaleValue = React.useRef(new Animated.Value(1)).current;
        
        const onPressIn = () => {
            Animated.spring(scaleValue, {
                toValue: 0.98,
                useNativeDriver: true,
            }).start();
        };
        
        const onPressOut = () => {
            Animated.spring(scaleValue, {
                toValue: 1,
                useNativeDriver: true,
            }).start();
        };

        // Get prices from the card's prices object
        const prices = card.prices || {
            tcgplayer: { normal: 0, foil: 0 },
            cardmarket: { normal: 0, foil: 0 },
            cardkingdom: { normal: 0, foil: 0 },
            cardsphere: { normal: 0, foil: 0 }
        };

        // Calculate highest normal and foil prices
        const highestNormal = Math.max(
            prices.tcgplayer.normal,
            prices.cardmarket.normal,
            prices.cardkingdom.normal,
            prices.cardsphere.normal
        );

        const highestFoil = Math.max(
            prices.tcgplayer.foil,
            prices.cardmarket.foil,
            prices.cardkingdom.foil,
            prices.cardsphere.foil
        );

        const [frontImageUri, setFrontImageUri] = useState<string | null>(null);
        const [backImageUri, setBackImageUri] = useState<string | null>(null);
        
        // Check if card is double-sided based on layout or side property
        const isDoubleSided = 
            card.layout === 'transform' || 
            card.layout === 'modal_dfc' || 
            card.layout === 'flip' || 
            (card.side === 'a' && card.otherSide) || 
            (card.card_faces && card.card_faces.length > 1);

        useEffect(() => {
            let isMounted = true;
            const loadImage = async () => {
                try {
                    // Front side image
                    const frontCacheKey = `${card.setCode}_${card.number}_front`;
                    if (imageCache[frontCacheKey]) {
                        if (isMounted) {
                            setFrontImageUri(imageCache[frontCacheKey]);
                        }
                    } else {
                        const uri = await getCachedImageUri(card.setCode, card.number);
                        if (isMounted) {
                            setFrontImageUri(uri);
                            // Update cache
                            setImageCache(prev => ({
                                ...prev,
                                [frontCacheKey]: uri
                            }));
                        }
                    }

                    // Back side image for double-sided cards
                    if (isDoubleSided) {
                        const backCacheKey = `${card.setCode}_${card.number}_back`;
                        if (imageCache[backCacheKey]) {
                            if (isMounted) {
                                setBackImageUri(imageCache[backCacheKey]);
                            }
                        } else {
                            // For scryfall, usually adding ?back to the URL gives the back face
                            const backUri = await getCachedImageUri(card.setCode, card.number, true);
                            if (isMounted) {
                                setBackImageUri(backUri);
                                // Update cache
                                setImageCache(prev => ({
                                    ...prev,
                                    [backCacheKey]: backUri
                                }));
                            }
                        }
                    }
                } catch (error) {
                    console.error('[WatchlistScreen] Error loading cached image:', error);
                }
            };
            loadImage();
            return () => { isMounted = false; };
        }, [card.setCode, card.number, isDoubleSided]);

        return (
            <AnimatedTouchable
                style={[styles.cardItem, { transform: [{ scale: scaleValue }] }]}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                onPress={() => handleCardPress(card)}
                activeOpacity={0.9}
            >
                <View style={styles.cardHeader}>
                    <View style={styles.cardImageContainer}>
                        <Image 
                            source={{ uri: frontImageUri || `https://api.scryfall.com/cards/${card.setCode.toLowerCase()}/${card.number}?format=image` }}
                            style={styles.cardImage}
                            resizeMode="contain"
                        />
                        <View style={styles.setBadge}>
                            <Text style={styles.setCodeText}>{card.setCode}</Text>
                        </View>
                    </View>
                    
                    <View style={styles.cardInfo}>
                        <Text style={styles.cardName} numberOfLines={2}>{card.name}</Text>
                        <View style={styles.pricePillContainer}>
                            <View style={[styles.pricePill, styles.normalPill]}>
                                <Text style={styles.pricePillText}>Normal</Text>
                                <Text style={styles.pricePillValue}>{formatPrice(highestNormal)}</Text>
                            </View>
                            <View style={[styles.pricePill, styles.foilPill]}>
                                <Text style={styles.pricePillText}>Foil</Text>
                                <Text style={styles.pricePillValue}>{formatPrice(highestFoil)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.priceGrid}>
                    <PriceColumn 
                        title="TCGplayer" 
                        prices={prices.tcgplayer} 
                        formatPrice={formatPrice} 
                    />
                    <PriceColumn 
                        title="Cardmarket" 
                        prices={prices.cardmarket} 
                        formatPrice={formatPrice} 
                    />
                    <PriceColumn 
                        title="Card Kingdom" 
                        prices={prices.cardkingdom} 
                        formatPrice={formatPrice} 
                    />
                    <PriceColumn 
                        title="Cardsphere" 
                        prices={prices.cardsphere} 
                        formatPrice={formatPrice} 
                    />
                </View>

                <Text style={styles.lastUpdated}>
                    Updated: {card.last_updated ? new Date(card.last_updated).toLocaleString() : 'N/A'}
                </Text>
            </AnimatedTouchable>
        );
    }, [imageCache, formatPrice]);

    // Memoize section header rendering
    const renderSetSection = useCallback(({ section }: { section: { setCode: string; data: any[] } }) => (
        <View style={styles.setHeader}>
            <Text style={styles.setTitle}>{section.setCode}</Text>
            <Text style={styles.cardCount}>{section.data.length} cards</Text>
        </View>
    ), []);

    // Memoize filtered sets
    const filteredSets = useMemo(() => {
        if (sets.length > 0) {
            return sets.filter(set => 
                set.name.toLowerCase().includes(setSearchText.toLowerCase()) ||
                set.code.toLowerCase().includes(setSearchText.toLowerCase())
            );
        }
        return [];
    }, [sets, setSearchText]);

    // Memoize set item rendering
    const renderSetItem = useCallback(({ item: set }: { item: SetInfo }) => (
        <TouchableOpacity
            key={set.code}
            style={styles.setItem}
            onPress={() => {
                console.log(`[WatchlistScreen] Set selected: ${set.name} (${set.code})`);
                setIsSetLoading(true);
                setSelectedSet(set);
                setIsSetModalVisible(false);
                setSetSearchText('');
                
                // Load data with error handling
                loadPriceData('')
                    .catch(error => {
                        console.error('[WatchlistScreen] Error loading set data:', error);
                        // Show empty state but don't clear the selected set
                        setPriceData([]);
                        setHasMore(false);
                    })
                    .finally(() => {
                        setIsSetLoading(false);
                    });
            }}
        >
            <Text style={styles.setItemText}>{set.name}</Text>
            <View style={styles.setItemDetails}>
                <Text style={styles.setItemCode}>{set.code}</Text>
                <Text style={styles.setItemCount}>{set.cardCount} cards</Text>
            </View>
        </TouchableOpacity>
    ), [loadPriceData]);

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
            
            // Check if MTGJson database exists
            const allPrintingsDb = AllPrintingsJsonDatabase.getInstance();
            const dbExists = await allPrintingsDb.databaseExists();
            
            if (!dbExists) {
                console.log('[WatchlistScreen] MTGJson database does not exist, downloading...');
                const downloadSuccess = await allPrintingsDb.downloadMTGJsonDatabase();
                
                if (!downloadSuccess) {
                    console.error('[WatchlistScreen] Failed to download MTGJson database');
                    throw new Error('Failed to download MTGJson database');
                }
                
                console.log('[WatchlistScreen] MTGJson database downloaded successfully');
            }
            
            // Reinitialize database if needed
            await AllPrintingsJsonDatabase.getInstance().reinitializePrices();
            const dbManager = new DatabaseManager();
            await dbManager.initialize();
            const priceService = new PriceService(dbManager);
            await priceService.initialize();
            
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
            }
            
            // Reload price data
            loadPriceData(searchQuery, true);
            
            setIsRefreshing(false);
            console.log('[WatchlistScreen] Price refresh completed successfully');
        } catch (error) {
            console.error('[WatchlistScreen] Error refreshing prices:', error);
            setIsRefreshing(false);
            Alert.alert('Error', 'Failed to refresh price data. Please try again later.');
        }
    };

    const renderSetModal = () => (
        <Modal
            visible={isSetModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => {
                setIsSetModalVisible(false);
                setSetSearchText('');
            }}
            statusBarTranslucent={true}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.setModalContainer}>
                    <View style={styles.setModalHeader}>
                        <Text style={styles.setModalTitle}>Select a Set</Text>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => {
                                setIsSetModalVisible(false);
                                setSetSearchText('');
                            }}
                        >
                            <Icon name="close" size={24} color="#000" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.setSearchContainer}>
                        <Icon name="magnify" size={20} color="#666" style={styles.searchIcon} />
                        <TextInput
                            style={styles.setSearchInput}
                            placeholder="Search sets..."
                            value={setSearchText}
                            onChangeText={setSetSearchText}
                            autoCapitalize="none"
                        />
                    </View>
                    {isSetModalLoading ? (
                        <View style={styles.setModalLoadingContainer}>
                            <ActivityIndicator size="small" color="#2196F3" />
                            <Text style={styles.loadingText}>Loading sets...</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={filteredSets}
                            renderItem={renderSetItem}
                            keyExtractor={(set) => set.code}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            initialNumToRender={15}
                            maxToRenderPerBatch={20}
                            windowSize={10}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );

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
            {isSetLoading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#2196F3" />
                    <Text style={styles.loadingText}>Loading set data...</Text>
                </View>
            )}
            <View style={styles.header}>
                <View style={styles.searchContainer}>
                    <TouchableOpacity
                        style={styles.setButton}
                        onPress={handleSetModalOpen}
                    >
                        <Text style={styles.setButtonText}>
                            {selectedSet ? selectedSet.code : 'All Sets'}
                        </Text>
                        <Icon name="chevron-down" size={20} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.sortButton}
                        onPress={() => setSortBy(prev => prev === 'normal_price' ? 'foil_price' : 'normal_price')}
                    >
                        <Icon name="sort" size={20} color="#000" style={styles.buttonIcon} />
                        <Text style={styles.buttonText}>Sort: {sortBy === 'normal_price' ? 'Normal' : 'Foil'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, isRefreshing && styles.refreshButtonDisabled]}
                        onPress={handleRefreshPrices}
                        disabled={isRefreshing}
                    >
                        {isRefreshing ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Icon name="refresh" size={20} color="#fff" style={styles.buttonIcon} />
                                <Text style={styles.actionButtonText}>Update</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            <SectionList
                sections={priceData}
                renderItem={renderCard}
                renderSectionHeader={renderSetSection}
                keyExtractor={(item) => item.uuid}
                onEndReached={() => {
                    if (!isLoading && !isSearching && hasMore && !selectedSet) {
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
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={5}
                removeClippedSubviews={true}
                contentContainerStyle={styles.listContent}
            />

            {renderSetModal()}

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
        backgroundColor: '#F8FAFD',
    },
    header: {
        paddingTop: 8,
        paddingBottom: 8,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E6EF',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginHorizontal: 16,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        shadowColor: '#1A2D4D',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    setButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E0E6EF',
        marginRight: 8,
    },
    sortButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E0E6EF',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#4A6FA5',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginLeft: 'auto',
    },
    cardItem: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginHorizontal: 16,
        marginVertical: 6,
        padding: 12,
        shadowColor: '#1A2D4D',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    cardImageContainer: {
        position: 'relative',
        marginRight: 12,
    },
    cardImage: {
        width: 70,
        height: 98,
        borderRadius: 6,
        resizeMode: 'contain',
    },
    setBadge: {
        position: 'absolute',
        bottom: -6,
        right: -6,
        backgroundColor: '#4A6FA5',
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: 4,
    },
    setCodeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '600',
    },
    cardInfo: {
        flex: 1,
        justifyContent: 'space-between',
    },
    cardName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1A2D4D',
        marginBottom: 6,
    },
    pricePillContainer: {
        flexDirection: 'row',
        gap: 6,
    },
    pricePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(74, 111, 165, 0.1)',
    },
    normalPill: {
        backgroundColor: '#F8FAFD',
        borderWidth: 1,
        borderColor: '#E0E7FF',
    },
    foilPill: {
        backgroundColor: '#FFF4E5',
        borderWidth: 1,
        borderColor: '#FFE0B2',
    },
    pricePillText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#4A6FA5',
        marginRight: 4,
    },
    pricePillValue: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1A2D4D',
    },
    priceGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    priceColumn: {
        width: '48%',
        marginBottom: 8,
    },
    priceSourceTitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#6B7C95',
        marginBottom: 2,
    },
    priceGridRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    priceGridLabel: {
        fontSize: 11,
        color: '#6B7C95',
    },
    priceGridValue: {
        fontSize: 11,
        fontWeight: '500',
        color: '#1A2D4D',
    },
    lastUpdated: {
        fontSize: 9,
        color: '#A3B2C8',
        textAlign: 'right',
        marginTop: 4,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
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
    refreshButtonDisabled: {
        opacity: 0.7,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 16,
        color: '#6B7C95',
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 24,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    setModalContainer: {
        backgroundColor: '#FFFFFF',
        width: '90%',
        height: '80%',
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: '#1A2D4D',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 5,
    },
    setModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: 'white',
    },
    setModalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    setItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F4F9',
        backgroundColor: '#FFFFFF',
    },
    setItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1A2D4D',
        marginBottom: 4,
    },
    setItemDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    setItemCount: {
        fontSize: 12,
        color: '#666',
    },
    setButtonText: {
        marginRight: 5,
        fontSize: 13,
    },
    setSearchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
    },
    searchIcon: {
        marginLeft: 5,
    },
    setSearchInput: {
        flex: 1,
        height: 40,
        paddingHorizontal: 10,
        fontSize: 16,
    },
    setItemCode: {
        fontSize: 12,
        color: '#6B7C95',
        fontWeight: '500',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 10,
    },
    setModalLoadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonIcon: {
        marginRight: 4,
    },
    buttonText: {
        color: '#000',
        fontSize: 13,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 13,
    },
    setHeader: {
        backgroundColor: '#FFFFFF',
        padding: 12,
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 4,
        borderRadius: 12,
        shadowColor: '#1A2D4D',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    setTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1A2D4D',
        letterSpacing: 0.5,
    },
    cardCount: {
        fontSize: 12,
        color: '#6B7C95',
        fontWeight: '500',
    },
    listContent: {
        paddingBottom: 20,
    }
});

export default WatchlistScreen;