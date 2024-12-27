import { Card } from './DatabaseService';

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
            console.log(`[ScryfallService] Making request to: ${url}`);
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
            console.log('[ScryfallService] Response data:', JSON.stringify(data, null, 2));
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

    private transformScryfallCard(scryfallCard: ScryfallCard): ExtendedCard {
        return {
            uuid: scryfallCard.oracle_id,
            id: scryfallCard.id,
            oracleId: scryfallCard.oracle_id,
            multiverseIds: scryfallCard.multiverse_ids,
            mtgoId: scryfallCard.mtgo_id,
            arenaId: scryfallCard.arena_id,
            tcgplayerId: scryfallCard.tcgplayer_id,
            cardmarketId: scryfallCard.cardmarket_id,
            name: scryfallCard.name,
            setCode: scryfallCard.set?.toUpperCase() ?? 'UNK',
            setName: scryfallCard.set_name ?? 'Unknown Set',
            collectorNumber: scryfallCard.collector_number,
            rarity: scryfallCard.rarity,
            manaCost: scryfallCard.mana_cost,
            type: scryfallCard.type_line,
            text: scryfallCard.oracle_text,
            imageUrl: scryfallCard.image_uris?.normal,
            prices: {
                usd: scryfallCard.prices?.usd ? parseFloat(scryfallCard.prices.usd) : undefined,
                usdFoil: scryfallCard.prices?.usd_foil ? parseFloat(scryfallCard.prices.usd_foil) : undefined,
                usdEtched: scryfallCard.prices?.usd_etched ? parseFloat(scryfallCard.prices.usd_etched) : undefined,
                eur: scryfallCard.prices?.eur ? parseFloat(scryfallCard.prices.eur) : undefined,
                eurFoil: scryfallCard.prices?.eur_foil ? parseFloat(scryfallCard.prices.eur_foil) : undefined,
                tix: scryfallCard.prices?.tix ? parseFloat(scryfallCard.prices.tix) : undefined,
            },
            purchaseUrls: scryfallCard.purchase_uris ?? {},
            legalities: scryfallCard.legalities ?? {},
        };
    }

    async searchCards(query: string, page = 1): Promise<ExtendedCard[]> {
        try {
            console.log(`[ScryfallService] Searching cards with query: ${query}, page: ${page}`);
            const url = `${SCRYFALL_API_BASE}/cards/search?q=${encodeURIComponent(query)}&page=${page}`;
            console.log(`[ScryfallService] Request URL: ${url}`);

            const data = await this.fetchWithThrottle(url);
            console.log('[ScryfallService] Full API Response:', JSON.stringify(data, null, 2));

            const transformedCards = data.data.map(this.transformScryfallCard);
            console.log('[ScryfallService] Transformed cards:', JSON.stringify(transformedCards, null, 2));

            return transformedCards;
        } catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
                console.log('[ScryfallService] No results found for query');
                return []; // Return empty array for no results
            }
            console.error('[ScryfallService] Search error:', error);
            throw error;
        }
    }

    async getCardById(cardId: string): Promise<ExtendedCard> {
        try {
            console.log(`[ScryfallService] Fetching card by ID: ${cardId}`);
            const url = `${SCRYFALL_API_BASE}/cards/${cardId}`;
            console.log(`[ScryfallService] Request URL: ${url}`);

            const data = await this.fetchWithThrottle(url);
            console.log('[ScryfallService] Full API Response:', JSON.stringify(data, null, 2));

            if (!data || !data.name) {
                console.error('[ScryfallService] Invalid card data received:', data);
                throw new Error('Invalid card data received from Scryfall API');
            }

            const transformedCard = this.transformScryfallCard(data);
            console.log('[ScryfallService] Transformed card:', JSON.stringify(transformedCard, null, 2));

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
        if (card.price !== undefined) {
            this.priceCache.set(cardId, {
                price: card.price,
                timestamp: Date.now(),
            });
        }

        return card.price;
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
            console.log(`[ScryfallService] Fetching card by name: ${cardName}`);
            const url = `${SCRYFALL_API_BASE}/cards/named?exact=${encodeURIComponent(cardName)}`;
            console.log(`[ScryfallService] Request URL: ${url}`);

            const data = await this.fetchWithThrottle(url);
            console.log('[ScryfallService] Full API Response:', JSON.stringify(data, null, 2));

            if (!data || !data.name) {
                console.error('[ScryfallService] Invalid card data received:', data);
                return null;
            }

            const transformedCard = this.transformScryfallCard(data);
            console.log('[ScryfallService] Transformed card:', JSON.stringify(transformedCard, null, 2));

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
        console.log(`[ScryfallService] Fetching extended data for ${cards.length} cards`);
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