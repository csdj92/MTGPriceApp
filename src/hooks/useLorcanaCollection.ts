import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { getDB, addCardToLorcanaCollection } from '../services/LorcanaService';
import type { LorcanaCardWithPrice } from '../types/lorcana';

interface UseLorcanaCollectionProps {
    onCardsUpdate?: (updatedCards: LorcanaCardWithPrice[]) => void;
}

export const useLorcanaCollection = ({ onCardsUpdate }: UseLorcanaCollectionProps) => {
    const [failedPriceLookups] = useState<Set<string>>(new Set());

    const addToCollection = useCallback(async (card: LorcanaCardWithPrice) => {
        try {
            if (!card.Set_ID) {
                console.error('[useLorcanaCollection] Card has no Set_ID, cannot find collection', card);
                throw new Error('Card has no Set_ID');
            }
            
            // Get database connection
            const database = await getDB();
            
            // Find the collection for this set by name (more reliable than Set_ID matching)
            const setName = card.Set_Name || `Set ${card.Set_ID}`;
            const collectionName = `Set: ${setName}`;

            const [collections] = await database.executeSql(
                `SELECT id FROM lorcana_collections
                 WHERE name = ?`,
                [collectionName]
            );

            let collectionId = null;

            if (collections.rows.length > 0) {
                collectionId = collections.rows.item(0).id;
                console.log(`[useLorcanaCollection] Found collection ${collectionId} for set ${setName}`);
            } else {
                console.log(`[useLorcanaCollection] No collection found for set ${setName}, creating one`);

                collectionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
                const now = new Date().toISOString();
                const description = `Collection for ${setName} (${card.Set_ID})`;

                await database.executeSql(
                    `INSERT INTO lorcana_collections (id, name, description, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [collectionId, collectionName, description, now, now]
                );
            }
            
            if (!collectionId) {
                throw new Error('Failed to find or create collection');
            }

            // Add card to collection with default quantity of 1 (normal, non-foil)
            // This function handles the transaction and sets quantities properly
            await addCardToLorcanaCollection(card.Unique_ID, collectionId, false, 1);
            
            // Verify the card was added with quantities
            const [verification] = await database.executeSql(
                `SELECT
                    lcc.quantity_normal,
                    lcc.quantity_foil,
                    lc.collected
                 FROM lorcana_cards lc
                 LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                 WHERE lc.Unique_ID = ?`,
                [card.Unique_ID]
            );

            if (verification.rows.length > 0) {
                const verifiedCard = verification.rows.item(0);
                console.log('[useLorcanaCollection] Card added with quantities:', {
                    normal: verifiedCard.quantity_normal,
                    foil: verifiedCard.quantity_foil,
                    collected: verifiedCard.collected
                });
            }
            
            // Success feedback
            console.log('[useLorcanaCollection] Card added to collection:', card.Name);
            Alert.alert('Success', `Added ${card.Name} to your collection`);
            
            return true;
        } catch (error) {
            console.error('[useLorcanaCollection] Error updating card collection status:', error);
            Alert.alert('Error', 'Failed to add card to collection. Please try again.');
            return false;
        }
    }, []);

    const refreshCollectionStatus = useCallback(async (cards: LorcanaCardWithPrice[]) => {
        if (cards.length === 0) return;
        
        try {
            const db = await getDB();
            const cardIds = cards.map(card => card.Unique_ID).filter(Boolean);
            
            if (cardIds.length === 0) return;
            
            const [results] = await db.executeSql(
                `SELECT lc.Unique_ID,
                        lc.collected,
                        CASE WHEN lcc.card_id IS NOT NULL THEN 1 ELSE 0 END as in_collection,
                        COALESCE(lcc.quantity_normal, 0) as quantity_normal,
                        COALESCE(lcc.quantity_foil, 0) as quantity_foil
                 FROM lorcana_cards lc
                 LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                 WHERE lc.Unique_ID IN (${cardIds.map(() => '?').join(',')})`,
                cardIds
            );

            const collectionDataMap = new Map();
            for (let i = 0; i < results.rows.length; i++) {
                const row = results.rows.item(i);
                const isCollected = Boolean(row.collected) || Boolean(row.in_collection);
                collectionDataMap.set(row.Unique_ID, {
                    collected: isCollected,
                    quantity_normal: row.quantity_normal || 0,
                    quantity_foil: row.quantity_foil || 0
                });
            }

            let hasInconsistencies = false;
            const updatedCards = cards.map(card => {
                if (!card.Unique_ID) return card;

                const dbData = collectionDataMap.get(card.Unique_ID);
                if (dbData !== undefined) {
                    const needsUpdate =
                        dbData.collected !== !!card.collected ||
                        dbData.quantity_normal !== (card.quantity_normal || 0) ||
                        dbData.quantity_foil !== (card.quantity_foil || 0);

                    if (needsUpdate) {
                        hasInconsistencies = true;
                        return {
                            ...card,
                            collected: dbData.collected,
                            quantity_normal: dbData.quantity_normal,
                            quantity_foil: dbData.quantity_foil
                        };
                    }
                }
                return card;
            });
            
            if (hasInconsistencies && onCardsUpdate) {
                onCardsUpdate(updatedCards);
            }
        } catch (error) {
            console.error('[useLorcanaCollection] Error refreshing collection status:', error);
        }
    }, [onCardsUpdate]);

    return {
        addToCollection,
        refreshCollectionStatus,
        failedPriceLookups
    };
};

export default useLorcanaCollection; 