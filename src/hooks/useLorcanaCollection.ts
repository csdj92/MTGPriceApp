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
            
            // Find the collection for this set
            const [collections] = await database.executeSql(
                `SELECT id FROM lorcana_collections 
                 WHERE description LIKE '%(' || ? || ')%'`,
                [card.Set_ID]
            );
            
            let collectionId = null;
            
            if (collections.rows.length > 0) {
                collectionId = collections.rows.item(0).id;
                console.log(`[useLorcanaCollection] Found collection ${collectionId} for set ${card.Set_ID}`);
            } else {
                const setName = card.Set_Name || `Set ${card.Set_ID}`;
                console.log(`[useLorcanaCollection] No collection found for set ${card.Set_ID}, creating one`);
                
                collectionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
                const now = new Date().toISOString();
                const collectionName = `Set: ${setName}`;
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
            
            // Use a transaction to ensure all database updates happen atomically
            await database.transaction(async (tx) => {
                await addCardToLorcanaCollection(card.Unique_ID, collectionId);
                
                await tx.executeSql(
                    'UPDATE lorcana_cards SET collected = 1 WHERE Unique_ID = ?',
                    [card.Unique_ID]
                );
                
                const now = new Date().toISOString();
                await tx.executeSql(
                    'INSERT OR REPLACE INTO lorcana_collection_cards (collection_id, card_id, added_at) VALUES (?, ?, ?)',
                    [collectionId, card.Unique_ID, now]
                );
            });
            
            // Verify the card is now marked as collected
            const [verification] = await database.executeSql(
                `SELECT 
                    lc.collected,
                    CASE WHEN lcc.card_id IS NOT NULL THEN 1 ELSE 0 END as in_collection
                 FROM lorcana_cards lc
                 LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                 WHERE lc.Unique_ID = ?`,
                [card.Unique_ID]
            );
            
            if (verification.rows.length > 0) {
                const verifiedCard = verification.rows.item(0);
                const isCollected = Boolean(verifiedCard.collected) || Boolean(verifiedCard.in_collection);
                
                if (!isCollected) {
                    console.warn('[useLorcanaCollection] Card not properly marked as collected, fixing...');
                    await database.executeSql(
                        'UPDATE lorcana_cards SET collected = 1 WHERE Unique_ID = ?',
                        [card.Unique_ID]
                    );
                    
                    await database.executeSql(
                        'INSERT OR REPLACE INTO lorcana_collection_cards (collection_id, card_id, added_at) VALUES (?, ?, ?)',
                        [collectionId, card.Unique_ID, new Date().toISOString()]
                    );
                }
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
                        CASE WHEN lcc.card_id IS NOT NULL THEN 1 ELSE 0 END as in_collection
                 FROM lorcana_cards lc
                 LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                 WHERE lc.Unique_ID IN (${cardIds.map(() => '?').join(',')})`,
                cardIds
            );
            
            const collectionStatusMap = new Map();
            for (let i = 0; i < results.rows.length; i++) {
                const row = results.rows.item(i);
                const isCollected = Boolean(row.collected) || Boolean(row.in_collection);
                collectionStatusMap.set(row.Unique_ID, isCollected);
            }
            
            let hasInconsistencies = false;
            const updatedCards = cards.map(card => {
                if (!card.Unique_ID) return card;
                
                const databaseCollected = collectionStatusMap.get(card.Unique_ID);
                if (databaseCollected !== undefined && databaseCollected !== !!card.collected) {
                    hasInconsistencies = true;
                    return { ...card, collected: databaseCollected };
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