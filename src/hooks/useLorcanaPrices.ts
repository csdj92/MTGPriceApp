import { useState, useCallback, useEffect, useRef } from 'react';
import { debugCardData } from '../services/LorcanaService';
import { priceService } from '../services/PriceService';
import type { LorcanaCardWithPrice } from '../types/lorcana';

interface UseLorcanaPricesProps {
    cards: LorcanaCardWithPrice[];
    onCardsUpdate?: (updatedCards: LorcanaCardWithPrice[]) => void;
}

export const useLorcanaPrices = ({ cards, onCardsUpdate }: UseLorcanaPricesProps) => {
    const [updatingPrices, setUpdatingPrices] = useState(false);
    const [failedPriceLookups] = useState<Set<string>>(new Set());
    const lastCardsSignatureRef = useRef<string>('');
    const lastUpdateTimeRef = useRef<number>(0);

    const updatePrices = useCallback(async () => {
        if (updatingPrices) return;
        
        const signature = cards.map(card => card.Unique_ID ?? card.Name ?? '').join('|');
        const now = Date.now();
        const signatureUnchanged = signature === lastCardsSignatureRef.current;
        const recentlyUpdated = now - lastUpdateTimeRef.current < 30_000; // 30 seconds debounce

        if (signatureUnchanged && recentlyUpdated) {
            return;
        }

        lastCardsSignatureRef.current = signature;
        lastUpdateTimeRef.current = now;

        setUpdatingPrices(true);

        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            
            const cardsNeedingPrices = cards.filter(card => 
                (!card.prices?.usd || !card.last_updated || card.last_updated < twentyFourHoursAgo) && 
                !failedPriceLookups.has(card.Unique_ID)
            );
            
            if (cardsNeedingPrices.length === 0) {
                setUpdatingPrices(false);
                return;
            }

            const updatePromises = cardsNeedingPrices.map(async (card) => {
                if (card.Name && card.Set_Num && card.Rarity) {
                    try {
                        // Debug the card data integrity
                        debugCardData(card, 'useLorcanaPrices');
                        
                        const prices = await priceService.getCardPrice({
                            Name: card.Name,
                            Set_Num: card.Set_Num,
                            Card_Num: card.Card_Num,
                            Rarity: card.Rarity,
                            Unique_ID: card.Unique_ID
                        });
                        
                        if (!prices) {
                            failedPriceLookups.add(card.Unique_ID);
                            return card;
                        }
                        
                        return {
                            ...card,
                            prices,
                            last_updated: new Date().toISOString()
                        };
                    } catch (error) {
                        failedPriceLookups.add(card.Unique_ID);
                        return card;
                    }
                }
                return card;
            });

            const updatedCards = await Promise.all(updatePromises);
            
            const newCards = cards.map(card => {
                const updatedCard = updatedCards.find(uc => uc.Unique_ID === card.Unique_ID);
                return updatedCard || card;
            });

            if (onCardsUpdate) {
                onCardsUpdate(newCards);
            }
        } catch (error) {
            console.error('[useLorcanaPrices] Error updating card prices:', error);
        } finally {
            setUpdatingPrices(false);
        }
    }, [cards, updatingPrices, onCardsUpdate, failedPriceLookups]);

    useEffect(() => {
        updatePrices();
    }, [updatePrices]);

    return {
        updatePrices,
        updatingPrices,
        failedPriceLookups
    };
};

export default useLorcanaPrices; 
