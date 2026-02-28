// LorcanaGridView component - orchestrator
import React, { useState, useCallback, Suspense } from 'react';
import { View, FlatList, ActivityIndicator, Alert } from 'react-native';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import LorcanaCard from './LorcanaCard';
import LorcanaCardModal from './LorcanaCardModal';
import LorcanaCardShowcase from './LorcanaCardShowcase';
import LorcanaVersionModal from './LorcanaVersionModal';
import LorcanaFilters from './LorcanaFilters';
import QuickQuantityModal from './QuickQuantityModal';
import SelectionHeader from './SelectionHeader';
import { useLorcanaCollection } from '../../hooks/useLorcanaCollection';
import { useLorcanaPrices } from '../../hooks/useLorcanaPrices';
import { useLorcanaFilters } from '../../hooks/useLorcanaFilters';
import { useLorcanaPriceCache } from '../../hooks/useLorcanaPriceCache';
import { useGridSelectionMode } from '../../hooks/useGridSelectionMode';
import { useGridModals } from '../../hooks/useGridModals';
import { useVisibleCardPrices } from '../../hooks/useVisibleCardPrices';
import SortHeader from '../shared/SortHeader';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import type { Theme } from '../../context/ThemeContext';

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

    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'showcase'>('grid');
    const [showcaseIndex, setShowcaseIndex] = useState(0);

    // Existing hooks
    const { addToCollection, refreshCollectionStatus } = useLorcanaCollection({ onCardsUpdate });
    const { updatePrices, updatingPrices } = useLorcanaPrices({ cards, onCardsUpdate });
    const { getPrice, priceCache, setPriceCache, isLoading: priceLoading } = useLorcanaPriceCache();
    const {
        filters, sortBy, sortDirection,
        updateFilters, resetFilters, toggleSort,
        filteredAndSortedCards,
    } = useLorcanaFilters({ cards, priceCache });

    // New extracted hooks
    const {
        isSelectionMode, selectedCardIds,
        toggleCardSelection, enterSelectionMode,
        handleCancelSelection, handleBulkAddToCollection, handleBulkDelete,
    } = useGridSelectionMode({
        filteredCards: filteredAndSortedCards,
        addToCollection, refreshCollectionStatus, onDeleteCard, cards,
    });

    const {
        selectedCard, openCardDetail, closeCardDetail,
        showVersionModal, availableVersions, closeVersionModal, handleVersionChange,
        showQuickQuantity, quickQuantityCard, openQuickQuantity, closeQuickQuantity,
        handleAddToCollection, handleDeleteCard, handleQuantityChange,
    } = useGridModals({
        cards, onCardsUpdate, onDeleteCard,
        addToCollection, refreshCollectionStatus,
        priceCache, setPriceCache, getPrice, priceLoading,
    });

    useVisibleCardPrices({ filteredAndSortedCards, getPrice, priceCache, setPriceCache });

    // Callbacks
    const handleCardPress = useCallback((card: LorcanaCardWithPrice) => {
        const action = isSelectionMode ? 'toggle-selection' : 'open-detail';
        console.log('[LorcanaGridView] Card pressed:', {
            action,
            name: card.Name,
            uniqueId: card.Unique_ID,
            cardNum: card.Card_Num,
            color: card.Color,
            rarity: card.Rarity,
        });

        if (isSelectionMode) {
            toggleCardSelection(card.Unique_ID);
        } else {
            // Track position for showcase mode
            const idx = filteredAndSortedCards.findIndex(c => c.Unique_ID === card.Unique_ID);
            if (idx !== -1) setShowcaseIndex(idx);
            openCardDetail(card);
        }
    }, [isSelectionMode, toggleCardSelection, openCardDetail, filteredAndSortedCards]);

    const handleCardLongPress = useCallback(async (card: LorcanaCardWithPrice) => {
        if (isSelectionMode) {
            toggleCardSelection(card.Unique_ID);
        } else if (card.collected && collectionId) {
            Alert.alert(
                card.Name,
                'Choose an action',
                [
                    {
                        text: 'Adjust Quantity',
                        onPress: () => openQuickQuantity(card),
                    },
                    {
                        text: 'Select Multiple Cards',
                        onPress: () => enterSelectionMode(card.Unique_ID),
                    },
                    { text: 'Cancel', style: 'cancel' },
                ]
            );
        } else {
            enterSelectionMode(card.Unique_ID);
        }
    }, [isSelectionMode, collectionId, toggleCardSelection, openQuickQuantity, enterSelectionMode]);

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
                <SelectionHeader
                    selectedCount={selectedCardIds.size}
                    onBulkAdd={handleBulkAddToCollection}
                    onBulkDelete={handleBulkDelete}
                    onCancel={handleCancelSelection}
                />
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
                        viewMode={viewMode}
                        onViewModeChange={(mode) => {
                            setViewMode(mode);
                            if (mode === 'showcase') setShowFilters(false);
                        }}
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

            {viewMode === 'showcase' ? (
                <LorcanaCardShowcase
                    cards={filteredAndSortedCards}
                    initialIndex={showcaseIndex}
                    priceCache={priceCache}
                    priceLoading={priceLoading}
                    onCardPress={(card) => {
                        openCardDetail(card);
                    }}
                    onClose={() => setViewMode('grid')}
                    newToCollectionCards={newToCollectionCards}
                />
            ) : (
                <FlatList
                    data={filteredAndSortedCards}
                    renderItem={renderCard}
                    keyExtractor={keyExtractor}
                    numColumns={3}
                    contentContainerStyle={styles.grid}
                    onEndReachedThreshold={0.5}
                    initialNumToRender={9}
                    maxToRenderPerBatch={4}
                    windowSize={7}
                    removeClippedSubviews={false}
                    updateCellsBatchingPeriod={20}
                    extraData={filteredAndSortedCards}
                />
            )}

            {selectedCard && (
                <Suspense fallback={<ActivityIndicator size="small" color={theme.primary} />}>
                    <LorcanaCardModal
                        card={selectedCard}
                        priceData={priceCache[selectedCard.Unique_ID || selectedCard.Name]}
                        isPriceLoading={!!priceLoading[selectedCard.Unique_ID || selectedCard.Name]}
                        visible={selectedCard !== null && !showVersionModal}
                        onClose={closeCardDetail}
                        onDelete={handleDeleteCard}
                        onAddToCollection={!selectedCard.collected ? handleAddToCollection : undefined}
                        onRemoveFromCollection={selectedCard.collected ? handleDeleteCard : undefined}
                        collectionId={collectionId}
                        onQuantityChange={handleQuantityChange}
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
                        onClose={closeVersionModal}
                        onVersionChange={handleVersionChange}
                        onAddToCollection={!selectedCard?.collected ? handleAddToCollection : undefined}
                        onRemoveFromCollection={selectedCard?.collected ? handleDeleteCard : undefined}
                    />
                </Suspense>
            )}

            <QuickQuantityModal
                card={quickQuantityCard}
                visible={showQuickQuantity}
                onClose={closeQuickQuantity}
                collectionId={collectionId}
                onQuantityChange={handleQuantityChange}
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center' as 'center',
        alignItems: 'center' as 'center',
    },
    grid: {
        padding: 4,
    },
}));

export default LorcanaGridView;
