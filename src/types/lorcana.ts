export interface LorcanaCard {
    id: number;
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
} 