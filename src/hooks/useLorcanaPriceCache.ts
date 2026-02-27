import { useState, useCallback, useEffect, useRef } from 'react';
import { priceService } from '../services/PriceService';

export function useLorcanaPriceCache() {
  const [priceCache, setPriceCache] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const priceCacheRef = useRef<Record<string, any>>({});

  useEffect(() => {
    priceCacheRef.current = priceCache;
  }, [priceCache]);

  const getPrice = useCallback(
    async (
      card: any,
      options: { forceRefresh?: boolean; skipRecentCacheLookup?: boolean } = {}
    ) => {
      const { forceRefresh = false, skipRecentCacheLookup = false } = options;
      const cardId = card.Unique_ID || card.Name;
      if (!cardId) return null;
      if (!forceRefresh && priceCacheRef.current[cardId]) {
        return priceCacheRef.current[cardId];
      }
      setIsLoading(prev => ({ ...prev, [cardId]: true }));
      try {
        const price = await priceService.getCardPrice(card, { forceRefresh, skipRecentCacheLookup });
        setPriceCache(prev => ({ ...prev, [cardId]: price }));
        return price;
      } catch (e) {
        setPriceCache(prev => ({ ...prev, [cardId]: null }));
        return null;
      } finally {
        setIsLoading(prev => ({ ...prev, [cardId]: false }));
      }
    },
    []
  );

  const clearCache = useCallback(() => {
    setPriceCache({});
    setIsLoading({});
  }, []);

  return { getPrice, priceCache, setPriceCache, isLoading, clearCache };
} 
