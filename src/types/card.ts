import { LorcanaCard as LorcanaDbCard } from './lorcana';

export interface OcrResult {
    text: string;
    mainName?: string | null;
    subtype: string | null;
    isLorcana: boolean;
    setCode?: string | null;
    cardNumber?: string | null;
}

export interface LorcanaCard {
    uuid?: string;
    name: string;
    setCode: string;
    rarity: string;
    imageUrl?: string;
    version: string;  // The subtitle/version part of the card
    isLorcana: true;
}

export interface CardPrices {
    usd?: string | null;
    usdFoil?: string | null;
    usd_foil?: string | null;
    [key: string]: string | number | null | undefined;
}

export interface ScannedCard {
    id?: string;
    uuid?: string;
    name: string;
    type: 'Lorcana';
    setCode?: string;
    setName?: string;
    collectorNumber?: string;
    imageUrl?: string;
    imageUris?: {
        normal?: string;
        large?: string;
        small?: string;
        [key: string]: string | undefined;
    };
    prices?: CardPrices;
    purchaseUrls?: Record<string, string | undefined>;
    legalities?: Record<string, string | undefined>;
    scannedAt?: number;
    rarity?: string;
    hasFoil?: boolean;
    hasNonFoil?: boolean;
    isFoil?: boolean;
    colorIdentity?: string[];
    keywords?: string[];
    cmc?: number;
    frameEffects?: string[];
    card?: LorcanaDbCard | unknown;
}

// Legacy type alias for backward compatibility
export type ExtendedCard = ScannedCard;

export type SortOption = 'name' | 'number' | 'price' | 'set' | 'quantity';
export type SortDirection = 'asc' | 'desc';

export type LorcanaScannedCard = {
    id: string;
    uuid?: string;
    name: string;
    type: 'Lorcana';
    imageUrl: string;
    setCode: string;
    setName?: string;
    rarity?: string;
    prices?: CardPrices;
    scannedAt?: number;
    card: LorcanaCard;
    normalCount: number;
    foilCount: number;
    isFoil: boolean;
};

// ScannedItem now only supports Lorcana cards
export type ScannedItem = LorcanaScannedCard;
