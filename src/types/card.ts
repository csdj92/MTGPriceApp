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

export interface ExtendedCard {
    id: string;
    uuid?: string;
    name: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    type: string;
    manaCost?: string;
    text?: string;
    rarity?: string;
    booster?: string;
    toughness?: string;
    power?: string;
    rulings_uri?: string;
    edhrec_rank?: number;
    related_uris?: {
        tcgplayer_infinite_articles: string;
        tcgplayer_infinite_decks: string;
        edhrec: string;
        gatherer: string;
    };
    imageUrl?: string;
    imageUris?: {
        small?: string;
        normal?: string;
        large?: string;
        art_crop?: string;
    };
    prices: {
        usd?: string | null;
        usdFoil?: string | null;
        usdEtched?: string | null;
        eur?: string | null;
        eurFoil?: string | null;
        tix?: string | null;
        normal?: number;
        foil?: number;
        tcgplayer?: {
            normal: number;
            foil: number;
        };
        cardmarket?: {
            normal: number;
            foil: number;
        };
    };
    purchaseUrls: {
        tcgplayer?: string;
        cardmarket?: string;
        cardhoarder?: string;
    };
    purchase_uris?: {
        tcgplayer?: string;
        cardmarket?: string;
        cardhoarder?: string;
    };
    legalities: {
        [format: string]: string;
    };
    quantity?: number;
    scannedAt?: number;
    isExpanded?: boolean;
    collected?: boolean;
    hasNonFoil: boolean;
    hasFoil: boolean;
    colors?: string[];
    colorIdentity: string[];
    keywords: string[];
    cmc: number;
    flavorText?: string;
    frameEffects: string[];
    isOriginalScan?: boolean;
}

// Define the ScannedCard type using the ExtendedCard as a base
export type ScannedCard = Omit<ExtendedCard, 'type'> & { 
  type: 'MTG' | 'Lorcana';
  bypassVariantSelection?: boolean; // Flag to bypass variant selection when true
  originalText?: string; // The original OCR text used to identify the card
  source?: string; // The source of the scan (e.g., 'camera', 'manual')
};

export interface OcrResult {
    text: string;
    mainName: string;
    subtype: string | null;
    isLorcana: boolean;
    setCode?: string | null;
    cardNumber?: string | null;
}

export interface LorcanaCard extends Card {
    version: string;  // The subtitle/version part of the card
    isLorcana: true;
}

export interface MtgCard extends Card {
    subtype: string | null;  // The subtype after the em dash in type line
    isLorcana: false;
}

export interface Filters {
    search: string;
    rarities: string[];
    colors: string[];
    colorIdentity: string[];
    keywords: string[];
    collectionStatus: 'all' | 'collected' | 'missing';
    priceRange: { min: number | null; max: number | null };
    power?: string;
    toughness?: string;
    edhrecRank?: number;
}

export type SortOption = 'name' | 'number' | 'price' | 'set' | 'quantity';
export type SortDirection = 'asc' | 'desc'; 