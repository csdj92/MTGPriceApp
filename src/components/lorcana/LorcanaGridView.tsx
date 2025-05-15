// LorcanaGridView component
import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import LorcanaCard from './LorcanaCard';
import LorcanaCardModal from './LorcanaCardModal';
import LorcanaVersionModal from './LorcanaVersionModal';
import LorcanaFilters from './LorcanaFilters';
import { useLorcanaCollection } from '../../hooks/useLorcanaCollection';
import { useLorcanaPrices } from '../../hooks/useLorcanaPrices';
import { useLorcanaFilters } from '../../hooks/useLorcanaFilters';
import SortHeader from '../shared/SortHeader';
import { getImageLoadingStats, clearImageCache, getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils'; 
import {  fetchCardVersionsByName } from '../../services/LorcanaService';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import type { Theme } from '../../context/ThemeContext';

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
    totalValue
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

    const handleCardLongPress = useCallback(async (card: LorcanaCardWithPrice) => {
        setSelectedCard(null); // Close the card details modal first
        
        try {
            // Fetch available versions from the service
            const versions = await fetchCardVersionsByName(card.Name);
            setAvailableVersions(versions);
            setSelectedCard(card);
            setShowVersionModal(true);
        } catch (error) {
            console.error('Error fetching card versions:', error);
        }
    }, []);

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
            onPress={() => handleCardPress(item)}
            onLongPress={() => handleCardLongPress(item)}
        />
    ), [handleCardPress, handleCardLongPress]);

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

    if (isLoading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
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

            {showFilters && (
                <LorcanaFilters
                    filters={filters}
                    onFiltersChange={updateFilters}
                    onReset={resetFilters}
                    visible={showFilters} 
                />
            )}

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
                removeClippedSubviews={false} // Setting to true can have bugs, ensure it works if enabled
                updateCellsBatchingPeriod={50}
                getItemLayout={filteredAndSortedCards().length > 0 ? getItemLayout : undefined} // Apply only if data exists
            />

            {selectedCard && (
                <Suspense fallback={<ActivityIndicator size="small" color={theme.primary} />}>
                    <LorcanaCardModal
                        card={selectedCard}
                        visible={selectedCard !== null && !showVersionModal}
                        onClose={() => setSelectedCard(null)}
                        onDelete={handleDeleteCard}
                        onAddToCollection={!selectedCard.collected ? handleAddToCollection : undefined}
                        onRemoveFromCollection={selectedCard.collected ? handleDeleteCard : undefined}
                    />
                </Suspense>
            )}

            {selectedCard && showVersionModal && (
                <Suspense fallback={<ActivityIndicator size="small" color={theme.primary} />}>
                    <LorcanaVersionModal
                        card={selectedCard}
                        visible={showVersionModal} // Keep visible prop
                        availableVersions={availableVersions}
                        onClose={() => setShowVersionModal(false)}
                        onVersionChange={handleVersionChange}
                        onAddToCollection={!selectedCard?.collected ? handleAddToCollection : undefined}
                        onRemoveFromCollection={selectedCard?.collected ? handleDeleteCard : undefined}
                    />
                </Suspense>
            )}
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
