import { useState, useCallback } from 'react';
import { getLorcanaCardPrice } from '../services/LorcanaService';

export function useLorcanaPriceCache() {
  const [priceCache, setPriceCache] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  const getPrice = useCallback(
    async (card: any, forceRefresh = false) => {
      const cardId = card.Unique_ID || card.Name;
      if (!cardId) return null;
      if (!forceRefresh && priceCache[cardId]) {
        return priceCache[cardId];
      }
      setIsLoading(prev => ({ ...prev, [cardId]: true }));
      try {
        const price = await getLorcanaCardPrice(card);
        setPriceCache(prev => ({ ...prev, [cardId]: price }));
        return price;
      } catch (e) {
        setPriceCache(prev => ({ ...prev, [cardId]: null }));
        return null;
      } finally {
        setIsLoading(prev => ({ ...prev, [cardId]: false }));
      }
    },
    [priceCache]
  );

  return { getPrice, priceCache, isLoading };
} 