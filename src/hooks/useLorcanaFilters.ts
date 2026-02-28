import { useState, useCallback, useEffect, useMemo } from 'react';
import type { LorcanaCardWithPrice } from '../types/lorcana';
import { tokenizeColorString } from '../utils/formatters';

export type SortOption = 'name' | 'price' | 'number';
export type SortDirection = 'asc' | 'desc';

export interface Filters {
    search: string;
    rarities: string[];
    colors: string[];
    collectionStatus: 'all' | 'collected' | 'missing';
    priceRange: {
        min: number | null;
        max: number | null;
    };
}

const defaultFilters: Filters = {
    search: '',
    rarities: [],
    colors: [],
    collectionStatus: 'all',
    priceRange: { min: null, max: null }
};

interface UseLorcanaFiltersProps {
    cards: LorcanaCardWithPrice[];
    priceCache?: Record<string, any>;
}

interface SortState {
    sortBy: SortOption;
    sortDirection: SortDirection;
}

const SEARCH_DEBOUNCE_MS = 160;

const getCardId = (card: LorcanaCardWithPrice): string => card.Unique_ID || card.Name || '';

const parsePriceValue = (value: unknown): number => {
    if (value === undefined || value === null || value === '') {
        return 0;
    }

    const parsed = parseFloat(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
};

const getPriceValue = (card: LorcanaCardWithPrice, cachedPrice?: any): number => {
    const val = cachedPrice?.usd ?? card.prices?.usd ?? (card as any).price_usd
        ?? cachedPrice?.usd_foil ?? card.prices?.usd_foil ?? (card as any).price_usd_foil;
    return parsePriceValue(val);
};

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        if (typeof value === 'string' && value.length === 0) {
            setDebouncedValue(value);
            return;
        }

        const timeoutId = setTimeout(() => {
            setDebouncedValue(value);
        }, delayMs);

        return () => clearTimeout(timeoutId);
    }, [value, delayMs]);

    return debouncedValue;
};

export const useLorcanaFilters = ({ cards, priceCache = {} }: UseLorcanaFiltersProps) => {
    const [filters, setFilters] = useState<Filters>(defaultFilters);
    const [sortState, setSortState] = useState<SortState>({ sortBy: 'number', sortDirection: 'asc' });
    const { sortBy, sortDirection } = sortState;
    const debouncedSearch = useDebouncedValue(filters.search.trim().toLowerCase(), SEARCH_DEBOUNCE_MS);
    const raritySet = useMemo(() => new Set(filters.rarities), [filters.rarities]);
    const colorSet = useMemo(
        () => new Set(filters.colors.map(color => color.trim().toLowerCase()).filter(Boolean)),
        [filters.colors]
    );
    const minPrice = filters.priceRange.min;
    const maxPrice = filters.priceRange.max;
    const needsPriceData = sortBy === 'price' || minPrice !== null || maxPrice !== null;

    const resetFilters = useCallback(() => {
        setFilters(defaultFilters);
    }, []);

    const updateFilters = useCallback((newFilters: Partial<Filters>) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    }, []);

    const toggleSort = useCallback((option: SortOption) => {
        setSortState(prev => {
            if (prev.sortBy === option) {
                return { ...prev, sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc' };
            }
            // Default to descending for price, ascending for others
            return { sortBy: option, sortDirection: option === 'price' ? 'desc' : 'asc' };
        });
    }, []);

    const priceByCardId = useMemo(() => {
        if (!needsPriceData || cards.length === 0) {
            return null;
        }

        const next = new Map<string, number>();
        for (const card of cards) {
            const cardId = getCardId(card);
            if (!cardId) {
                continue;
            }
            next.set(cardId, getPriceValue(card, priceCache[cardId]));
        }
        return next;
    }, [cards, priceCache, needsPriceData]);

    const filteredAndSortedCards = useMemo(() => {
        const hasSearchFilter = debouncedSearch.length > 0;
        const hasRarityFilter = raritySet.size > 0;
        const hasColorFilter = colorSet.size > 0;
        const hasMinPrice = minPrice !== null;
        const hasMaxPrice = maxPrice !== null;
        const filtered: LorcanaCardWithPrice[] = [];

        for (const card of cards) {
            if (hasSearchFilter) {
                const name = card.Name?.toLowerCase() || '';
                const bodyText = card.Body_Text?.toLowerCase() || '';
                if (!name.includes(debouncedSearch) && !bodyText.includes(debouncedSearch)) {
                    continue;
                }
            }

            if (filters.collectionStatus === 'collected' && !card.collected) {
                continue;
            }
            if (filters.collectionStatus === 'missing' && card.collected) {
                continue;
            }

            if (hasRarityFilter && !raritySet.has(card.Rarity || '')) {
                continue;
            }

            if (hasColorFilter) {
                const cardColors = tokenizeColorString(card.Color);
                if (!cardColors.some(color => colorSet.has(color))) {
                    continue;
                }
            }

            if (hasMinPrice || hasMaxPrice) {
                const cardId = getCardId(card);
                const price = (cardId ? priceByCardId?.get(cardId) : undefined) ?? getPriceValue(card);

                if (hasMinPrice && price < (minPrice as number)) {
                    continue;
                }
                if (hasMaxPrice && price > (maxPrice as number)) {
                    continue;
                }
            }

            filtered.push(card);
        }

        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return sortDirection === 'asc'
                        ? (a.Name || '').localeCompare(b.Name || '')
                        : (b.Name || '').localeCompare(a.Name || '');
                case 'price': {
                    const cardIdA = getCardId(a);
                    const cardIdB = getCardId(b);
                    const priceA = (cardIdA ? priceByCardId?.get(cardIdA) : undefined) ?? getPriceValue(a);
                    const priceB = (cardIdB ? priceByCardId?.get(cardIdB) : undefined) ?? getPriceValue(b);
                    if (priceA !== priceB) {
                        return sortDirection === 'asc' ? priceA - priceB : priceB - priceA;
                    }
                    const numberA = a.Card_Num || 0;
                    const numberB = b.Card_Num || 0;
                    return numberA - numberB;
                }
                case 'number':
                default: {
                    const numberA = a.Card_Num || 0;
                    const numberB = b.Card_Num || 0;
                    return sortDirection === 'asc' ? numberA - numberB : numberB - numberA;
                }
            }
        });

        return filtered;
    }, [
        cards,
        debouncedSearch,
        filters.collectionStatus,
        raritySet,
        colorSet,
        minPrice,
        maxPrice,
        sortBy,
        sortDirection,
        priceByCardId,
    ]);

    return {
        filters,
        sortBy,
        sortDirection,
        updateFilters,
        resetFilters,
        toggleSort,
        filteredAndSortedCards,
    };
};

export default useLorcanaFilters; 
