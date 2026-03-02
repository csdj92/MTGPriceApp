// LorcanaGridView component - orchestrator
import React, { useState, useCallback, Suspense, useLayoutEffect, useRef } from 'react';
import { View, FlatList, ActivityIndicator, Alert, TouchableOpacity, StyleSheet as RNStyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import LorcanaCard from './LorcanaCard';
import LorcanaCardModal from './LorcanaCardModal';
import LorcanaCardShowcase from './LorcanaCardShowcase';
import LorcanaVersionModal from './LorcanaVersionModal';
import LorcanaFilters from './LorcanaFilters';
import QuickQuantityModal from './QuickQuantityModal';
import SelectionHeader from './SelectionHeader';
import BuyListFAB from './BuyListFAB';
import { addToBuyList } from '../../services/BuyListService';
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

const Icon = MaterialCommunityIcons as any;

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
    const navigation = useNavigation();

    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'showcase'>('grid');
    const [showcaseIndex, setShowcaseIndex] = useState(0);

    // Keep refs so the header button callbacks always see current state
    const showFiltersRef = useRef(showFilters);
    showFiltersRef.current = showFilters;
    const viewModeRef = useRef(viewMode);
    viewModeRef.current = viewMode;

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

    // ── Push action buttons into the React Navigation header ──
    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <View style={navStyles.headerBtns}>
                    {/* Filter */}
                    <TouchableOpacity
                        style={navStyles.btn}
                        onPress={() => setShowFilters(f => !f)}
                        activeOpacity={0.7}
                    >
                        <Icon
                            name={showFiltersRef.current ? 'filter' : 'filter-variant'}
                            size={22}
                            color={showFiltersRef.current ? theme.primary : theme.text}
                        />
                    </TouchableOpacity>

                    {/* Showcase toggle */}
                    <TouchableOpacity
                        style={[
                            navStyles.btn,
                            viewModeRef.current === 'showcase' && { backgroundColor: theme.primary + '22' },
                        ]}
                        onPress={() => {
                            const next = viewModeRef.current === 'grid' ? 'showcase' : 'grid';
                            setViewMode(next);
                            if (next === 'showcase') setShowFilters(false);
                        }}
                        activeOpacity={0.7}
                    >
                        <Icon
                            name={viewModeRef.current === 'showcase' ? 'view-grid' : 'card-text-outline'}
                            size={22}
                            color={viewModeRef.current === 'showcase' ? theme.primary : theme.text}
                        />
                    </TouchableOpacity>

                    {/* Export */}
                    {onExportCollection && (
                        <TouchableOpacity
                            style={navStyles.btn}
                            onPress={onExportCollection}
                            activeOpacity={0.7}
                        >
                            <Icon name="export-variant" size={22} color={theme.text} />
                        </TouchableOpacity>
                    )}
                </View>
            ),
        });
    }, [navigation, showFilters, viewMode, onExportCollection, theme]);

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

    const handleBulkBuyList = useCallback(() => {
        const selectedCards = filteredAndSortedCards.filter(c => selectedCardIds.has(c.Unique_ID));
        selectedCards.forEach(card => {
            const cached = priceCache[card.Unique_ID || card.Name];
            const price = cached?.usd ? parseFloat(cached.usd) : undefined;
            addToBuyList({
                id: card.Unique_ID,
                name: card.Name,
                setName: card.Set_Name,
                color: card.Color,
                price,
                imageUrl: card.Image,
                tcgplayerId: cached?.tcgplayer_id,
            });
        });
        handleCancelSelection();
    }, [filteredAndSortedCards, selectedCardIds, priceCache, handleCancelSelection]);

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
                    onBulkBuyList={handleBulkBuyList}
                />
            ) : (
                <View style={styles.headerControlsContainer}>
                    <SortHeader
                        sortBy={sortBy}
                        sortDirection={sortDirection}
                        onSortChange={toggleSort}
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

            <BuyListFAB />
        </View>
    );
};

// Static styles for the nav header buttons (not theme-dependent for StyleSheet.create)
const navStyles = RNStyleSheet.create({
    headerBtns: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginRight: 4,
    },
    btn: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const useStyles = () => useThemedStyles((theme: Theme) => ({
    container: {
        flex: 1,
    },
    headerControlsContainer: {
        width: '100%' as any,
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
