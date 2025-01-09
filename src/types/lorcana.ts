export interface LorcanaCard {
    id?: number;
    Unique_ID: string;
    Name: string;
    Set_Name: string;
    Set_ID?: string;
    Set_Num?: number;
    Card_Num?: number;
    Rarity: string;
    Color: string;
    Cost: number;
    Strength?: number;
    Willpower?: number;
    Type: string;
    Classifications?: string;
    Body_Text?: string;
    Flavor_Text?: string;
    Image?: string;
    price_usd?: string | null;
    price_usd_foil?: string | null;
    collected?: boolean;
    Artist?: string;
    Date_Added?: string;
    Date_Modified?: string;
    Franchise?: string;
    Inkable?: boolean;
    Lore?: number;
}

export interface LorcanaPrice {
    usd: string | null;
    usd_foil: string | null;
    tcgplayer_id: string | null;
}

export interface LorcanaCardWithPrice extends LorcanaCard {
    prices?: LorcanaPrice;
    isExpanded?: boolean;
} 