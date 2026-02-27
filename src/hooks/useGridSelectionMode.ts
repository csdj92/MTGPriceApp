import { useState, useCallback } from 'react';
import type { LorcanaCardWithPrice } from '../types/lorcana';

interface UseGridSelectionModeParams {
    filteredCards: LorcanaCardWithPrice[];
    addToCollection: (card: LorcanaCardWithPrice) => Promise<any>;
    refreshCollectionStatus: (cards: LorcanaCardWithPrice[]) => void;
    onDeleteCard: (card: LorcanaCardWithPrice) => void;
    cards: LorcanaCardWithPrice[];
}

export function useGridSelectionMode({
    filteredCards,
    addToCollection,
    refreshCollectionStatus,
    onDeleteCard,
    cards,
}: UseGridSelectionModeParams) {
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

    const toggleCardSelection = useCallback((cardId: string) => {
        setSelectedCardIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(cardId)) {
                newSet.delete(cardId);
                if (newSet.size === 0) {
                    setIsSelectionMode(false);
                }
            } else {
                newSet.add(cardId);
            }
            return newSet;
        });
    }, []);

    const enterSelectionMode = useCallback((cardId: string) => {
        setIsSelectionMode(true);
        setSelectedCardIds(new Set([cardId]));
    }, []);

    const handleCancelSelection = useCallback(() => {
        setIsSelectionMode(false);
        setSelectedCardIds(new Set());
    }, []);

    const handleBulkAddToCollection = useCallback(async () => {
        const selectedCards = filteredCards.filter(card =>
            selectedCardIds.has(card.Unique_ID)
        );

        for (const card of selectedCards) {
            await addToCollection(card);
        }

        handleCancelSelection();
        if (refreshCollectionStatus && cards) {
            refreshCollectionStatus(cards);
        }
    }, [selectedCardIds, filteredCards, addToCollection, refreshCollectionStatus, cards, handleCancelSelection]);

    const handleBulkDelete = useCallback(() => {
        const selectedCards = filteredCards.filter(card =>
            selectedCardIds.has(card.Unique_ID)
        );

        selectedCards.forEach(card => {
            onDeleteCard(card);
        });

        handleCancelSelection();
    }, [selectedCardIds, filteredCards, onDeleteCard, handleCancelSelection]);

    return {
        isSelectionMode,
        selectedCardIds,
        toggleCardSelection,
        enterSelectionMode,
        handleCancelSelection,
        handleBulkAddToCollection,
        handleBulkDelete,
    };
}
