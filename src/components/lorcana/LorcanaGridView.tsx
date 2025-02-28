// LorcanaGridView component
import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import LorcanaCard from './LorcanaCard';
import LorcanaCardModal from './LorcanaCardModal';
import LorcanaFilters from './LorcanaFilters';
import { useLorcanaCollection } from '../../hooks/useLorcanaCollection';
import { useLorcanaPrices } from '../../hooks/useLorcanaPrices';
import { useLorcanaFilters } from '../../hooks/useLorcanaFilters';
import SortHeader from '../shared/SortHeader';
import { getImageLoadingStats, clearImageCache } from '../../utils/imageUtils';

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
}

const ITEMS_PER_PAGE = 12;

const LorcanaGridView: React.FC<LorcanaGridViewProps> = ({
    cards,
    isLoading,
    onCardPress,
    onDeleteCard,
    onCardsUpdate
}) => {
    // State
    const [selectedCard, setSelectedCard] = useState<LorcanaCardWithPrice | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [cacheStats, setCacheStats] = useState({
        totalSuccessfulImages: 0,
        recentlySuccessfulImages: 0,
        preloadedImageSets: 0
    });
    const [refreshingCache, setRefreshingCache] = useState(false);

    // Update cache stats periodically
    useEffect(() => {
        // Initial stats update
        updateCacheStats();
        
        // Set up interval to update stats every 2 seconds
        const interval = setInterval(updateCacheStats, 2000);
        
        return () => clearInterval(interval);
    }, []);

    const updateCacheStats = useCallback(() => {
        setCacheStats(getImageLoadingStats());
    }, []);

    const handleClearCache = useCallback(async () => {
        setRefreshingCache(true);
        try {
            await clearImageCache();
            updateCacheStats();
        } catch (error) {
            console.error('Error clearing cache:', error);
        } finally {
            setRefreshingCache(false);
        }
    }, [updateCacheStats]);

    // Custom hooks
    const { addToCollection, refreshCollectionStatus } = useLorcanaCollection({ onCardsUpdate });
    const { updatePrices, updatingPrices } = useLorcanaPrices({ cards, onCardsUpdate });
    const { 
        filters,
        sortBy,
        sortDirection,
        updateFilters,
        resetFilters,
        toggleSort,
        filteredAndSortedCards
    } = useLorcanaFilters({ cards });

    // Callbacks
    const handleCardPress = useCallback((card: LorcanaCardWithPrice) => {
        setSelectedCard(card);
    }, []);

    const handleCardLongPress = useCallback((card: LorcanaCardWithPrice) => {
        setSelectedCard(card);
    }, []);

    const handleAddToCollection = useCallback(async () => {
        if (selectedCard) {
            const success = await addToCollection(selectedCard);
            if (success) {
                setSelectedCard(null);
                refreshCollectionStatus(cards);
            }
        }
    }, [selectedCard, addToCollection, refreshCollectionStatus, cards]);

    const handleDeleteCard = useCallback(() => {
        if (selectedCard) {
            onDeleteCard(selectedCard);
            setSelectedCard(null);
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
            onPress={() => handleCardPress(item)}
            onLongPress={() => handleCardLongPress(item)}
        />
    ), [handleCardPress, handleCardLongPress]);

    const keyExtractor = useCallback((item: LorcanaCardWithPrice) => item.Unique_ID || '', []);

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.statsContainer}>
                <View style={styles.statsRow}>
                    <Text style={styles.statsText}>
                        <Icon name="image-multiple" size={14} color="#2196F3" /> {cacheStats.totalSuccessfulImages} images cached
                        {cacheStats.recentlySuccessfulImages > 0 && ` (${cacheStats.recentlySuccessfulImages} recent)`}
                    </Text>
                    <TouchableOpacity 
                        style={styles.cacheButton}
                        onPress={handleClearCache}
                        disabled={refreshingCache}
                    >
                        <Icon 
                            name={refreshingCache ? "refresh" : "cached"} 
                            size={18} 
                            color="#2196F3" 
                        />
                    </TouchableOpacity>
                </View>
            </View>

            <SortHeader
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSortChange={toggleSort}
                onFilterPress={() => setShowFilters(!showFilters)}
            />

            <LorcanaFilters
                filters={filters}
                onFiltersChange={updateFilters}
                onReset={resetFilters}
                visible={showFilters}
            />

            <FlatList
                data={filteredAndSortedCards()}
                renderItem={renderCard}
                keyExtractor={keyExtractor}
                numColumns={3}
                contentContainerStyle={styles.grid}
                onEndReached={loadMoreCards}
                onEndReachedThreshold={0.5}
                ListFooterComponent={isLoadingMore ? <ActivityIndicator size="large" color="#2196F3" /> : null}
                initialNumToRender={12}
                maxToRenderPerBatch={6}
                windowSize={15}
                removeClippedSubviews={false}
                updateCellsBatchingPeriod={50}
            />

            <LorcanaCardModal
                card={selectedCard}
                visible={selectedCard !== null}
                onClose={() => setSelectedCard(null)}
                onDelete={handleDeleteCard}
                onAddToCollection={!selectedCard?.collected ? handleAddToCollection : undefined}
                onRemoveFromCollection={selectedCard?.collected ? handleDeleteCard : undefined}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    grid: {
        padding: 4,
    },
    statsContainer: {
        padding: 8,
        backgroundColor: '#f8f8f8',
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statsText: {
        fontSize: 12,
        color: '#333',
    },
    cacheButton: {
        padding: 5,
        borderRadius: 15,
        backgroundColor: '#f0f0f0',
    },
});

export default LorcanaGridView;
