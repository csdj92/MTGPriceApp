import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    Modal,
    ScrollView,
    Dimensions,
    Alert,
    ActivityIndicator,
    Button,
} from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import type { ExtendedCard } from '../types/card';
import { databaseService, getDB } from '../services/DatabaseService';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDebouncedCallback } from 'use-debounce';
import { InteractionManager } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { CardDetailModal } from './CardDetail';
import useThemedStyles from '../hooks/useThemedStyles';
import type { Theme } from '../context/ThemeContext';
import SortHeader from './shared/SortHeader';
import MTGFilters from './MTGFilters';
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<any>;
interface MTGGridViewProps {
    cards: ExtendedCard[];
    isLoading: boolean;
    onCardPress: (card: ExtendedCard) => void;
    onDeleteCard: (card: ExtendedCard) => void;
    onCardsUpdate?: (updatedCards: ExtendedCard[]) => void;
    collectionId: string;
    error?: Error | null;
}

type SortOption = 'name' | 'price' | 'number';
type SortDirection = 'asc' | 'desc';

interface Filters {
    search: string;
    rarities: string[];
    colors: string[];
    collectionStatus: 'all' | 'collected' | 'missing';
    priceRange: {
        min: number | null;
        max: number | null;
    };
}

const NUM_COLUMNS = 3;
const ITEMS_PER_PAGE = 10;
const CARD_ASPECT_RATIO = 0.68;
const IMAGE_PRIORITY = FastImage.priority.normal;
const IMAGE_CACHE = FastImage.cacheControl.immutable;

interface CardRow {
    uuid: string;
    name: string;
    setCode: string;
    number: string;
    rarity: string;
    type: string;
    setName: string;
    normal_price: number;
    foil_price: number;
    tcg_normal_price: number;
    tcg_foil_price: number;
    cardmarket_normal_price: number;
    cardmarket_foil_price: number;
}

export const getBestPrice = (prices: any, isFoil: boolean = false): number => {
    // First check direct prices
    if (isFoil) {
        if (prices?.usdFoil) return parseFloat(prices.usdFoil);
        if (prices?.foil) return parseFloat(prices.foil);
    } else {
        if (prices?.usd) return parseFloat(prices.usd);
        if (prices?.normal) return parseFloat(prices.normal);
    }

    // Then check marketplace prices
    const marketplaces = ['tcgplayer', 'cardkingdom', 'cardmarket', 'cardsphere'];
    for (const marketplace of marketplaces) {
        const marketPrices = prices?.[marketplace];
        if (!marketPrices) continue;

        if (isFoil) {
            if (marketPrices.foil) return parseFloat(marketPrices.foil);
        } else {
            if (marketPrices.normal) return parseFloat(marketPrices.normal);
        }
    }

    // Fallback to 0 if no prices found
    return 0;
};

interface SortState {
    sortBy: SortOption;
    direction: SortDirection;
}

interface ModalState {
    showFilters: boolean;
    selectedCard: ExtendedCard | null;
    availableVersions: ExtendedCard[];
    showFoil: boolean;
    setShowFoil: (value: boolean) => void;
}

const DEFAULT_FILTERS: Filters = {
    search: '',
    rarities: [],
    colors: [],
    collectionStatus: 'all',
    priceRange: { min: null, max: null }
};

const INITIAL_MODAL_STATE: ModalState = {
    showFilters: false,
    selectedCard: null,
    availableVersions: [],
    showFoil: false,
    setShowFoil: () => {}
};

const CARD_VARIANTS_QUERY = `
    SELECT 
        c.uuid,
        c.name,
        c.setCode,
        c.number,
        c.rarity,
        c.type,
        s.name as setName,
        COALESCE(p.normal_price, 0) as normal_price,
        COALESCE(p.foil_price, 0) as foil_price,
        COALESCE(p.tcg_normal_price, 0) as tcg_normal_price,
        COALESCE(p.tcg_foil_price, 0) as tcg_foil_price,
        COALESCE(p.cardmarket_normal_price, 0) as cardmarket_normal_price,
        COALESCE(p.cardmarket_foil_price, 0) as cardmarket_foil_price
    FROM cards c
    LEFT JOIN prices p ON c.uuid = p.uuid
    LEFT JOIN sets s ON c.setCode = s.code
    WHERE c.name = ?
    ORDER BY s.releaseDate DESC
`;

const rarityOptions = ['common', 'uncommon', 'rare', 'mythic'];

const handleFetchError = (error: unknown) => {
    console.error('Error fetching card variants:', error);
    Alert.alert('Error', 'Failed to fetch card variants');
};

const MTGGridView: React.FC<MTGGridViewProps> = ({ error, ...props }) => {
    const { theme } = useTheme();
    const styles = useStyles();

    if (error) {
        return (
            <View style={styles.errorContainer}>
                <Icon name="alert-circle" size={48} color={theme.error} />
                <Text style={styles.errorText}>Error loading cards</Text>
                <Button 
                    title="Retry" 
                    onPress={() => {/* Add retry logic */}} 
                />
            </View>
        );
    }
    // State
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [showFilters, setShowFilters] = useState(false);
    const [sortState, setSortState] = useState<SortState>({ sortBy: 'number', direction: 'asc' });
    const [showFoil, setShowFoil] = useState(false);
    const [modalState, setModalState] = useState<ModalState>({
        ...INITIAL_MODAL_STATE,
        showFoil,
        setShowFoil
    });

    // Filter options
    const colorOptions = ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless', 'Multicolor'];

    // Callbacks for filters and sorting
    const updateFilters = useCallback((newFilters: Filters) => {
        setFilters(newFilters);
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    const toggleSort = useCallback((newSortBy: SortOption) => {
        setSortState(prev => ({
            sortBy: newSortBy,
            direction: prev.sortBy === newSortBy && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

    // Memoized filtered cards
    const filteredCards = useMemo(() => {
        // Apply filtering
        let cardsToFilter = props.cards;
        if (filters.search) {
            cardsToFilter = cardsToFilter.filter(card => 
                card.name.toLowerCase().includes(filters.search.toLowerCase())
            );
        }
        if (filters.rarities.length > 0) {
            cardsToFilter = cardsToFilter.filter(card => 
                filters.rarities.includes((card.rarity || '').toLowerCase())
            );
        }
        if (filters.colors.length > 0) {
            cardsToFilter = cardsToFilter.filter(card => {
                const cardColors = card.colors?.map(c => c.toLowerCase()) || [];
                if (filters.colors.includes('Colorless') && cardColors.length === 0) return true;
                if (filters.colors.includes('Multicolor') && cardColors.length > 1) return true;
                return cardColors.some(cc => filters.colors.map(fc => fc.toLowerCase()).includes(cc));
            });
        }
        if (filters.collectionStatus !== 'all') {
            cardsToFilter = cardsToFilter.filter(card => 
                filters.collectionStatus === 'collected' ? (card.quantity ?? 0) > 0 : (card.quantity ?? 0) === 0
            );
        }
        if (filters.priceRange.min !== null) {
            cardsToFilter = cardsToFilter.filter(card => {
                const price = getBestPrice(card.prices, modalState.showFoil);
                return price >= (filters.priceRange.min ?? 0);
            });
        }
        if (filters.priceRange.max !== null) {
            cardsToFilter = cardsToFilter.filter(card => {
                const price = getBestPrice(card.prices, modalState.showFoil);
                return price <= (filters.priceRange.max ?? Infinity);
            });
        }

        // Apply sorting
        return cardsToFilter.sort(cardSorter(sortState));
    }, [props.cards, filters, sortState, modalState.showFoil]);

    // Handler memoization
    const handleCardPress = useCallback((card: ExtendedCard) => {
        // Get the most up-to-date version of the card from the filtered cards array
        const updatedCard = filteredCards.find(c => c.id === card.id) || card;
        setModalState(prev => ({ ...prev, selectedCard: updatedCard }));
    }, [filteredCards]);

    const handleLongPress = useCallback(async (card: ExtendedCard) => {
        try {
            const variants = await fetchCardVariants(card.name);
            setModalState(prev => ({ ...prev, availableVersions: variants }));
        } catch (error) {
            handleFetchError(error);
        }
    }, []);

    // Calculate item dimensions for getItemLayout
    const { width } = Dimensions.get('window');
    const CARD_WIDTH = width / NUM_COLUMNS - 8;
    const IMAGE_HEIGHT = CARD_WIDTH / CARD_ASPECT_RATIO;
    const INFO_HEIGHT_ESTIMATE = 40; // Adjust based on actual CardInfo height
    const CARD_HEIGHT = IMAGE_HEIGHT + INFO_HEIGHT_ESTIMATE + 8; // image + info + padding

    // Then define renderItem after CARD_WIDTH is declared
    const renderItem = useCallback(({ item, index }: { item: ExtendedCard; index: number }) => {
        const cardWidth = (Dimensions.get('window').width - 16) / NUM_COLUMNS;
        
        return (
            <CardItem 
                item={item}
                cardWidth={cardWidth}
                onPress={() => handleCardPress(item)}
                onLongPress={() => handleLongPress(item)}
            />
        );
    }, [handleCardPress, handleLongPress]);

    const handleVersionChange = (newVersion: ExtendedCard) => {
        if (props.onCardsUpdate) {
            const updatedCards = props.cards.map(card =>
                card.id === modalState.selectedCard?.id ? newVersion : card
            );
            props.onCardsUpdate(updatedCards);
        }
        // Update the selected card to the new version
        setModalState(prev => ({ ...prev, selectedCard: newVersion }));
    };

    const addToCollection = async (card: ExtendedCard) => {
        try {
            await databaseService.addCardToCollection(String(card.id), props.collectionId);
            
            // Create new array with updated card
            const updatedCards = props.cards.map(c => 
                c.id === card.id ? { ...c, quantity: 1 } : c
            );

            // Update parent component's state
            if (props.onCardsUpdate) {
                props.onCardsUpdate(updatedCards);
            }

            // Update modal state - this is crucial to immediately show the Mark as Missing button instead of the Add button
            setModalState(prev => ({
                ...prev,
                selectedCard: prev.selectedCard ? { ...prev.selectedCard, quantity: 1 } : null
            }));

            // Force immediate UI update by resetting filtered cards
            setFilters(prev => ({ ...prev })); // Trigger filter recalculation
        } catch (error) {
            console.error('Error adding card to collection:', error);
            Alert.alert('Error', 'Failed to add card to collection');
        }
    };

    // Handle marking a card as missing (quantity = 0)
    const markCardAsMissing = async (card: ExtendedCard) => {
        try {
            // Call the parent's onDeleteCard handler (which uses markCardAsMissing in DatabaseService)
            props.onDeleteCard(card);
            
            // Update local state to mark the card as missing (quantity = 0)
            const updatedCards = props.cards.map(c => 
                c.id === card.id ? { ...c, quantity: 0 } : c
            );
            
            // Update parent component's state
            if (props.onCardsUpdate) {
                props.onCardsUpdate(updatedCards);
            }
            
            // Update modal state - this is crucial to immediately show the Add button instead of the Mark as Missing button
            setModalState(prev => ({
                ...prev,
                selectedCard: prev.selectedCard ? { ...prev.selectedCard, quantity: 0 } : null
            }));
            
            // Force immediate UI update by resetting filtered cards
            setFilters(prev => ({ ...prev })); // Trigger filter recalculation
        } catch (error) {
            console.error('Error marking card as missing:', error);
            Alert.alert('Error', 'Failed to mark card as missing');
        }
    };

    // Optimize list configuration
    const getItemLayout = undefined;

    const keyExtractor = useCallback((item: ExtendedCard) => item.id, []);

    // Add performance markers
    useEffect(() => {
        const sub = InteractionManager.runAfterInteractions(() => {
            console.log('Grid rendering complete');
            // Add any post-render logic here
        });
        return () => sub.cancel();
    }, [filteredCards]);

    // Add this useEffect to preload images
    useEffect(() => {
        const preloadImages = async () => {
            await Promise.all(props.cards.map(card => 
                FastImage.preload([{ 
                    uri: card.imageUris?.normal || card.imageUrl,
                    cache: FastImage.cacheControl.immutable
                }])
            ));
        };
        preloadImages();
    }, [props.cards]);

    // Make sure showFoil state stays in sync with the state hook
    useEffect(() => {
        setModalState(prev => ({
            ...prev,
            showFoil,
            setShowFoil
        }));
    }, [showFoil]);

    return (
        <View style={styles.container}>
            <View style={styles.headerControlsContainer}>
                <SortHeader 
                    sortBy={sortState.sortBy}
                    sortDirection={sortState.direction}
                    onSortChange={toggleSort}
                    onFilterPress={() => setShowFilters(!showFilters)}
                />
            </View>
            
            {showFilters && (
                <MTGFilters
                    filters={filters}
                    onFiltersChange={updateFilters}
                    onReset={resetFilters}
                    visible={showFilters}
                />
            )}

            {props.isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            ) : filteredCards.length === 0 ? (
                <EmptyState />
            ) : (
                <FlatList
                    data={filteredCards}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    numColumns={NUM_COLUMNS}
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews
                    updateCellsBatchingPeriod={100}
                    contentContainerStyle={styles.grid}
                    onEndReachedThreshold={0.5}
                />
            )}

            <CardDetailModal
                state={{
                    selectedCard: modalState.selectedCard,
                    showFoil: modalState.showFoil,
                    setShowFoil: modalState.setShowFoil
                }}
                onClose={() => setModalState(prev => ({ ...prev, selectedCard: null }))}
                onVersionChange={handleVersionChange}
                onAddToCollection={addToCollection}
                onDeleteCard={markCardAsMissing}
            />
        </View>
    );
};

interface CardItemProps {
    item: ExtendedCard;
    cardWidth: number;
    onPress: () => void;
    onLongPress: () => void;
}

// Add skeleton loading component
const SkeletonCard = () => {
    const styles = useStyles();
    const { width } = Dimensions.get('window');
    const cardWidth = (width - 16) / NUM_COLUMNS; // Account for padding
    const { theme } = useTheme();
    
    return (
        <View style={[styles.cardContainer, styles.skeletonCard]}>
            <View style={[
                styles.skeletonImage, 
                { 
                    width: '100%',
                    height: cardWidth / CARD_ASPECT_RATIO,
                    aspectRatio: CARD_ASPECT_RATIO
                }
            ]}>
                <View style={styles.skeletonImageShimmer} />
            </View>
            <View style={[styles.skeletonText, { marginTop: 4, width: '60%' as any }]} />
            <View style={[styles.skeletonText, { width: '80%' as any }]} />
        </View>
    );
};

// Memoized Empty State Component
const EmptyState = memo(() => {
    const { theme } = useTheme();
    const styles = useStyles();
    
    return (
        <View style={styles.emptyContainer}>
            <Icon name="cards-outline" size={64} color={theme.borderLight} />
            <Text style={styles.emptyText}>No cards found</Text>
        </View>
    );
});

// CardItem component with proper styles access
const CardItem = memo(({ item, cardWidth, onPress, onLongPress }: CardItemProps) => {
    const [isLoading, setIsLoading] = useState(true);
    const imageUri = item.imageUris?.normal || item.imageUrl;
    const hasCollectionStatus = !!item.quantity;
    const styles = useStyles();
    
    const imageStyle = useMemo(() => [
        styles.cardImage, 
        { width: cardWidth, height: cardWidth / CARD_ASPECT_RATIO },
        !hasCollectionStatus && styles.cardImageUncollected
    ], [cardWidth, hasCollectionStatus, styles]);

    return (
        <TouchableOpacity 
            style={styles.cardContainer}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="button"
            accessibilityLabel={`Card: ${item.name}. ${hasCollectionStatus ? 'Collected' : 'Missing'}. ${item.hasFoil ? 'Has foil version' : ''}`}
        >
            <View style={styles.cardImageContainer}>
                <FastImage
                    source={{ 
                        uri: imageUri,
                        priority: FastImage.priority.high,
                        cache: FastImage.cacheControl.immutable
                    }}
                    style={imageStyle}
                    resizeMode={FastImage.resizeMode.cover}
                    onLoad={() => setIsLoading(false)}
                >
                    {isLoading && (
                        <View style={styles.imageLoadingOverlay}>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        </View>
                    )}
                </FastImage>
                {!hasCollectionStatus && (
                    <View style={styles.missingOverlay}>
                        <Icon name="plus-circle" size={24} color="white" />
                        <Text style={styles.missingText}>Missing</Text>
                    </View>
                )}
                {item.hasFoil && (
                    <View style={styles.foilIndicator}>
                        <Icon name="star" size={16} color="#FFD700" />
                    </View>
                )}
            </View>
            <CardInfo item={item} hasCollectionStatus={hasCollectionStatus} />
        </TouchableOpacity>
    );
});

// CardInfo component with proper styles access
const CardInfo = memo(({ item, hasCollectionStatus }: { item: ExtendedCard; hasCollectionStatus: boolean }) => {
    const normalPrice = useMemo(() => getBestPrice(item.prices, false).toFixed(2), [item.prices]);
    const foilPrice = useMemo(() => getBestPrice(item.prices, true).toFixed(2), [item.prices]);
    const styles = useStyles();

    return (
        <View style={[styles.cardInfo, !hasCollectionStatus && styles.cardInfoUncollected]}>
            <Text style={styles.cardNumber}>#{item.collectorNumber || '0'}</Text>
            <Text style={[styles.cardName, !hasCollectionStatus && styles.cardNameUncollected]} numberOfLines={1}>
                {item.name}
            </Text>
            <View style={styles.priceContainer}>
                {item.hasNonFoil && (
                    <Text style={[styles.cardPrice, !hasCollectionStatus && styles.cardPriceUncollected]}>
                        {getFormattedPrice(parseFloat(normalPrice))}
                    </Text>
                )}
                {item.hasFoil && (
                    <Text style={[styles.foilPrice, !hasCollectionStatus && styles.cardPriceUncollected]}>
                        {getFormattedPrice(parseFloat(foilPrice))} ✨
                    </Text>
                )}
            </View>
        </View>
    );
});

const fetchCardVariants = async (cardName: string) => {
    const db = await getDB();
    const results = await db!.executeSql(CARD_VARIANTS_QUERY, [cardName]);
    const rows: CardRow[] = [];
    for (let i = 0; i < results[0].rows.length; i++) {
        rows.push(results[0].rows.item(i));
    }
    return rows.map(transformCardRow);
};

const cardFilter = (filters: Filters) => (card: ExtendedCard) => {
    const matchesSearch = !filters.search || 
        card.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        card.text?.toLowerCase().includes(filters.search.toLowerCase());
        
    const matchesCollectionStatus = filters.collectionStatus === 'all' ||
        (filters.collectionStatus === 'collected' && card.quantity) ||
        (filters.collectionStatus === 'missing' && !card.quantity);

    const matchesRarity = filters.rarities.length === 0 || 
        filters.rarities.includes(card.rarity?.toLowerCase() || '');

    const price = getBestPrice(card.prices);
    const matchesPrice = (!filters.priceRange.min || (price && price >= filters.priceRange.min)) &&
        (!filters.priceRange.max || (price && price <= filters.priceRange.max));

    return matchesSearch && matchesCollectionStatus && matchesRarity && matchesPrice;
};

const cardSorter = ({ sortBy, direction }: SortState) => (a: ExtendedCard, b: ExtendedCard) => {
    switch (sortBy) {
        case 'name':
            return direction === 'asc' 
                ? a.name.localeCompare(b.name) 
                : b.name.localeCompare(a.name);
        case 'price': {
            const priceA = getBestPrice(a.prices);
            const priceB = getBestPrice(b.prices);
            return direction === 'asc' ? priceA - priceB : priceB - priceA;
        }
        default: {
            const numA = parseInt(a.collectorNumber, 10);
            const numB = parseInt(b.collectorNumber, 10);
            return direction === 'asc' ? numA - numB : numB - numA;
        }
    }
};

const transformCardRow = (row: CardRow): ExtendedCard => ({
    ...row,
    id: row.uuid,
    uuid: row.uuid,
    setCode: row.setCode,
    setName: row.setName,
    collectorNumber: row.number,
    type: row.type,
    rarity: row.rarity,
    imageUris: {
        small: `https://api.scryfall.com/cards/${row.setCode.toLowerCase()}/${row.number}?format=image`,
        normal: `https://api.scryfall.com/cards/${row.setCode.toLowerCase()}/${row.number}?format=image`,
        large: `https://api.scryfall.com/cards/${row.setCode.toLowerCase()}/${row.number}?format=image`,
        art_crop: `https://api.scryfall.com/cards/${row.setCode.toLowerCase()}/${row.number}?format=image`
    },
    hasNonFoil: Boolean(row.normal_price || row.tcg_normal_price || row.cardmarket_normal_price),
    hasFoil: Boolean(row.foil_price || row.tcg_foil_price || row.cardmarket_foil_price),
    prices: {},
    purchaseUrls: {},
    legalities: {},
    colorIdentity: [],
    keywords: [],
    cmc: 0,
    frameEffects: [],
});

const getFormattedPrice = (price: number) => 
    new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD', 
        minimumFractionDigits: 2 
    }).format(price);

// Style hook definition
const useStyles = () => useThemedStyles((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    headerControlsContainer: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: theme.surface, 
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center' as 'center',
        alignItems: 'center' as 'center',
    },
    grid: {
        padding: 4,
        rowGap: 8,
    },
    cardContainer: {
        flex: 1/NUM_COLUMNS,
        padding: 4,
        height: '100%' as any,
    },
    cardImageContainer: {
        position: 'relative' as any,
        width: '100%' as any,
        aspectRatio: CARD_ASPECT_RATIO,
    },
    cardImage: {
        width: '100%' as any,
        height: '100%' as any,
        borderRadius: 8,
    },
    cardImageUncollected: {
        opacity: 0.5,
    },
    missingOverlay: {
        position: 'absolute' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
        justifyContent: 'center' as any,
        alignItems: 'center' as any,
    },
    missingText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '500' as any,
        marginTop: 4,
    },
    cardInfo: {
        padding: 4,
    },
    cardInfoUncollected: {
        opacity: 0.7,
    },
    cardNumber: {
        fontSize: 10,
        color: theme.textSecondary,
        marginBottom: 2,
    },
    cardName: {
        fontSize: 12,
        fontWeight: '500' as const,
        marginBottom: 2,
        color: theme.text,
    },
    cardNameUncollected: {
        color: theme.textTertiary,
    },
    cardPrice: {
        fontSize: 12,
        color: theme.textSecondary,
    },
    cardPriceUncollected: {
        color: theme.textTertiary,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    modalContent: {
        width: '90%',
        maxHeight: '90%',
        backgroundColor: theme.surface,
        borderRadius: 8,
        padding: 16,
    },
    modalImageContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    modalImage: {
        width: '100%' as any,
        aspectRatio: CARD_ASPECT_RATIO,
        borderRadius: 8,
    },
    modalCloseButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    modalInfo: {
        padding: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold' as const,
        marginBottom: 8,
        color: theme.text,
    },
    modalText: {
        fontSize: 16,
        marginBottom: 8,
        color: theme.text,
    },
    modalPrices: {
        marginTop: 16,
    },
    modalPriceTitle: {
        fontSize: 18,
        fontWeight: 'bold' as const,
        marginBottom: 8,
        color: theme.text,
    },
    modalPrice: {
        fontSize: 16,
        marginBottom: 4,
        color: theme.text,
    },
    foilIndicator: {
        position: 'absolute' as any,
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 12,
        padding: 4,
    },
    priceContainer: {
        flexDirection: 'column' as const,
        alignItems: 'flex-start' as const,
        gap: 2,
    },
    foilPrice: {
        fontSize: 12,
        color: theme.textSecondary,
        fontStyle: 'italic' as const,
    },
    modalHeader: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        marginBottom: 8,
    },
    foilToggle: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        padding: 8,
        borderRadius: 4,
        backgroundColor: theme.background,
        gap: 4,
    },
    foilToggleActive: {
        backgroundColor: theme.primary,
    },
    foilToggleText: {
        fontSize: 14,
        color: theme.textSecondary,
    },
    foilToggleTextActive: {
        color: 'white',
    },
    // Add more themed styles here
    emptyContainer: {
        flex: 1,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        padding: 20,
        minHeight: 300,
    },
    emptyText: {
        fontSize: 18,
        color: theme.textSecondary,
        marginTop: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        backgroundColor: theme.background,
        padding: 20,
    },
    errorText: {
        fontSize: 18,
        color: theme.error,
        marginVertical: 16,
    },
    skeletonCard: {
        flex: 1,
        padding: 4,
        backgroundColor: 'transparent',
    },
    skeletonImage: {
        width: '100%' as any,
        borderRadius: 8,
        backgroundColor: theme.borderLight,
    },
    skeletonImageShimmer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        overflow: 'hidden' as 'hidden',
    },
    skeletonText: {
        height: 12,
        backgroundColor: theme.borderLight,
        borderRadius: 4,
        marginBottom: 4,
        width: '80%' as any,
        marginTop: 2,
    },
    imageLoadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    versionOption: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    versionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    versionImage: {
        width: 60,
        height: 84,
        borderRadius: 4,
        marginRight: 12,
    },
    versionInfo: {
        flex: 1,
    },
    versionText: {
        fontSize: 16,
        marginBottom: 4,
    },
    versionSetText: {
        fontSize: 14,
        color: '#666',
    },
    addButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        alignItems: 'center',
    },
    addButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    deleteButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#f44336',
        borderRadius: 8,
        alignItems: 'center',
    },
    deleteButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    advancedFilterButton: {
        padding: 8,
        backgroundColor: theme.primary,
        borderRadius: 4,
        marginVertical: 8,
        alignItems: 'center' as any,
    },
    advancedFilterText: {
        color: 'white',
        fontWeight: '500' as any,
    },
    advancedFilters: {
        marginTop: 8,
    },
    priceRangeContainer: {
        flexDirection: 'row' as any,
        alignItems: 'center' as any,
        gap: 8,
    },
    priceInput: {
        flex: 1,
        height: 40,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 4,
        paddingHorizontal: 8,
    },
    priceRangeSeparator: {
        fontSize: 16,
        color: '#666',
    },
    tabContent: {
        padding: 16,
        flex: 1,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    noContentText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    rulingItem: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#f9f9f9',
        borderRadius: 8,
        borderLeftWidth: 4,
        borderLeftColor: '#0066cc',
    },
    rulingDate: {
        fontSize: 14,
        fontWeight: 'bold' as const,
        color: '#666',
        marginBottom: 4,
    },
    rulingText: {
        fontSize: 16,
        color: '#333',
    },
    variationItem: {
        flexDirection: 'row',
        marginBottom: 12,
        padding: 8,
        backgroundColor: '#f9f9f9',
        borderRadius: 8,
    },
    variationImageContainer: {
        width: 80,
        height: 112,
        marginRight: 12,
    },
    variationImage: {
        width: '100%' as any,
        height: '100%' as any,
        borderRadius: 4,
    },
    variationInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    variationSetName: {
        fontSize: 16,
        fontWeight: 'bold' as const,
        marginBottom: 4,
    },
    variationNumber: {
        fontSize: 14,
        color: '#666',
    },
    variationRarity: {
        fontSize: 14,
        color: '#666',
        textTransform: 'capitalize' as any,
        marginBottom: 8,
    },
    variationPrices: {
        marginTop: 4,
    },
    variationPrice: {
        fontSize: 14,
        color: '#0066cc',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    modalButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0066cc',
        padding: 10,
        borderRadius: 8,
        flex: 1,
        marginHorizontal: 4,
    },
    modalButtonDanger: {
        backgroundColor: '#cc0000',
    },
    modalButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        marginLeft: 6,
    },
}));

export default MTGGridView;