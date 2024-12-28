import { Card, ExtendedCard } from '../types/card';

const SCRYFALL_API_BASE = 'https://api.scryfall.com';
const CACHE_EXPIRY = 1000 * 60 * 60; // 1 hour
const USER_AGENT = 'MTGPriceApp/1.0';

interface ScryfallCard {
    id: string;
    oracle_id: string;
    multiverse_ids?: number[];
    mtgo_id?: number;
    arena_id?: number;
    tcgplayer_id?: number;
    cardmarket_id?: number;
    name: string;
    set: string;
    set_name: string;
    collector_number: string;
    rarity: string;
    mana_cost?: string;
    type_line: string;
    oracle_text?: string;
    image_uris?: {
        normal: string;
        large: string;
        art_crop: string;
    };
    prices: {
        usd?: string;
        usd_foil?: string;
        usd_etched?: string;
        eur?: string;
        eur_foil?: string;
        tix?: string;
    };
    purchase_uris: {
        tcgplayer?: string;
        cardmarket?: string;
        cardhoarder?: string;
    };
    legalities: {
        standard: string;
        pioneer: string;
        modern: string;
        legacy: string;
        vintage: string;
        commander: string;
        pauper: string;
        [key: string]: string;
    };
}

interface PriceData {
    price: number;
    timestamp: number;
}

class ScryfallService {
    private priceCache: Map<string, PriceData> = new Map();
    private requestQueue: Promise<any>[] = [];
    private lastRequestTime: number = 0;
    private readonly MIN_REQUEST_INTERVAL = 100; // 100ms between requests

    private async throttleRequest(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            await new Promise(resolve =>
                setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest)
            );
        }

        this.lastRequestTime = Date.now();
    }

    private async fetchWithThrottle(url: string): Promise<any> {
        await this.throttleRequest();

        const headers = {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };

        try {
            const response = await fetch(url, { headers });

            if (!response.ok) {
                console.error(`[ScryfallService] HTTP error ${response.status}: ${response.statusText}`);
                if (response.status === 404) {
                    console.log('[ScryfallService] Resource not found');
                    throw new Error(`Card not found: ${url}`);
                }
                throw new Error(`Scryfall API error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[ScryfallService] Request failed:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
            }
            throw error;
        }
    }

    private transformScryfallCard = (scryfallCard: ScryfallCard): ExtendedCard => {
        return {
            id: scryfallCard.id,
            name: scryfallCard.name,
            setCode: scryfallCard.set?.toUpperCase() ?? 'UNK',
            setName: scryfallCard.set_name ?? 'Unknown Set',
            collectorNumber: scryfallCard.collector_number,
            rarity: scryfallCard.rarity,
            manaCost: scryfallCard.mana_cost,
            type: scryfallCard.type_line,
            text: scryfallCard.oracle_text,
            imageUrl: scryfallCard.image_uris?.normal,
            imageUris: scryfallCard.image_uris,
            prices: {
                usd: scryfallCard.prices?.usd,
                usdFoil: scryfallCard.prices?.usd_foil,
                usdEtched: scryfallCard.prices?.usd_etched,
                eur: scryfallCard.prices?.eur,
                eurFoil: scryfallCard.prices?.eur_foil,
                tix: scryfallCard.prices?.tix,
            },
            purchaseUrls: {
                tcgplayer: scryfallCard.purchase_uris?.tcgplayer,
                cardmarket: scryfallCard.purchase_uris?.cardmarket,
                cardhoarder: scryfallCard.purchase_uris?.cardhoarder,
            },
            legalities: scryfallCard.legalities ?? {},
        };
    };

    async searchCards(query: string, page: number = 1): Promise<{ data: ExtendedCard[], hasMore: boolean }> {
        try {
            const encodedQuery = encodeURIComponent(query.trim());
            if (!encodedQuery) return { data: [], hasMore: false };

            console.log(`[ScryfallService] Searching for: ${encodedQuery}, page: ${page}`);
            const response = await fetch(
                `https://api.scryfall.com/cards/search?q=${encodedQuery}&page=${page}`
            );

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 404) {
                    return { data: [], hasMore: false };
                }
                throw new Error(`Scryfall API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return {
                data: data.data.map(this.transformScryfallCard),
                hasMore: data.has_more || false
            };
        } catch (error) {
            console.error('[ScryfallService] Search error:', error);
            throw error;
        }
    }

    async getCardById(cardId: string): Promise<ExtendedCard> {
        try {
            // console.log(`[ScryfallService] Fetching card by ID: ${cardId}`);
            const url = `${SCRYFALL_API_BASE}/cards/${cardId}`;
            // console.log(`[ScryfallService] Request URL: ${url}`);

            const data = await this.fetchWithThrottle(url);

            if (!data || !data.name) {
                console.error('[ScryfallService] Invalid card data received:', data);
                throw new Error('Invalid card data received from Scryfall API');
            }

            const transformedCard = this.transformScryfallCard(data);

            return transformedCard;
        } catch (error) {
            console.error(`[ScryfallService] Error fetching card ${cardId}:`, error);
            throw error;
        }
    }

    async getCardPrice(cardId: string): Promise<number | undefined> {
        const cached = this.priceCache.get(cardId);
        if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
            return cached.price;
        }

        const card = await this.getCardById(cardId);
        const price = card.prices?.usd;
        if (price !== undefined) {
            this.priceCache.set(cardId, {
                price: Number(price),
                timestamp: Date.now(),
            });
        }

        return price ? Number(price) : undefined;
    }

    async getCardsBySet(setCode: string): Promise<ExtendedCard[]> {
        const url = `${SCRYFALL_API_BASE}/cards/search?q=set:${setCode}`;
        const data = await this.fetchWithThrottle(url);
        return data.data.map(this.transformScryfallCard);
    }

    async autocompleteCardName(query: string): Promise<string[]> {
        if (query.length < 2) return [];

        try {
            const url = `${SCRYFALL_API_BASE}/cards/autocomplete?q=${encodeURIComponent(query)}`;
            const data = await this.fetchWithThrottle(url);
            return data.data || [];
        } catch (error) {
            console.error('Autocomplete error:', error);
            return [];
        }
    }

    async getCardByName(cardName: string): Promise<ExtendedCard | null> {
        try {
            // console.log(`[ScryfallService] Fetching card by name: ${cardName}`);
            const url = `${SCRYFALL_API_BASE}/cards/named?exact=${encodeURIComponent(cardName)}`;
            // console.log(`[ScryfallService] Request URL: ${url}`);

            const data = await this.fetchWithThrottle(url);

            if (!data || !data.name) {
                console.error('[ScryfallService] Invalid card data received:', data);
                return null;
            }

            const transformedCard = this.transformScryfallCard(data);

            return transformedCard;
        } catch (error) {
            console.error(`[ScryfallService] Error fetching card ${cardName}:`, error);
            if (error instanceof Error && error.message.includes('404')) {
                return null;
            }
            throw error;
        }
    }

    async getExtendedDataForCards(cards: Card[]): Promise<ExtendedCard[]> {
        // console.log(`[ScryfallService] Fetching extended data for ${cards.length} cards`);
        const extendedCards: ExtendedCard[] = [];

        for (const card of cards) {
            try {
                const extendedCard = await this.getCardByName(card.name);
                if (extendedCard) {
                    // Merge our database data with Scryfall data
                    extendedCards.push({
                        ...extendedCard,
                        uuid: card.uuid, // Keep our database UUID
                    });
                } else {
                    console.warn(`[ScryfallService] Could not find extended data for card: ${card.name}`);
                }
            } catch (error) {
                console.error(`[ScryfallService] Error fetching extended data for ${card.name}:`, error);
                // Continue with next card even if one fails
            }

            // Add a small delay between requests to respect rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return extendedCards;
    }
}

export const scryfallService = new ScryfallService(); 