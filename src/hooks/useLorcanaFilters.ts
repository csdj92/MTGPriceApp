import { useState, useCallback, useEffect } from 'react';
import type { LorcanaCardWithPrice } from '../types/lorcana';

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

export const useLorcanaFilters = ({ cards, priceCache = {} }: UseLorcanaFiltersProps) => {
    const [filters, setFilters] = useState<Filters>(defaultFilters);
    const [sortBy, setSortBy] = useState<SortOption>('number');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [filteredAndSortedCards, setFilteredAndSortedCards] = useState<LorcanaCardWithPrice[]>([]);

    const resetFilters = useCallback(() => {
        setFilters(defaultFilters);
    }, []);

    const updateFilters = useCallback((newFilters: Partial<Filters>) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    }, []);

    const toggleSort = useCallback((option: SortOption) => {
        if (sortBy === option) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(option);
            // Default to descending for price, ascending for others
            setSortDirection(option === 'price' ? 'desc' : 'asc');
        }
    }, [sortBy]);

    useEffect(() => {
        const getPriceValue = (card: LorcanaCardWithPrice) => {
            const cardId = card.Unique_ID || card.Name || '';
            const cachedPrice = priceCache[cardId];
            const val = cachedPrice?.usd ?? card.prices?.usd ?? (card as any).price_usd;
            if (val === undefined || val === null || val === '') return 0;
            const parsed = parseFloat(val);
            return isNaN(parsed) ? 0 : parsed;
        };

        const filtered = cards.filter(card => {
            // Text search
            if (filters.search && !card.Name?.toLowerCase().includes(filters.search.toLowerCase()) &&
                !card.Body_Text?.toLowerCase().includes(filters.search.toLowerCase())) {
                return false;
            }

            // Collection status filter
            if (filters.collectionStatus === 'collected' && !card.collected) {
                return false;
            }
            if (filters.collectionStatus === 'missing' && card.collected) {
                return false;
            }

            // Rarity filter
            if (filters.rarities.length > 0 && !filters.rarities.includes(card.Rarity || '')) {
                return false;
            }

            // Color filter
            if (filters.colors.length > 0 && !filters.colors.includes(card.Color || '')) {
                return false;
            }

            // Price range filter
            const price = getPriceValue(card);

            if (filters.priceRange.min !== null && price < filters.priceRange.min) {
                return false;
            }
            if (filters.priceRange.max !== null && price > filters.priceRange.max) {
                return false;
            }

            return true;
        });

        const sorted = [...filtered].sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return sortDirection === 'asc' 
                        ? (a.Name || '').localeCompare(b.Name || '')
                        : (b.Name || '').localeCompare(a.Name || '');
                case 'price':
                    const priceA = getPriceValue(a);
                    const priceB = getPriceValue(b);
                    if (priceA !== priceB) {
                        return sortDirection === 'asc' ? priceA - priceB : priceB - priceA;
                    }
                    // Fallback to card number if prices are equal
                    const nA = a.Card_Num || 0;
                    const nB = b.Card_Num || 0;
                    return nA - nB;
                case 'number':
                default:
                    const numA = a.Card_Num || 0;
                    const numB = b.Card_Num || 0;
                    return sortDirection === 'asc' ? numA - numB : numB - numA;
            }
        });

        setFilteredAndSortedCards(sorted);
    }, [cards, filters, sortBy, sortDirection, priceCache]);

    return {
        filters,
        sortBy,
        sortDirection,
        updateFilters,
        resetFilters,
        toggleSort,
        filteredAndSortedCards,
        setFilteredAndSortedCards
    };
};

export default useLorcanaFilters; 