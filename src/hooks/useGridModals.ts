import { useState, useCallback, useEffect } from 'react';
import type { LorcanaCardWithPrice } from '../types/lorcana';
import { priceService } from '../services/PriceService';

interface UseGridModalsParams {
    cards: LorcanaCardWithPrice[];
    onCardsUpdate?: (updatedCards: LorcanaCardWithPrice[]) => void;
    onDeleteCard: (card: LorcanaCardWithPrice) => void;
    addToCollection: (card: LorcanaCardWithPrice) => Promise<any>;
    refreshCollectionStatus: (cards: LorcanaCardWithPrice[]) => void;
    priceCache: Record<string, any>;
    setPriceCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
    getPrice: (
        card: any,
        options?: { forceRefresh?: boolean; skipRecentCacheLookup?: boolean }
    ) => Promise<any>;
    priceLoading: Record<string, boolean>;
}

export function useGridModals({
    cards,
    onCardsUpdate,
    onDeleteCard,
    addToCollection,
    refreshCollectionStatus,
    priceCache,
    setPriceCache,
    getPrice,
}: UseGridModalsParams) {
    const [selectedCard, setSelectedCard] = useState<LorcanaCardWithPrice | null>(null);
    const [showVersionModal, setShowVersionModal] = useState(false);
    const [availableVersions, setAvailableVersions] = useState<LorcanaCardWithPrice[]>([]);
    const [showQuickQuantity, setShowQuickQuantity] = useState(false);
    const [quickQuantityCard, setQuickQuantityCard] = useState<LorcanaCardWithPrice | null>(null);

    // Sync selectedCard when cards array changes
    useEffect(() => {
        if (selectedCard) {
            const updatedCard = cards.find(c => c.Unique_ID === selectedCard.Unique_ID);
            if (updatedCard && JSON.stringify(updatedCard) !== JSON.stringify(selectedCard)) {
                console.log('[useGridModals] Updating selectedCard with refreshed data');
                setSelectedCard(updatedCard);
            }
        }
    }, [cards]);

    // Sync quickQuantityCard when cards array changes
    useEffect(() => {
        if (quickQuantityCard) {
            const updatedCard = cards.find(c => c.Unique_ID === quickQuantityCard.Unique_ID);
            if (updatedCard && JSON.stringify(updatedCard) !== JSON.stringify(quickQuantityCard)) {
                console.log('[useGridModals] Updating quickQuantityCard with refreshed data');
                setQuickQuantityCard(updatedCard);
            }
        }
    }, [cards]);

    // Load prices for version modal versions
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
                        if (!cardId) continue;
                        if (!priceCache[cardId] && !cachedPrices[cardId]) {
                            getPrice(card, { skipRecentCacheLookup: true });
                        }
                    }
                } catch (error) {
                    console.log('[useGridModals] Error loading version prices:', error);
                }
            }
        };

        loadVersionPricesFromService();
    }, [showVersionModal, availableVersions, getPrice]);

    const openCardDetail = useCallback((card: LorcanaCardWithPrice) => {
        setSelectedCard(card);
    }, []);

    const closeCardDetail = useCallback(() => {
        setSelectedCard(null);
    }, []);

    const closeVersionModal = useCallback(() => {
        setShowVersionModal(false);
    }, []);

    const openQuickQuantity = useCallback((card: LorcanaCardWithPrice) => {
        setQuickQuantityCard(card);
        setShowQuickQuantity(true);
    }, []);

    const closeQuickQuantity = useCallback(() => {
        setShowQuickQuantity(false);
        setQuickQuantityCard(null);
    }, []);

    const handleVersionChange = useCallback(async (newVersion: LorcanaCardWithPrice) => {
        try {
            setShowVersionModal(false);
            const wasCollected = selectedCard?.collected || false;
            const latestCardData = { ...newVersion, collected: wasCollected };

            if (onCardsUpdate) {
                const updatedCards = cards.map(card =>
                    card.Unique_ID === selectedCard?.Unique_ID ? latestCardData : card
                );
                onCardsUpdate(updatedCards);
            }
        } catch (error) {
            console.error('[useGridModals] Error changing card version:', error);
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

    const handleQuantityChange = useCallback(async () => {
        if (refreshCollectionStatus && cards) {
            await refreshCollectionStatus(cards);
            console.log('[useGridModals] Card quantities refreshed after update');
        }
    }, [refreshCollectionStatus, cards]);

    return {
        selectedCard,
        openCardDetail,
        closeCardDetail,
        showVersionModal,
        availableVersions,
        closeVersionModal,
        handleVersionChange,
        showQuickQuantity,
        quickQuantityCard,
        openQuickQuantity,
        closeQuickQuantity,
        handleAddToCollection,
        handleDeleteCard,
        handleQuantityChange,
    };
}
