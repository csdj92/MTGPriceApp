// ─── Buy List Service ─────────────────────────────────────────────────────────
// In-memory session cart. No persistence needed — it's a checkout session.

export interface BuyListItem {
    id: string;            // Unique_ID
    name: string;          // card.Name
    setName?: string;      // card.Set_Name
    color?: string;        // card.Color (for ink strip)
    quantity: number;
    price?: number;        // USD price
    imageUrl?: string;
    tcgplayerId?: string | number | null;
}

const _items = new Map<string, BuyListItem>();
const _listeners = new Set<() => void>();

const _notify = () => _listeners.forEach(fn => fn());

export const addToBuyList = (
    card: Omit<BuyListItem, 'quantity'>,
    qty = 1,
): void => {
    const existing = _items.get(card.id);
    _items.set(card.id, existing
        ? { ...existing, quantity: existing.quantity + qty }
        : { ...card, quantity: qty },
    );
    _notify();
};

export const removeFromBuyList = (id: string): void => {
    _items.delete(id);
    _notify();
};

export const updateBuyListQuantity = (id: string, qty: number): void => {
    const item = _items.get(id);
    if (!item) return;
    if (qty <= 0) {
        _items.delete(id);
    } else {
        _items.set(id, { ...item, quantity: qty });
    }
    _notify();
};

export const getBuyListItems = (): BuyListItem[] =>
    Array.from(_items.values());

export const getBuyListCount = (): number =>
    Array.from(_items.values()).reduce((sum, item) => sum + item.quantity, 0);

export const isInBuyList = (id: string): boolean => _items.has(id);

export const clearBuyList = (): void => {
    _items.clear();
    _notify();
};

export const subscribeBuyList = (fn: () => void): void => {
    _listeners.add(fn);
};

export const unsubscribeBuyList = (fn: () => void): void => {
    _listeners.delete(fn);
};

/** Opens TCGPlayer mass-entry page with all cart items pre-filled. */
export const buildTCGPlayerUrl = (): string => {
    const items = getBuyListItems();
    if (!items.length) {
        return 'https://www.tcgplayer.com/massentry?productlines_selected=Lorcana';
    }
    // TCGPlayer mass-entry format: "QTY Card Name" per line, URL-encoded
    const list = items.map(i => `${i.quantity} ${i.name}`).join('\r\n');
    return `https://www.tcgplayer.com/massentry?productlines_selected=Lorcana&c=${encodeURIComponent(list)}`;
};

/** Plain text list for clipboard sharing. */
export const buildBuyListText = (): string =>
    getBuyListItems()
        .map(i => `${i.quantity}x ${i.name}${i.setName ? ` (${i.setName})` : ''}`)
        .join('\n');

/** Total estimated price across all items. */
export const getBuyListTotal = (): number =>
    getBuyListItems().reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
