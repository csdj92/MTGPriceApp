export interface Card {
    uuid?: string;
    name: string;
    setCode: string;
    rarity: string;
    manaCost?: string;
    type?: string;
    text?: string;
    imageUrl?: string;
}

export interface ExtendedCard extends Card {
    id: string;
    oracleId: string;
    multiverseIds?: number[];
    mtgoId?: number;
    arenaId?: number;
    tcgplayerId?: number;
    cardmarketId?: number;
    setName: string;
    collectorNumber?: string;
    prices: {
        usd?: number;
        usdFoil?: number;
        usdEtched?: number;
        eur?: number;
        eurFoil?: number;
        tix?: number;
    };
    purchaseUrls: {
        tcgplayer?: string;
        cardmarket?: string;
        cardhoarder?: string;
    };
    legalities: {
        [format: string]: string;
    };
} 