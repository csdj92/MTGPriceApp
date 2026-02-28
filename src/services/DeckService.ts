import { getLorcanaDatabase } from './DatabaseAccess';
import type { LorcanaDeck, LorcanaDeckCardWithCard } from '../types/lorcana';

const getDB = () => getLorcanaDatabase();

const uuid = () => `deck_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// ── Decks ─────────────────────────────────────────────────────────────────────

export const getAllDecks = async (): Promise<LorcanaDeck[]> => {
    const db = await getDB();
    const [result] = await db.executeSql(
        'SELECT * FROM lorcana_decks ORDER BY updated_at DESC'
    );
    return result.rows.raw() as LorcanaDeck[];
};

export const createDeck = async (name: string, description?: string): Promise<LorcanaDeck> => {
    const db = await getDB();
    const now = new Date().toISOString();
    const id = uuid();
    await db.executeSql(
        `INSERT INTO lorcana_decks (id, name, description, created_at, updated_at, card_count, total_value)
         VALUES (?, ?, ?, ?, ?, 0, 0)`,
        [id, name.trim(), description ?? null, now, now]
    );
    return { id, name: name.trim(), description, created_at: now, updated_at: now, card_count: 0, total_value: 0 };
};

export const renameDeck = async (deckId: string, name: string): Promise<void> => {
    const db = await getDB();
    await db.executeSql(
        'UPDATE lorcana_decks SET name = ?, updated_at = ? WHERE id = ?',
        [name.trim(), new Date().toISOString(), deckId]
    );
};

export const deleteDeck = async (deckId: string): Promise<void> => {
    const db = await getDB();
    await db.executeSql('DELETE FROM lorcana_decks WHERE id = ?', [deckId]);
};

// ── Deck cards ────────────────────────────────────────────────────────────────

export const getDeckCards = async (deckId: string): Promise<LorcanaDeckCardWithCard[]> => {
    const db = await getDB();
    const [result] = await db.executeSql(
        `SELECT dc.id, dc.deck_id, dc.card_id, dc.quantity, dc.added_at,
                lc.Name, lc.Set_Name, lc.Set_ID, lc.Set_Num, lc.Card_Num,
                lc.Color, lc.Rarity, lc.Cost, lc.Type, lc.Image,
                lc.Strength, lc.Willpower, lc.Lore, lc.Inkable,
                lc.price_usd, lc.price_usd_foil, lc.Unique_ID
         FROM lorcana_deck_cards dc
         JOIN lorcana_cards lc ON lc.Unique_ID = dc.card_id
         WHERE dc.deck_id = ?
         ORDER BY lc.Color, lc.Cost, lc.Name`,
        [deckId]
    );

    return (result.rows.raw() as any[]).map(row => ({
        id: row.id,
        deck_id: row.deck_id,
        card_id: row.card_id,
        quantity: row.quantity,
        added_at: row.added_at,
        card: {
            Unique_ID: row.Unique_ID,
            Name: row.Name,
            Set_Name: row.Set_Name,
            Set_ID: row.Set_ID,
            Set_Num: row.Set_Num,
            Card_Num: row.Card_Num,
            Color: row.Color,
            Rarity: row.Rarity,
            Cost: row.Cost,
            Type: row.Type,
            Image: row.Image,
            Strength: row.Strength,
            Willpower: row.Willpower,
            Lore: row.Lore,
            Inkable: row.Inkable,
            price_usd: row.price_usd,
            price_usd_foil: row.price_usd_foil,
        },
    })) as LorcanaDeckCardWithCard[];
};

export const addCardToDeck = async (deckId: string, cardId: string): Promise<void> => {
    const db = await getDB();
    const now = new Date().toISOString();

    // Upsert: if already present, increment quantity
    const [existing] = await db.executeSql(
        'SELECT id, quantity FROM lorcana_deck_cards WHERE deck_id = ? AND card_id = ?',
        [deckId, cardId]
    );

    if (existing.rows.length > 0) {
        const { id, quantity } = existing.rows.item(0);
        await db.executeSql(
            'UPDATE lorcana_deck_cards SET quantity = ? WHERE id = ?',
            [quantity + 1, id]
        );
    } else {
        await db.executeSql(
            'INSERT INTO lorcana_deck_cards (deck_id, card_id, quantity, added_at) VALUES (?, ?, 1, ?)',
            [deckId, cardId, now]
        );
    }

    await syncDeckMeta(deckId, db);
};

export const setCardQuantity = async (deckId: string, cardId: string, quantity: number): Promise<void> => {
    const db = await getDB();
    if (quantity <= 0) {
        await db.executeSql(
            'DELETE FROM lorcana_deck_cards WHERE deck_id = ? AND card_id = ?',
            [deckId, cardId]
        );
    } else {
        await db.executeSql(
            'UPDATE lorcana_deck_cards SET quantity = ? WHERE deck_id = ? AND card_id = ?',
            [quantity, deckId, cardId]
        );
    }
    await syncDeckMeta(deckId, db);
};

export const removeCardFromDeck = async (deckId: string, cardId: string): Promise<void> => {
    const db = await getDB();
    await db.executeSql(
        'DELETE FROM lorcana_deck_cards WHERE deck_id = ? AND card_id = ?',
        [deckId, cardId]
    );
    await syncDeckMeta(deckId, db);
};

// ── Collection card picker ────────────────────────────────────────────────────

export const getCollectedCards = async (inkColorFilter: string[] = []): Promise<import('../types/lorcana').LorcanaCard[]> => {
    const db = await getDB();

    let whereClause = '';
    const params: string[] = [];

    if (inkColorFilter.length > 0) {
        // Each color needs a LIKE match since Color can be "Amber/Amethyst" etc.
        const colorConditions = inkColorFilter.map(() => 'LOWER(lc.Color) LIKE ?').join(' OR ');
        whereClause = `WHERE (${colorConditions})`;
        inkColorFilter.forEach(c => params.push(`%${c.toLowerCase()}%`));
    }

    const [result] = await db.executeSql(
        `SELECT DISTINCT lc.Unique_ID, lc.Name, lc.Set_Name, lc.Set_ID, lc.Set_Num,
                lc.Card_Num, lc.Color, lc.Rarity, lc.Cost, lc.Type, lc.Image,
                lc.Strength, lc.Willpower, lc.Lore, lc.Inkable,
                lc.price_usd, lc.price_usd_foil, lc.Body_Text
         FROM lorcana_collection_cards cc
         JOIN lorcana_cards lc ON lc.Unique_ID = cc.card_id
         ${whereClause}
         ORDER BY lc.Color, lc.Cost, lc.Name`,
        params
    );

    return result.rows.raw() as import('../types/lorcana').LorcanaCard[];
};

// ── Validation helpers ────────────────────────────────────────────────────────

export const DECK_SIZE = 60;
export const MAX_COPIES = 4;
export const MAX_INK_COLORS = 2;

export interface DeckStats {
    totalCards: number;
    uniqueCards: number;
    inkColors: string[];
    totalValue: number;
    isLegal: boolean;
    violations: string[];
}

export const getDeckStats = (cards: LorcanaDeckCardWithCard[]): DeckStats => {
    let totalCards = 0;
    let totalValue = 0;
    const inkColors = new Set<string>();
    const nameCounts: Record<string, number> = {};
    const violations: string[] = [];

    for (const entry of cards) {
        totalCards += entry.quantity;
        const price = parseFloat(entry.card.price_usd ?? '0') || 0;
        totalValue += price * entry.quantity;

        // Parse ink colors (can be multi-color like "Amber/Amethyst")
        const colors = (entry.card.Color ?? '')
            .toLowerCase()
            .split(/[/,|& ]+/)
            .map(c => c.trim())
            .filter(Boolean);
        colors.forEach(c => inkColors.add(c));

        // Track by base name (strip " - Subtitle")
        const baseName = entry.card.Name.split(' - ')[0].trim();
        nameCounts[baseName] = (nameCounts[baseName] ?? 0) + entry.quantity;
    }

    // Check copy violations
    for (const [name, count] of Object.entries(nameCounts)) {
        if (count > MAX_COPIES) {
            violations.push(`${name}: ${count} copies (max ${MAX_COPIES})`);
        }
    }

    if (inkColors.size > MAX_INK_COLORS) {
        violations.push(`${inkColors.size} ink colors (max ${MAX_INK_COLORS})`);
    }

    if (totalCards !== DECK_SIZE) {
        violations.push(`${totalCards}/${DECK_SIZE} cards`);
    }

    return {
        totalCards,
        uniqueCards: cards.length,
        inkColors: Array.from(inkColors),
        totalValue,
        isLegal: violations.length === 0,
        violations,
    };
};

// ── Internal helpers ──────────────────────────────────────────────────────────

const syncDeckMeta = async (
    deckId: string,
    db: Awaited<ReturnType<typeof getDB>>
): Promise<void> => {
    const [result] = await db.executeSql(
        `SELECT
            COALESCE(SUM(dc.quantity), 0) as card_count,
            COALESCE(SUM(dc.quantity * CAST(COALESCE(lc.price_usd, '0') AS REAL)), 0) as total_value
         FROM lorcana_deck_cards dc
         LEFT JOIN lorcana_cards lc ON lc.Unique_ID = dc.card_id
         WHERE dc.deck_id = ?`,
        [deckId]
    );
    const { card_count, total_value } = result.rows.item(0);

    await db.executeSql(
        'UPDATE lorcana_decks SET card_count = ?, total_value = ?, updated_at = ? WHERE id = ?',
        [card_count, total_value, new Date().toISOString(), deckId]
    );
};
