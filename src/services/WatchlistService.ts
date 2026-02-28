import { getLorcanaDatabase } from './DatabaseAccess';
import type { LorcanaCard } from '../types/lorcana';

const getDB = () => getLorcanaDatabase();

export interface WatchlistEntry {
    card_id: string;
    target_buy: number | null;
    target_sell: number | null;
    created_at: string;
    card: LorcanaCard;
    current_usd: number | null;
    current_usd_foil: number | null;
    buy_hit: boolean;
    sell_hit: boolean;
}

export const getWatchlist = async (): Promise<WatchlistEntry[]> => {
    const db = await getDB();
    const [result] = await db.executeSql(
        `SELECT w.card_id, w.target_buy, w.target_sell, w.created_at,
                lc.Name, lc.Set_Name, lc.Set_ID, lc.Color, lc.Rarity,
                lc.Cost, lc.Type, lc.Image, lc.Unique_ID,
                lc.price_usd, lc.price_usd_foil,
                lcp.usd as live_usd, lcp.usd_foil as live_usd_foil
         FROM lorcana_price_watchlist w
         JOIN lorcana_cards lc ON lc.Unique_ID = w.card_id
         LEFT JOIN lorcana_card_prices lcp ON lcp.card_id = w.card_id
         ORDER BY w.created_at DESC`
    );

    const entries: WatchlistEntry[] = [];
    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        const currentUsd = row.live_usd !== null ? parseFloat(row.live_usd) :
            row.price_usd !== null ? parseFloat(row.price_usd) : null;
        const currentFoil = row.live_usd_foil !== null ? parseFloat(row.live_usd_foil) :
            row.price_usd_foil !== null ? parseFloat(row.price_usd_foil) : null;

        entries.push({
            card_id: row.card_id,
            target_buy: row.target_buy,
            target_sell: row.target_sell,
            created_at: row.created_at,
            card: {
                Unique_ID: row.Unique_ID,
                Name: row.Name,
                Set_Name: row.Set_Name,
                Set_ID: row.Set_ID,
                Color: row.Color,
                Rarity: row.Rarity,
                Cost: row.Cost,
                Type: row.Type,
                Image: row.Image,
                price_usd: row.price_usd,
                price_usd_foil: row.price_usd_foil,
            },
            current_usd: currentUsd,
            current_usd_foil: currentFoil,
            buy_hit: row.target_buy !== null && currentUsd !== null && currentUsd <= row.target_buy,
            sell_hit: row.target_sell !== null && currentUsd !== null && currentUsd >= row.target_sell,
        });
    }
    return entries;
};

export const getWatchlistEntry = async (cardId: string): Promise<{ target_buy: number | null; target_sell: number | null } | null> => {
    const db = await getDB();
    const [result] = await db.executeSql(
        'SELECT target_buy, target_sell FROM lorcana_price_watchlist WHERE card_id = ?',
        [cardId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows.item(0);
    return { target_buy: row.target_buy, target_sell: row.target_sell };
};

export const upsertWatchlistEntry = async (
    cardId: string,
    targetBuy: number | null,
    targetSell: number | null
): Promise<void> => {
    const db = await getDB();
    await db.executeSql(
        `INSERT OR REPLACE INTO lorcana_price_watchlist (card_id, target_buy, target_sell, created_at)
         VALUES (?, ?, ?, COALESCE((SELECT created_at FROM lorcana_price_watchlist WHERE card_id = ?), ?))`,
        [cardId, targetBuy, targetSell, cardId, new Date().toISOString()]
    );
};

export const removeFromWatchlist = async (cardId: string): Promise<void> => {
    const db = await getDB();
    await db.executeSql('DELETE FROM lorcana_price_watchlist WHERE card_id = ?', [cardId]);
};

export const getAlertCount = async (): Promise<number> => {
    const db = await getDB();
    const [result] = await db.executeSql(
        `SELECT COUNT(*) as count
         FROM lorcana_price_watchlist w
         LEFT JOIN lorcana_card_prices lcp ON lcp.card_id = w.card_id
         WHERE (w.target_buy IS NOT NULL AND lcp.usd IS NOT NULL AND CAST(lcp.usd AS REAL) <= w.target_buy)
            OR (w.target_sell IS NOT NULL AND lcp.usd IS NOT NULL AND CAST(lcp.usd AS REAL) >= w.target_sell)`
    );
    return result.rows.item(0).count;
};
