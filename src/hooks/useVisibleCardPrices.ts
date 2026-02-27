import { useEffect, useMemo, useRef } from 'react';
import type { LorcanaCardWithPrice } from '../types/lorcana';
import { imageCacheService } from '../services/ImageCacheService';
import { priceService } from '../services/PriceService';

const ITEMS_PER_PAGE = 12;

interface UseVisibleCardPricesParams {
    filteredAndSortedCards: LorcanaCardWithPrice[];
    getPrice: (
        card: any,
        options?: { forceRefresh?: boolean; skipRecentCacheLookup?: boolean }
    ) => Promise<any>;
    priceCache: Record<string, any>;
    setPriceCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export function useVisibleCardPrices({
    filteredAndSortedCards,
    getPrice,
    priceCache,
    setPriceCache,
}: UseVisibleCardPricesParams) {
    const processedCardsRef = useRef<Set<string>>(new Set());
    const lastVisibleCardsRef = useRef<LorcanaCardWithPrice[]>([]);

    // Preload images for visible cards
    useEffect(() => {
        if (filteredAndSortedCards.length > 0) {
            const visible = filteredAndSortedCards.slice(0, ITEMS_PER_PAGE);
            imageCacheService.preloadSetImages(
                'current_view',
                visible.filter(card => card.Image).map(card => ({ Image: card.Image!, Name: card.Name }))
            );
        }
    }, [filteredAndSortedCards]);

    const visibleCards = useMemo(() =>
        filteredAndSortedCards.slice(0, ITEMS_PER_PAGE),
        [filteredAndSortedCards]
    );

    // Load prices for visible cards from database
    useEffect(() => {
        const visibleCardIds = visibleCards.map(card => card.Unique_ID).join(',');
        const lastVisibleCardIds = lastVisibleCardsRef.current.map(card => card.Unique_ID).join(',');

        if (visibleCardIds === lastVisibleCardIds) {
            return;
        }

        lastVisibleCardsRef.current = [...visibleCards];

        const loadPricesFromService = async () => {
            try {
                const cachedPrices = await priceService.getRecentPricesForCards(visibleCards);
                if (Object.keys(cachedPrices).length > 0) {
                    setPriceCache(prev => ({ ...prev, ...cachedPrices }));
                }

                for (const card of visibleCards) {
                    const cardId = card.Unique_ID || card.Name;
                    if (!cardId) continue;

                    if (processedCardsRef.current.has(cardId) || priceCache[cardId] || cachedPrices[cardId]) {
                        continue;
                    }

                    processedCardsRef.current.add(cardId);
                    getPrice(card, { skipRecentCacheLookup: true });
                }
            } catch (error) {
                console.log('[useVisibleCardPrices] Error loading visible card prices:', error);
            }
        };

        loadPricesFromService();
    }, [visibleCards, getPrice]);

    return { visibleCards };
}
