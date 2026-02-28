export interface LorcanaCard {
    id?: number;
    uuid?: string;
    Unique_ID: string;
    Name: string;
    name?: string;
    Set_Name: string;
    set_name?: string;
    Set_ID?: string;
    set_id?: string;
    Set_Num?: number;
    Card_Num?: number;
    card_num?: number;
    Rarity: string;
    rarity?: string;
    Color: string;
    Cost: number;
    Strength?: number;
    Willpower?: number;
    Type: string;
    Classifications?: string;
    Body_Text?: string;
    body_text?: string;
    Flavor_Text?: string;
    Image?: string;
    image?: string;
    price_usd?: string | null;
    price_usd_foil?: string | null;
    prices?: {
        usd?: string | null;
        usd_foil?: string | null;
        usdFoil?: string | null;
        tcgplayer_id?: number | string | null;
    };
    quantity_normal?: number;
    quantity_foil?: number;
    collected?: boolean;
    hasFoil?: boolean;
    isFoil?: boolean;
    isOriginalScan?: boolean;
    Artist?: string;
    Date_Added?: string;
    Date_Modified?: string;
    Franchise?: string;
    Inkable?: number;
    Lore?: number;
    [key: string]: any;
}

// Cards retrieved from the database may have any field missing
export type PartialLorcanaCard = Partial<LorcanaCard>;

export interface LorcanaPrice {
    usd: string | null;
    usd_foil: string | null;
    tcgplayer_id: string | null;
}

export interface LorcanaCardWithPrice extends LorcanaCard {
    prices?: LorcanaPrice;
    isExpanded?: boolean;
    last_updated?: string;
}

// Partial version for database results that may have incomplete data
export interface PartialLorcanaCardWithPrice extends PartialLorcanaCard {
    prices?: LorcanaPrice;
    isExpanded?: boolean;
    last_updated?: string;
}

export interface LorcanaDeck {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
    card_count: number;
    total_value: number;
}

export interface LorcanaDeckCard {
    id: number;
    deck_id: string;
    card_id: string;
    quantity: number;
    added_at: string;
}

export interface LorcanaDeckCardWithCard extends LorcanaDeckCard {
    card: LorcanaCard;
}
