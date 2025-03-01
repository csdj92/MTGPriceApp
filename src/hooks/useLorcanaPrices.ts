import { useState, useCallback, useEffect } from 'react';
import { getDB, getLorcanaCardPrice, debugCardData } from '../services/LorcanaService';
import type { LorcanaCardWithPrice } from '../types/lorcana';

interface UseLorcanaPricesProps {
    cards: LorcanaCardWithPrice[];
    onCardsUpdate?: (updatedCards: LorcanaCardWithPrice[]) => void;
}

export const useLorcanaPrices = ({ cards, onCardsUpdate }: UseLorcanaPricesProps) => {
    const [updatingPrices, setUpdatingPrices] = useState(false);
    const [failedPriceLookups] = useState<Set<string>>(new Set());

    const updatePrices = useCallback(async () => {
        if (updatingPrices) return;
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

            const db = await getDB();
            const updatePromises = cardsNeedingPrices.map(async (card) => {
                if (card.Name && card.Set_Num && card.Rarity) {
                    try {
                        // Debug the card data integrity
                        debugCardData(card, 'useLorcanaPrices');
                        
                        const prices = await getLorcanaCardPrice({
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

                        await db.executeSql(
                            `UPDATE lorcana_cards 
                             SET price_usd = ?, 
                                 price_usd_foil = ?, 
                                 last_updated = ? 
                             WHERE Unique_ID = ?`,
                            [
                                prices.usd,
                                prices.usd_foil,
                                new Date().toISOString(),
                                card.Unique_ID
                            ]
                        );
                        
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