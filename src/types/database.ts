export interface DatabaseCard {
    uuid: string;
    name: string;
    setCode: string;
    rarity: string;
    manaCost?: string;
    type?: string;
    text?: string;
    colors?: string[];
    colorIdentity?: string[];
    power?: string;
    toughness?: string;
    layout?: string;
    manaValue?: number;
    subtypes?: string[];
    supertypes?: string[];
    types?: string[];
}

export interface SetInfo {
    code: string;
    name: string;
    releaseDate: string;
    totalCards: number;
    type: string;
}

export interface CardPrice {
    uuid: string;
    name: string;
    normalPrice: number;
    foilPrice: number;
    lastUpdated: number;
    setCode: string;
    type: string;
    rarity: string;
    manaCost?: string;
    artist?: string;
    colorIdentity?: string[];
    colors?: string[];
    finishes?: string[];
    flavorText?: string;
    frameVersion?: string;
    hasFoil: boolean;
    hasNonFoil: boolean;
    keywords?: string[];
    layout?: string;
    manaValue?: number | null;
    number?: string;
    power?: string;
    printings?: string[];
    subtypes?: string[];
    supertypes?: string[];
    text?: string;
    toughness?: string;
    types?: string[];
}

export interface PriceData {
    normal: number;
    foil: number;
    timestamp: number;
}

export interface PricePoint {
    [date: string]: number;
}

export interface RetailPrices {
    normal?: PricePoint;
    foil?: PricePoint;
    etched?: PricePoint;
    glossy?: PricePoint;
}

export interface PriceSource {
    retail?: RetailPrices;
    buylist?: RetailPrices;
    currency?: 'USD' | 'EUR';
}

export interface PaperPrices {
    cardkingdom?: PriceSource;
    cardmarket?: PriceSource;
    cardsphere?: PriceSource;
    tcgplayer?: PriceSource;
}

export interface MTGOPrices {
    cardhoarder?: PriceSource;
}

export interface CardPrices {
    paper?: PaperPrices;
    mtgo?: MTGOPrices;
    arena?: PriceSource;
}

export interface MTGJsonPriceData {
    data: {
        [uuid: string]: CardPrices | { date: string; version: string };
    };
}
