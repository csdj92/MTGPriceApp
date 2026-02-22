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
}

export const useLorcanaFilters = ({ cards }: UseLorcanaFiltersProps) => {
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
            setSortDirection('asc');
        }
    }, [sortBy]);

    useEffect(() => {
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
            const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
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
                    // Parse prices and handle NaN/invalid values
                    let priceA = 0;
                    let priceB = 0;

                    if (a.prices?.usd) {
                        const parsedA = parseFloat(a.prices.usd);
                        priceA = isNaN(parsedA) ? 0 : parsedA;
                    } else if ((a as any).price_usd) {
                        const parsedA = parseFloat((a as any).price_usd);
                        priceA = isNaN(parsedA) ? 0 : parsedA;
                    }

                    if (b.prices?.usd) {
                        const parsedB = parseFloat(b.prices.usd);
                        priceB = isNaN(parsedB) ? 0 : parsedB;
                    } else if ((b as any).price_usd) {
                        const parsedB = parseFloat((b as any).price_usd);
                        priceB = isNaN(parsedB) ? 0 : parsedB;
                    }

                    return sortDirection === 'asc' ? priceA - priceB : priceB - priceA;
                case 'number':
                default:
                    const numA = a.Card_Num || 0;
                    const numB = b.Card_Num || 0;
                    return sortDirection === 'asc' ? numA - numB : numB - numA;
            }
        });

        setFilteredAndSortedCards(sorted);
    }, [cards, filters, sortBy, sortDirection]);

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