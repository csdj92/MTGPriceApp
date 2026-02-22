import { useState, useEffect, useCallback } from 'react';
import {
  ScannedCard,
  LorcanaScannedCard,
  LorcanaCard,
} from '../types/card';
import { LorcanaCard as LorcanaDbCard } from '../types/lorcana';
import { mapDbToVm } from '../mappers/lorcanaMapper';

interface UseLorcanaScanHistoryReturn {
  scannedCards: ScannedCard[];
  lorcanaScannedCards: LorcanaScannedCard[];
  totalPrice: number;
  addScannedCard: (card: ScannedCard) => Promise<void>;
  addLorcanaCard: (card: LorcanaDbCard, isFoil?: boolean) => void;
  removeCard: (id: string, type?: 'MTG' | 'Lorcana') => void;
  clearScans: () => Promise<void>;
  reloadHistory: () => Promise<void>;
  toggleFoil: (id: string) => void;
  incrementCard: (id: string) => void;
  decrementCard: (id: string) => void;
}

/**
 * Custom hook to manage scan history for both MTG and Lorcana cards.
 * This centralises scan-related state and persistence logic, simplifying
 * components like PriceLookupScreen and promoting code reuse.
 */
export const useLorcanaScanHistory = (): UseLorcanaScanHistoryReturn => {
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [lorcanaScannedCards, setLorcanaScannedCards] =
    useState<LorcanaScannedCard[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);

  const computeTotalPrice = useCallback((cards: ScannedCard[]) => {
    if (!Array.isArray(cards)) return 0;
    return cards.reduce((sum, c) => {
      const price = c.prices?.usd ? Number(c.prices.usd) : 0;
      return sum + price;
    }, 0);
  }, []);

  const reloadHistory = useCallback(async () => {
    // Since we're Lorcana-only now, we don't have a scan history in the old database
    // This is handled by lorcanaScannedCards state instead
    setScannedCards([]);
    setTotalPrice(0);
  }, []);

  useEffect(() => {
    reloadHistory();
  }, [reloadHistory]);

  const addScannedCard = useCallback(async (card: ScannedCard) => {
    // Avoid duplicates by uuid
    setScannedCards((prev) => {
      const exists = prev.some((c) => c.uuid === card.uuid);
      if (exists) return prev;
      return [card, ...prev];
    });

    setTotalPrice((prev) => prev + (card.prices?.usd ? Number(card.prices.usd) : 0));
  }, []);

  const addLorcanaCard = useCallback(
    (card: LorcanaDbCard, isFoil: boolean = false) => {
      const vm: LorcanaCard = mapDbToVm(card);
      setLorcanaScannedCards((prev) => {
        const idx = prev.findIndex((c) => c.id === vm.uuid);
        if (idx !== -1) {
          const updated = [...prev];
          const existing = updated[idx];
          if (isFoil) existing.foilCount += 1;
          else existing.normalCount += 1;
          return updated;
        }
        const newCard: LorcanaScannedCard = {
          id: vm.uuid!,
          name: vm.name,
          type: 'Lorcana',
          imageUrl: vm.imageUrl || '',
          setCode: vm.setCode || '',
          card: vm,
          normalCount: isFoil ? 0 : 1,
          foilCount: isFoil ? 1 : 0,
          isFoil,
        };
        return [newCard, ...prev];
      });
    },
    [],
  );

  const toggleFoil = useCallback((id: string) => {
    setLorcanaScannedCards((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const updated = [...prev];
      const card = updated[idx];
      // Toggle logic: if currently foilCount>0 treat as foil copy, else normal.
      if (card.isFoil) {
        // Switch to non-foil
        card.isFoil = false;
        card.normalCount += 1;
        if (card.foilCount > 0) card.foilCount -= 1;
      } else {
        // Switch to foil
        card.isFoil = true;
        card.foilCount += 1;
        if (card.normalCount > 0) card.normalCount -= 1;
      }
      return updated;
    });
  }, []);

  const incrementCard = useCallback((id: string) => {
    setLorcanaScannedCards((prev) => prev.map(c => c.id === id ? { ...c, normalCount: c.normalCount + 1 } : c));
  }, []);

  const decrementCard = useCallback((id: string) => {
    setLorcanaScannedCards((prev) => prev.map(c => {
      if (c.id !== id) return c;
      const newNormal = Math.max(0, c.normalCount - 1);
      return { ...c, normalCount: newNormal };
    }));
  }, []);

  const removeCard = useCallback(
    (id: string, _type?: 'MTG' | 'Lorcana') => {
      // Remove from both lists (only one will have it)
      setLorcanaScannedCards((prev) => prev.filter((c) => c.id !== id));
      setScannedCards((prev) => prev.filter((c) => c.uuid !== id));
    },
    [],
  );

  const clearScans = useCallback(async () => {
    setScannedCards([]);
    setLorcanaScannedCards([]);
    setTotalPrice(0);
  }, []);

  return {
    scannedCards,
    lorcanaScannedCards,
    totalPrice,
    addScannedCard,
    addLorcanaCard,
    removeCard,
    clearScans,
    reloadHistory,
    toggleFoil,
    incrementCard,
    decrementCard,
  };
}; 
