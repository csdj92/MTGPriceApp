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
    showVersionModal: boolean;
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
    showVersionModal: false,
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
    if (error) {
        return (
            <View style={styles.errorContainer}>
                <Icon name="alert-circle" size={48} color="#ff4444" />
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
    const [modalState, setModalState] = useState<ModalState>(INITIAL_MODAL_STATE);

    // Filter options
    const colorOptions = ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless', 'Multicolor'];

    // Memoized filtered cards
    const filteredCards = useMemo(() => {
        return props.cards.filter(cardFilter(filters)).sort(cardSorter(sortState));
    }, [props.cards, filters, sortState]);

    // Handler memoization
    const handleCardPress = useCallback((card: ExtendedCard) => {
        setModalState(prev => ({ ...prev, selectedCard: card }));
    }, []);

    const handleLongPress = useCallback(async (card: ExtendedCard) => {
        try {
            const variants = await fetchCardVariants(card.name);
            setModalState(prev => ({ ...prev, availableVersions: variants, showVersionModal: true }));
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
    const renderItem = useCallback(
        ({ item }: { item: ExtendedCard }) => (
            <CardItem
                item={item}
                cardWidth={CARD_WIDTH}
                onPress={() => handleCardPress(item)}
                onLongPress={() => handleLongPress(item)}
            />
        ),
        [handleCardPress, handleLongPress, CARD_WIDTH]
    );

    const handleVersionChange = (newVersion: ExtendedCard) => {
        if (props.onCardsUpdate) {
            const updatedCards = props.cards.map(card =>
                card.id === modalState.selectedCard?.id ? newVersion : card
            );
            props.onCardsUpdate(updatedCards);
        }
        setModalState(prev => ({ ...prev, showVersionModal: false }));
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

            // Update local state references
            setModalState(prev => ({
                ...prev,
                selectedCard: prev.selectedCard ? { ...prev.selectedCard, quantity: 1 } : null,
                availableVersions: prev.availableVersions.map(v => v.id === card.id ? { ...v, quantity: 1 } : v)
            }));

            // Force immediate UI update by resetting filtered cards
            setFilters(prev => ({ ...prev })); // Trigger filter recalculation

            setModalState(prev => ({ ...prev, showVersionModal: false }));
        } catch (error) {
            console.error('Error adding card to collection:', error);
            Alert.alert('Error', 'Failed to add card to collection');
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.filterButtonContainer}>
                    <TouchableOpacity
                        style={styles.filterButton}
                        onPress={() => setShowFilters(!showFilters)}
                        accessibilityRole="button"
                        accessibilityLabel={showFilters ? "Hide filters" : "Show filters"}
                        accessibilityState={{ expanded: showFilters }}
                    >
                        <Icon name="filter-variant" size={24} color="#2196F3" />
                        <Text style={styles.buttonText}>
                            Filter
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.sortContainer}>
                    <View style={styles.sortButtonContainer}>
                        <TouchableOpacity
                            style={[styles.sortButton, sortState.sortBy === 'name' && styles.sortButtonActive]}
                            onPress={() => setSortState(prev => ({ ...prev, sortBy: 'name' }))}
                        >
                            <Icon
                                name="order-alphabetical-ascending"
                                size={24}
                                color={sortState.sortBy === 'name' ? '#2196F3' : '#666'}
                            />
                            <Text style={[styles.sortButtonText, sortState.sortBy === 'name' && styles.sortButtonTextActive]}>
                                Name
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.sortButtonContainer}>
                        <TouchableOpacity
                            style={[styles.sortButton, sortState.sortBy === 'price' && styles.sortButtonActive]}
                            onPress={() => setSortState(prev => ({ ...prev, sortBy: 'price' }))}
                        >
                            <Icon
                                name="currency-usd"
                                size={24}
                                color={sortState.sortBy === 'price' ? '#2196F3' : '#666'}
                            />
                            <Text style={[styles.sortButtonText, sortState.sortBy === 'price' && styles.sortButtonTextActive]}>
                                Price
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.sortButtonContainer}>
                        <TouchableOpacity
                            style={[styles.sortButton, sortState.sortBy === 'number' && styles.sortButtonActive]}
                            onPress={() => setSortState(prev => ({ ...prev, sortBy: 'number' }))}
                        >
                            <Icon
                                name="order-numeric-ascending"
                                size={24}
                                color={sortState.sortBy === 'number' ? '#2196F3' : '#666'}
                            >
                            </Icon>
                            <Text style={[styles.sortButtonText, sortState.sortBy === 'number' && styles.sortButtonTextActive]}>
                                Number
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.sortButtonContainer}>
                        <TouchableOpacity
                            style={styles.sortButton}
                            onPress={() => setSortState(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                        >
                            <Icon
                                name={sortState.direction === 'asc' ? 'sort-ascending' : 'sort-descending'}
                                size={24}
                                color="#2196F3"
                            />
                            <Text style={styles.sortButtonText}>
                                {sortState.direction === 'asc' ? 'Asc' : 'Desc'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <FilterPanel
                visible={showFilters}
                filters={filters}
                onFilterChange={setFilters}
            />

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
                ListEmptyComponent={props.isLoading ? (
                    <FlatList
                        data={Array(10).fill(0)}
                        renderItem={() => <SkeletonCard />}
                        numColumns={NUM_COLUMNS}
                    />
                ) : <EmptyState />}
            />

            <CardDetailModal
                state={modalState}
                onClose={() => setModalState(INITIAL_MODAL_STATE)}
                onVersionChange={handleVersionChange}
                onAddToCollection={addToCollection}
                onDeleteCard={props.onDeleteCard}
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

const CardItem = memo(({ item, cardWidth, onPress, onLongPress }: CardItemProps) => {
    const [isLoading, setIsLoading] = useState(true);
    const imageUri = item.imageUris?.normal || item.imageUrl;
    const hasCollectionStatus = !!item.quantity;
    
    const imageStyle = useMemo(() => [
        styles.cardImage, 
        { width: cardWidth, height: cardWidth / CARD_ASPECT_RATIO },
        !hasCollectionStatus && styles.cardImageUncollected
    ], [cardWidth, hasCollectionStatus]);

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

const getFormattedPrice = (price: number) => 
    new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD', 
        minimumFractionDigits: 2 
    }).format(price);

const CardInfo = memo(({ item, hasCollectionStatus }: { item: ExtendedCard; hasCollectionStatus: boolean }) => {
    const normalPrice = useMemo(() => getBestPrice(item.prices, false).toFixed(2), [item.prices]);
    const foilPrice = useMemo(() => getBestPrice(item.prices, true).toFixed(2), [item.prices]);

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

const FilterPanel = memo(({ visible, filters, onFilterChange }: { 
    visible: boolean; 
    filters: Filters; 
    onFilterChange: React.Dispatch<React.SetStateAction<Filters>> 
}) => {
    const [searchQuery, setSearchQuery] = useState(filters.search);
    const [showAdvanced, setShowAdvanced] = useState(false);
    
    const debouncedSearch = useDebouncedCallback((text: string) => {
        onFilterChange(prev => ({ ...prev, search: text }));
    }, 300);

    const handleRarityChange = (rarity: string) => {
        const newRarities = filters.rarities.includes(rarity)
            ? filters.rarities.filter(r => r !== rarity)
            : [...filters.rarities, rarity];
        onFilterChange(prev => ({ ...prev, rarities: newRarities }));
    };

    const handlePriceRangeChange = (type: 'min' | 'max', value: string) => {
        const numValue = value ? parseFloat(value) : null;
        onFilterChange(prev => ({
            ...prev,
            priceRange: {
                ...prev.priceRange,
                [type]: numValue
            }
        }));
    };

    if (!visible) return null;

    return (
        <View style={styles.filtersPanel}>
            <TextInput
                style={styles.searchInput}
                placeholder="Search cards..."
                value={searchQuery}
                onChangeText={(text) => {
                    setSearchQuery(text);
                    debouncedSearch(text);
                }}
                autoCorrect={false}
                autoCapitalize="none"
            />

            <TouchableOpacity
                style={styles.advancedFilterButton}
                onPress={() => setShowAdvanced(!showAdvanced)}
            >
                <Text style={styles.advancedFilterText}>
                    {showAdvanced ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
                </Text>
            </TouchableOpacity>

            {showAdvanced && (
                <View style={styles.advancedFilters}>
                    <View style={styles.filterSection}>
                        <Text style={styles.filterTitle}>Rarity</Text>
                        <View style={styles.filterOptions}>
                            {rarityOptions.map(rarity => (
                                <TouchableOpacity
                                    key={rarity}
                                    style={[
                                        styles.filterChip,
                                        filters.rarities.includes(rarity) && styles.filterChipSelected
                                    ]}
                                    onPress={() => handleRarityChange(rarity)}
                                >
                                    <Text style={[
                                        styles.filterChipText,
                                        filters.rarities.includes(rarity) && styles.filterChipTextSelected
                                    ]}>
                                        {rarity}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.filterSection}>
                        <Text style={styles.filterTitle}>Price Range</Text>
                        <View style={styles.priceRangeContainer}>
                            <TextInput
                                style={styles.priceInput}
                                placeholder="Min"
                                keyboardType="numeric"
                                value={filters.priceRange.min?.toString() || ''}
                                onChangeText={(text) => handlePriceRangeChange('min', text)}
                            />
                            <Text style={styles.priceRangeSeparator}>-</Text>
                            <TextInput
                                style={styles.priceInput}
                                placeholder="Max"
                                keyboardType="numeric"
                                value={filters.priceRange.max?.toString() || ''}
                                onChangeText={(text) => handlePriceRangeChange('max', text)}
                            />
                        </View>
                    </View>

                    <View style={styles.filterSection}>
                        <Text style={styles.filterTitle}>Collection Status</Text>
                        <View style={styles.filterOptions}>
                            {['all', 'collected', 'missing'].map(status => (
                                <TouchableOpacity
                                    key={status}
                                    style={[
                                        styles.filterChip,
                                        filters.collectionStatus === status && styles.filterChipSelected
                                    ]}
                                    onPress={() => onFilterChange(prev => ({
                                        ...prev,
                                        collectionStatus: status as 'all' | 'collected' | 'missing'
                                    }))}
                                >
                                    <Text style={[
                                        styles.filterChipText,
                                        filters.collectionStatus === status && styles.filterChipTextSelected
                                    ]}>
                                        {status}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            )}

            <TouchableOpacity
                style={styles.resetButton}
                onPress={() => {
                    setSearchQuery('');
                    onFilterChange(DEFAULT_FILTERS);
                }}
            >
                <Text style={styles.resetButtonText}>Reset Filters</Text>
            </TouchableOpacity>
        </View>
    );
});

const CardDetailModal = ({ state, onClose, onVersionChange, onAddToCollection, onDeleteCard }: { state: ModalState; onClose: () => void; onVersionChange: (newVersion: ExtendedCard) => void; onAddToCollection: (card: ExtendedCard) => void; onDeleteCard: (card: ExtendedCard) => void }) => {
    const normalPrice = useMemo(() => getBestPrice(state.selectedCard?.prices, false).toFixed(2), [state.selectedCard?.prices]);
    const foilPrice = useMemo(() => getBestPrice(state.selectedCard?.prices, true).toFixed(2), [state.selectedCard?.prices]);

    return (
        <Modal
            visible={state.selectedCard !== null}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    {state.selectedCard && (
                        <ScrollView>
                            <View style={styles.modalImageContainer}>
                                <FastImage
                                    source={{ 
                                        uri: `${state.selectedCard.imageUris?.normal || state.selectedCard.imageUrl}${state.showFoil ? '&version=foil' : ''}`,
                                        priority: FastImage.priority.high,
                                        cache: FastImage.cacheControl.immutable
                                    }}
                                    style={styles.modalImage}
                                    resizeMode={FastImage.resizeMode.contain}
                                />
                                <TouchableOpacity
                                    style={styles.modalCloseButton}
                                    onPress={onClose}
                                >
                                    <Icon name="close" size={28} color="#666" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.modalInfo}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>{state.selectedCard.name}</Text>
                                    {state.selectedCard.hasFoil && (
                                        <TouchableOpacity 
                                            style={[styles.foilToggle, state.showFoil && styles.foilToggleActive]}
                                            onPress={() => state.setShowFoil(!state.showFoil)}
                                        >
                                            <Icon 
                                                name={state.showFoil ? "checkbox-marked" : "checkbox-blank-outline"} 
                                                size={24} 
                                                color={state.showFoil ? "#FFD700" : "#666"} 
                                            />
                                            <Text style={[styles.foilToggleText, state.showFoil && styles.foilToggleTextActive]}>
                                                Foil
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <Text style={styles.modalText}>Set: {state.selectedCard.setName}</Text>
                                <Text style={styles.modalText}>Card Number: {state.selectedCard.collectorNumber}</Text>
                                <Text style={styles.modalText}>Rarity: {state.selectedCard.rarity}</Text>
                                <Text style={styles.modalText}>Type: {state.selectedCard.type}</Text>
                                {state.selectedCard.manaCost && (
                                    <Text style={styles.modalText}>Mana Cost: {state.selectedCard.manaCost}</Text>
                                )}
                                {state.selectedCard.text && (
                                    <Text style={styles.modalText}>Card Text: {state.selectedCard.text}</Text>
                                )}
                                <View style={styles.modalPrices}>
                                    <Text style={styles.modalPriceTitle}>Prices:</Text>
                                    {state.selectedCard.hasNonFoil && (
                                        <Text style={styles.modalPrice}>Normal: {getFormattedPrice(parseFloat(normalPrice))}</Text>
                                    )}
                                    {state.selectedCard.hasFoil && (
                                        <Text style={styles.modalPrice}>Foil: {getFormattedPrice(parseFloat(foilPrice))}</Text>
                                    )}
                                </View>
                            </View>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
};

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

// Memoized Empty State Component
const EmptyState = memo(() => (
    <View style={styles.emptyContainer}>
        <Icon name="cards-outline" size={64} color="#e0e0e0" />
        <Text style={styles.emptyText}>No cards found</Text>
    </View>
));

// Add skeleton loading component
const SkeletonCard = () => (
    <View style={[styles.cardContainer, styles.skeletonCard]}>
        <View style={[styles.cardImage, styles.skeletonImage]} />
        <View style={styles.skeletonText} />
        <View style={styles.skeletonText} />
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    filterButtonContainer: {
        alignItems: 'center',
    },
    filterButton: {
        flexDirection: 'column',
        alignItems: 'center',
        padding: 8,
        borderRadius: 4,
        gap: 2,
    },
    buttonText: {
        fontSize: 10,
        color: '#2196F3',
        marginTop: 2,
    },
    sortContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sortButtonContainer: {
        alignItems: 'center',
    },
    sortButton: {
        flexDirection: 'column',
        alignItems: 'center',
        padding: 8,
        borderRadius: 4,
        gap: 2,
    },
    sortButtonActive: {
        backgroundColor: '#e3f2fd',
    },
    sortButtonText: {
        fontSize: 10,
        color: '#666',
        marginTop: 2,
    },
    sortButtonTextActive: {
        color: '#2196F3',
        fontWeight: '500',
    },
    filtersPanel: {
        backgroundColor: 'white',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    filtersPanelHidden: {
        display: 'none',
    },
    searchInput: {
        height: 40,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 4,
        paddingHorizontal: 8,
        marginBottom: 16,
    },
    filterSection: {
        marginBottom: 16,
    },
    filterTitle: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
    },
    filterOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        backgroundColor: 'white',
    },
    filterChipSelected: {
        backgroundColor: '#2196F3',
        borderColor: '#2196F3',
    },
    filterChipText: {
        color: '#666',
    },
    filterChipTextSelected: {
        color: 'white',
    },
    resetButton: {
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 4,
        backgroundColor: '#f44336',
    },
    resetButtonText: {
        color: 'white',
        fontWeight: '500',
    },
    grid: {
        padding: 4,
        rowGap: 8,
    },
    cardContainer: {
        flex: 1/NUM_COLUMNS,
        padding: 4,
        height: '100%',
    },
    cardImageContainer: {
        position: 'relative',
        width: '100%',
        aspectRatio: CARD_ASPECT_RATIO,
    },
    cardImage: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
    },
    cardImageUncollected: {
        opacity: 0.5,
    },
    missingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    missingText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '500',
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
        color: '#666',
        marginBottom: 2,
    },
    cardName: {
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 2,
    },
    cardNameUncollected: {
        color: '#999',
    },
    cardPrice: {
        fontSize: 12,
        color: '#666',
    },
    cardPriceUncollected: {
        color: '#999',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxHeight: '90%',
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 16,
    },
    modalImageContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    modalImage: {
        width: '100%',
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
        fontWeight: 'bold',
        marginBottom: 8,
    },
    modalText: {
        fontSize: 16,
        marginBottom: 8,
    },
    modalPrices: {
        marginTop: 16,
    },
    modalPriceTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    modalPrice: {
        fontSize: 16,
        marginBottom: 4,
    },
    foilIndicator: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 12,
        padding: 4,
    },
    priceContainer: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
    },
    foilPrice: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    foilToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 4,
        backgroundColor: '#f5f5f5',
        gap: 4,
    },
    foilToggleActive: {
        backgroundColor: '#2196F3',
    },
    foilToggleText: {
        fontSize: 14,
        color: '#666',
    },
    foilToggleTextActive: {
        color: 'white',
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
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        minHeight: 300,
    },
    emptyText: {
        fontSize: 18,
        color: '#9e9e9e',
        marginTop: 16,
    },
    imageLoadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        fontSize: 18,
        color: '#ff4444',
        marginVertical: 16,
    },
    skeletonCard: {
        flex: 1,
        padding: 4,
        backgroundColor: 'white',
        borderRadius: 8,
    },
    skeletonImage: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
    },
    skeletonText: {
        height: 12,
        backgroundColor: '#e0e0e0',
        borderRadius: 4,
        marginBottom: 4,
    },
    advancedFilterButton: {
        padding: 10,
        backgroundColor: '#e3f2fd',
        borderRadius: 4,
        marginVertical: 8,
        alignItems: 'center',
    },
    advancedFilterText: {
        color: '#2196F3',
        fontWeight: '500',
    },
    advancedFilters: {
        marginTop: 8,
    },
    priceRangeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
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
});

export default MTGGridView; 