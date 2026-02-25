// LorcanaGridView component
import React, { useState, useCallback, useEffect, Suspense, useMemo, useRef } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Text, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import LorcanaCard from './LorcanaCard';
import LorcanaCardModal from './LorcanaCardModal';
import LorcanaVersionModal from './LorcanaVersionModal';
import LorcanaFilters from './LorcanaFilters';
import QuickQuantityModal from './QuickQuantityModal';
import { useLorcanaCollection } from '../../hooks/useLorcanaCollection';
import { useLorcanaPrices } from '../../hooks/useLorcanaPrices';
import { useLorcanaFilters } from '../../hooks/useLorcanaFilters';
import SortHeader from '../shared/SortHeader';
import { getImageLoadingStats, clearImageCache, getImageSource, handleImageLoadError, handleImageLoadSuccess, preloadImages } from '../../utils/imageUtils';
import { fetchCardVersionsByName } from '../../services/LorcanaService';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import type { Theme } from '../../context/ThemeContext';
import { useLorcanaPriceCache } from '../../hooks/useLorcanaPriceCache';
import { imageCacheService } from '../../services/ImageCacheService';
import { priceService } from '../../services/PriceService';

// Fix Icon type with proper type assertion
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;

interface LorcanaGridViewProps {
    cards: LorcanaCardWithPrice[];
    isLoading: boolean;
    onCardPress: (card: LorcanaCardWithPrice) => void;
    onDeleteCard: (card: LorcanaCardWithPrice) => void;
    onCardsUpdate?: (updatedCards: LorcanaCardWithPrice[]) => void;
    onExportCollection?: () => void;
    cardCount?: number;
    totalValue?: string;
    newToCollectionCards?: Set<string>;
    collectionId?: string;
}

const ITEMS_PER_PAGE = 12;

const LorcanaGridView: React.FC<LorcanaGridViewProps> = ({
    cards,
    isLoading,
    onCardPress,
    onDeleteCard,
    onCardsUpdate,
    onExportCollection,
    cardCount,
    totalValue,
    newToCollectionCards = new Set<string>(),
    collectionId
}) => {
    const { theme } = useTheme();
    const styles = useStyles();

    // State
    const [selectedCard, setSelectedCard] = useState<LorcanaCardWithPrice | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [showVersionModal, setShowVersionModal] = useState(false);
    const [availableVersions, setAvailableVersions] = useState<LorcanaCardWithPrice[]>([]);

    // Multiselect state
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

    // Quick quantity modal state
    const [showQuickQuantity, setShowQuickQuantity] = useState(false);
    const [quickQuantityCard, setQuickQuantityCard] = useState<LorcanaCardWithPrice | null>(null);

    // Track processed cards to prevent duplicate processing
    const processedCardsRef = useRef<Set<string>>(new Set());
    // Track the last visible cards to prevent unnecessary re-runs
    const lastVisibleCardsRef = useRef<LorcanaCardWithPrice[]>([]);

    // Custom hooks
    const { addToCollection, refreshCollectionStatus } = useLorcanaCollection({ onCardsUpdate });
    const { updatePrices, updatingPrices } = useLorcanaPrices({ cards, onCardsUpdate });
    const { getPrice, priceCache, setPriceCache, isLoading: priceLoading } = useLorcanaPriceCache();
    const {
        filters,
        sortBy,
        sortDirection,
        updateFilters,
        resetFilters,
        toggleSort,
        filteredAndSortedCards,
        setFilteredAndSortedCards
    } = useLorcanaFilters({ cards, priceCache });

    // Update selectedCard when cards array changes (to keep modal in sync)
    useEffect(() => {
        if (selectedCard) {
            const updatedCard = cards.find(c => c.Unique_ID === selectedCard.Unique_ID);
            if (updatedCard && JSON.stringify(updatedCard) !== JSON.stringify(selectedCard)) {
                console.log('[LorcanaGridView] Updating selectedCard with refreshed data');
                setSelectedCard(updatedCard);
            }
        }
    }, [cards]);

    // Update quickQuantityCard when cards array changes
    useEffect(() => {
        if (quickQuantityCard) {
            const updatedCard = cards.find(c => c.Unique_ID === quickQuantityCard.Unique_ID);
            if (updatedCard && JSON.stringify(updatedCard) !== JSON.stringify(quickQuantityCard)) {
                console.log('[LorcanaGridView] Updating quickQuantityCard with refreshed data');
                setQuickQuantityCard(updatedCard);
            }
        }
    }, [cards]);

    // Preload images for visible cards
    useEffect(() => {
        if (filteredAndSortedCards.length > 0) {
            const visibleCards = filteredAndSortedCards.slice(0, ITEMS_PER_PAGE);
            const imageUrls = visibleCards.map(card => card.Image).filter(Boolean) as string[];
            
            // Use both old preload method and new cache service
            preloadImages(imageUrls);
            
            // Progressive download with cache service
            imageCacheService.preloadSetImages(
                'current_view', 
                visibleCards.filter(card => card.Image).map(card => ({ Image: card.Image!, Name: card.Name }))
            );
        }
    }, [filteredAndSortedCards]);

    // Memoize visible cards to prevent unnecessary re-runs
    const visibleCards = useMemo(() =>
        filteredAndSortedCards.slice(0, ITEMS_PER_PAGE),
        [filteredAndSortedCards]
    );

    // Load prices for visible cards from database
    useEffect(() => {
        // Check if visible cards have actually changed
        const visibleCardIds = visibleCards.map(card => card.Unique_ID).join(',');
        const lastVisibleCardIds = lastVisibleCardsRef.current.map(card => card.Unique_ID).join(',');

        if (visibleCardIds === lastVisibleCardIds) {
            // Visible cards haven't changed, skip processing
            return;
        }

        // Update the ref with current visible cards
        lastVisibleCardsRef.current = [...visibleCards];

        const loadPricesFromService = async () => {
            try {
                const cachedPrices = await priceService.getRecentPricesForCards(visibleCards);
                if (Object.keys(cachedPrices).length > 0) {
                    setPriceCache(prev => ({ ...prev, ...cachedPrices }));
                }

                for (const card of visibleCards) {
                    const cardId = card.Unique_ID || card.Name;
                    if (!cardId) {
                        continue;
                    }

                    // Skip if we already processed this card or cache hit exists.
                    if (processedCardsRef.current.has(cardId) || priceCache[cardId] || cachedPrices[cardId]) {
                        continue;
                    }

                    processedCardsRef.current.add(cardId);
                    getPrice(card);
                }
            } catch (error) {
                console.log('[LorcanaGridView] Error loading visible card prices:', error);
            }
        };

        loadPricesFromService();
    }, [visibleCards, getPrice]);

    // Callbacks
    const handleCardPress = useCallback((card: LorcanaCardWithPrice) => {
        if (isSelectionMode) {
            // Toggle selection
            toggleCardSelection(card.Unique_ID);
        } else {
            // Show card details
            setSelectedCard(card);
        }
    }, [isSelectionMode]);

    const handleCardLongPress = useCallback(async (card: LorcanaCardWithPrice) => {
        if (isSelectionMode) {
            // Already in selection mode, just toggle
            toggleCardSelection(card.Unique_ID);
        } else if (card.collected && collectionId) {
            // For collected cards with collectionId, show action menu
            Alert.alert(
                card.Name,
                'Choose an action',
                [
                    {
                        text: 'Adjust Quantity',
                        onPress: () => {
                            setQuickQuantityCard(card);
                            setShowQuickQuantity(true);
                        }
                    },
                    {
                        text: 'Select Multiple Cards',
                        onPress: () => {
                            setIsSelectionMode(true);
                            setSelectedCardIds(new Set([card.Unique_ID]));
                        }
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel'
                    }
                ]
            );
        } else {
            // For non-collected cards or when no collectionId, enter selection mode
            setIsSelectionMode(true);
            setSelectedCardIds(new Set([card.Unique_ID]));
        }
    }, [isSelectionMode, collectionId]);

    const toggleCardSelection = useCallback((cardId: string) => {
        setSelectedCardIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(cardId)) {
                newSet.delete(cardId);
                // Exit selection mode if no cards selected
                if (newSet.size === 0) {
                    setIsSelectionMode(false);
                }
            } else {
                newSet.add(cardId);
            }
            return newSet;
        });
    }, []);

    const handleCancelSelection = useCallback(() => {
        setIsSelectionMode(false);
        setSelectedCardIds(new Set());
    }, []);

    const handleBulkAddToCollection = useCallback(async () => {
        const selectedCards = filteredAndSortedCards.filter(card =>
            selectedCardIds.has(card.Unique_ID)
        );

        for (const card of selectedCards) {
            await addToCollection(card);
        }

        handleCancelSelection();
        if (refreshCollectionStatus && cards) {
            refreshCollectionStatus(cards);
        }
    }, [selectedCardIds, filteredAndSortedCards, addToCollection, refreshCollectionStatus, cards]);

    const handleBulkDelete = useCallback(() => {
        const selectedCards = filteredAndSortedCards.filter(card =>
            selectedCardIds.has(card.Unique_ID)
        );

        selectedCards.forEach(card => {
            onDeleteCard(card);
        });

        handleCancelSelection();
    }, [selectedCardIds, filteredAndSortedCards, onDeleteCard]);

    const handleVersionChange = useCallback(async (newVersion: LorcanaCardWithPrice) => {
        try {
            // Close the modal first
            setShowVersionModal(false);
            
            // If the original card was collected, transfer that status to the new version
            const wasCollected = selectedCard?.collected || false;
            
            // Always ensure we're working with the newest data
            const latestCardData = {
                ...newVersion,
                collected: wasCollected
            };
            
            // Update the card version in the state
            if (onCardsUpdate) {
                const updatedCards = cards.map(card =>
                    card.Unique_ID === selectedCard?.Unique_ID ? latestCardData : card
                );
                onCardsUpdate(updatedCards);
                // console.log('[LorcanaGridView] Updated card version:', latestCardData.Name); // Removed for production
            }
        } catch (error) {
            console.error('[LorcanaGridView] Error changing card version:', error);
        }
    }, [selectedCard, cards, onCardsUpdate]);

    const handleAddToCollection = useCallback(async () => {
        if (selectedCard) {
            const success = await addToCollection(selectedCard);
            if (success) {
                setSelectedCard(null);
                setShowVersionModal(false);
                refreshCollectionStatus(cards);
            }
        }
    }, [selectedCard, addToCollection, refreshCollectionStatus, cards]);

    const handleDeleteCard = useCallback(() => {
        if (selectedCard) {
            onDeleteCard(selectedCard);
            setSelectedCard(null);
            setShowVersionModal(false);
        }
    }, [selectedCard, onDeleteCard]);

    const loadMoreCards = useCallback(async () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);
        // Implement pagination logic here if needed
        setIsLoadingMore(false);
    }, [isLoadingMore, hasMore]);

    const renderCard = useCallback(({ item }: { item: LorcanaCardWithPrice }) => (
        <LorcanaCard
            card={item}
            priceData={priceCache[item.Unique_ID || item.Name]}
            isPriceLoading={!!priceLoading[item.Unique_ID || item.Name]}
            onPress={() => handleCardPress(item)}
            onLongPress={() => handleCardLongPress(item)}
            isNew={newToCollectionCards.has(item.Unique_ID)}
            isSelected={selectedCardIds.has(item.Unique_ID)}
            showSelectionIndicator={isSelectionMode}
        />
    ), [handleCardPress, handleCardLongPress, priceCache, priceLoading, newToCollectionCards, selectedCardIds, isSelectionMode]);

    const keyExtractor = useCallback((item: LorcanaCardWithPrice) => item.Unique_ID || '', []);

    // Placeholder item height for getItemLayout - replace with actual calculated height
    const ITEM_HEIGHT = 200; // Example: Adjust this to the actual height of LorcanaCard + vertical margins

    const getItemLayout = useCallback(
        (data: any, index: number) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
        }),
        []
    );

    // When showing version modal, load prices for those versions from database
    useEffect(() => {
        const loadVersionPricesFromService = async () => {
            if (showVersionModal && availableVersions.length > 0) {
                try {
                    const cachedPrices = await priceService.getRecentPricesForCards(availableVersions);
                    if (Object.keys(cachedPrices).length > 0) {
                        setPriceCache(prev => ({ ...prev, ...cachedPrices }));
                    }

                    for (const card of availableVersions) {
                        const cardId = card.Unique_ID || card.Name;
                        if (!cardId) {
                            continue;
                        }

                        if (!priceCache[cardId] && !cachedPrices[cardId]) {
                            getPrice(card);
                        }
                    }
                } catch (error) {
                    console.log('[LorcanaGridView] Error loading version prices:', error);
                }
            }
        };

        loadVersionPricesFromService();
    }, [showVersionModal, availableVersions, getPrice]);

    if (isLoading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {isSelectionMode ? (
                <View style={[styles.selectionHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
                    <Text style={[styles.selectionCount, { color: theme.text }]}>
                        {selectedCardIds.size} selected
                    </Text>
                    <View style={styles.selectionActions}>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: theme.primary }]}
                            onPress={handleBulkAddToCollection}
                        >
                            <Icon name="plus" size={20} color="#fff" />
                            <Text style={styles.actionButtonText}>Add to Collection</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: theme.error }]}
                            onPress={handleBulkDelete}
                        >
                            <Icon name="delete" size={20} color="#fff" />
                            <Text style={styles.actionButtonText}>Delete</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: theme.border }]}
                            onPress={handleCancelSelection}
                        >
                            <Icon name="close" size={20} color={theme.text} />
                            <Text style={[styles.actionButtonText, { color: theme.text }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <View style={styles.headerControlsContainer}>
                    <SortHeader
                        sortBy={sortBy}
                        sortDirection={sortDirection}
                        onSortChange={toggleSort}
                        onFilterPress={() => setShowFilters(!showFilters)}
                        onExportPress={onExportCollection}
                        showExportButton={!!onExportCollection}
                        cardCount={cardCount}
                        totalValue={totalValue}
                        showStats={cardCount !== undefined && totalValue !== undefined}
                    />
                </View>
            )}

            {showFilters && (
                <LorcanaFilters
                    filters={filters}
                    onFiltersChange={updateFilters}
                    onReset={resetFilters}
                    visible={showFilters} 
                />
            )}

            <FlatList
                data={filteredAndSortedCards}
                renderItem={renderCard}
                keyExtractor={keyExtractor}
                numColumns={3}
                contentContainerStyle={styles.grid}
                onEndReached={loadMoreCards}
                onEndReachedThreshold={0.5}
                ListFooterComponent={isLoadingMore ? <ActivityIndicator size="large" color="#2196F3" /> : null}
                initialNumToRender={9}
                maxToRenderPerBatch={4}
                windowSize={7}
                removeClippedSubviews={false}
                updateCellsBatchingPeriod={20}
                key={`flatlist-${filteredAndSortedCards.length}`}
                extraData={filteredAndSortedCards}
            />

            {selectedCard && (
                <Suspense fallback={<ActivityIndicator size="small" color={theme.primary} />}>
                    <LorcanaCardModal
                        card={selectedCard}
                        priceData={priceCache[selectedCard.Unique_ID || selectedCard.Name]}
                        isPriceLoading={!!priceLoading[selectedCard.Unique_ID || selectedCard.Name]}
                        visible={selectedCard !== null && !showVersionModal}
                        onClose={() => setSelectedCard(null)}
                        onDelete={handleDeleteCard}
                        onAddToCollection={!selectedCard.collected ? handleAddToCollection : undefined}
                        onRemoveFromCollection={selectedCard.collected ? handleDeleteCard : undefined}
                        collectionId={collectionId}
                        onQuantityChange={async () => {
                            // Force immediate refresh of card data from database
                            if (refreshCollectionStatus && cards) {
                                await refreshCollectionStatus(cards);
                                console.log('[LorcanaGridView] Card quantities refreshed after modal update');
                            }
                        }}
                    />
                </Suspense>
            )}

            {selectedCard && showVersionModal && (
                <Suspense fallback={<ActivityIndicator size="small" color={theme.primary} />}>
                    <LorcanaVersionModal
                        card={selectedCard}
                        visible={showVersionModal}
                        availableVersions={availableVersions.map(card => ({
                            ...card,
                            prices: priceCache[card.Unique_ID || card.Name] || card.prices,
                        }))}
                        onClose={() => setShowVersionModal(false)}
                        onVersionChange={handleVersionChange}
                        onAddToCollection={!selectedCard?.collected ? handleAddToCollection : undefined}
                        onRemoveFromCollection={selectedCard?.collected ? handleDeleteCard : undefined}
                    />
                </Suspense>
            )}

            {/* Quick Quantity Modal */}
            <QuickQuantityModal
                card={quickQuantityCard}
                visible={showQuickQuantity}
                onClose={() => {
                    setShowQuickQuantity(false);
                    setQuickQuantityCard(null);
                }}
                collectionId={collectionId}
                onQuantityChange={async () => {
                    // Force immediate refresh of card data from database
                    if (refreshCollectionStatus && cards) {
                        await refreshCollectionStatus(cards);
                        console.log('[LorcanaGridView] Card quantities refreshed after update');
                    }
                }}
            />
        </View>
    );
};

const useStyles = () => useThemedStyles((theme: Theme) => ({
    container: {
        flex: 1,
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
    selectionHeader: {
        padding: 12,
        borderBottomWidth: 1,
        gap: 12,
    },
    selectionCount: {
        fontSize: 16,
        fontWeight: '600' as '600',
    },
    selectionActions: {
        flexDirection: 'row' as 'row',
        gap: 8,
        flexWrap: 'wrap' as 'wrap',
    },
    actionButton: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600' as '600',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center' as 'center',
        alignItems: 'center' as 'center',
    },
    grid: {
        padding: 4,
    },
    statsContainer: {
        padding: 8,
        borderBottomWidth: 1,
    },
    statsRow: {
        flexDirection: 'row' as 'row',
        justifyContent: 'space-between' as 'space-between',
        alignItems: 'center' as 'center',
    },
    statsText: {
        fontSize: 12,
    },
    cacheButton: {
        padding: 5,
        borderRadius: 15,
    },
    // Modal styles
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center' as 'center',
        alignItems: 'center' as 'center',
    },
    modalContent: {
        width: '90%',
        maxHeight: '90%',
        borderRadius: 8,
        padding: 16,
        position: 'relative',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
    },
    modalCloseButton: {
        position: 'absolute',
        top: 10,
        right: 10,
    },
    // Version selection styles
    versionOption: {
        padding: 10,
        borderWidth: 1,
        borderRadius: 5,
        margin: 5,
        alignItems: 'center',
    },
    versionText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    versionImage: {
        width: 100,
        height: 140,
        borderRadius: 5,
    },
    addButton: {
        padding: 10,
        borderRadius: 5,
        margin: 10,
        alignItems: 'center',
    },
    addButtonText: {
        fontWeight: 'bold',
    },
    removeButton: {
        padding: 10,
        borderRadius: 5,
        margin: 10,
        alignItems: 'center',
    },
    removeButtonText: {
        fontWeight: 'bold',
    },
}));

export default LorcanaGridView;
