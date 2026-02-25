/**
 * LorcastAPIService - Single source of truth for Lorcast API interactions
 * Handles all communication with api.lorcast.com/v0
 */

const LORCAST_BASE_URL = 'https://api.lorcast.com/v0';
const RATE_LIMIT_MS = 75; // 75ms delay between requests (recommended 50-100ms)

/**
 * Lorcast API Set Response
 */
export interface LorcastSet {
    id: string;
    code: string;
    name: string;
    released_at: string;
    card_count: number;
}

/**
 * Lorcast API Card Response
 */
export interface LorcastCard {
    id: string;
    name: string;
    version: string | null;
    layout: string;
    released_at: string;
    image_uris?: {
        digital?: {
            small?: string;
            normal?: string;
            large?: string;
        };
    };
    cost: number | null;
    inkwell: boolean;
    ink: string | null;
    inks: string[] | null;
    type: string[];
    classifications: string[];
    text: string | null;
    keywords: string[];
    move_cost: number | null;
    strength: number | null;
    willpower: number | null;
    lore: number | null;
    rarity: string;
    illustrators: string[];
    collector_number: string;
    lang: string;
    flavor_text: string | null;
    tcgplayer_id: number | null;
    legalities: {
        core: string;
    };
    set: {
        id: string;
        code: string;
        name: string;
    };
    prices?: {
        usd?: string;
        usd_foil?: string;
    };
}

class LorcastAPIService {
    private lastRequestTime: number = 0;

    /**
     * Rate limiting helper - ensures we don't exceed API rate limits
     */
    private async enforceRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < RATE_LIMIT_MS) {
            const delay = RATE_LIMIT_MS - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Fetch all available sets from Lorcast
     */
    async fetchAllSets(): Promise<LorcastSet[]> {
        try {
            console.log('[LorcastAPI] ════════════════════════════════════════');
            console.log('[LorcastAPI] FETCHING ALL SETS');
            console.log('[LorcastAPI] ════════════════════════════════════════');

            await this.enforceRateLimit();

            const url = `${LORCAST_BASE_URL}/sets`;
            console.log(`[LorcastAPI] → Making request to: ${url}`);

            const response = await fetch(url);

            console.log(`[LorcastAPI] ← Response status: ${response.status} ${response.statusText}`);
            console.log(`[LorcastAPI] ← Response headers:`, {
                contentType: response.headers.get('content-type'),
                contentLength: response.headers.get('content-length')
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[LorcastAPI] ✖ API request failed with status ${response.status}`);
                console.error(`[LorcastAPI] Error response body:`, errorText);
                throw new Error(`API request failed: ${response.status} - ${errorText}`);
            }

            console.log('[LorcastAPI] → Parsing JSON response...');
            const data = await response.json();
            console.log('[LorcastAPI] ← Raw response type:', typeof data);
            console.log('[LorcastAPI] ← Raw response keys:', Object.keys(data));
            console.log('[LorcastAPI] ← Has "results" key:', 'results' in data);

            const sets = data.results || data; // Handle both array and {results: []} formats
            console.log(`[LorcastAPI] ✓ Successfully parsed ${sets.length} sets`);

            if (sets.length > 0) {
                console.log('[LorcastAPI] First set example:', {
                    id: sets[0].id,
                    code: sets[0].code,
                    name: sets[0].name
                });
            }

            return sets;
        } catch (error) {
            console.error('[LorcastAPI] ✖ ERROR fetching sets:', error);
            console.error('[LorcastAPI] Error details:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            throw error;
        }
    }

    /**
     * Fetch a specific set by ID or code
     */
    async fetchSet(setIdOrCode: string | number): Promise<LorcastSet> {
        try {
            await this.enforceRateLimit();

            console.log(`[LorcastAPI] Fetching set: ${setIdOrCode}`);
            const response = await fetch(`${LORCAST_BASE_URL}/sets/${setIdOrCode}`);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const set = await response.json();
            console.log(`[LorcastAPI] Fetched set: ${set.name} (${set.code})`);

            return set;
        } catch (error) {
            console.error(`[LorcastAPI] Error fetching set ${setIdOrCode}:`, error);
            throw error;
        }
    }

    /**
     * Fetch all cards for a specific set (returns cards 0-240, may not include special cards)
     */
    async fetchSetCards(setIdOrCode: string | number): Promise<LorcastCard[]> {
        try {
            await this.enforceRateLimit();

            console.log(`[LorcastAPI] Fetching cards for set: ${setIdOrCode}`);
            const response = await fetch(`${LORCAST_BASE_URL}/sets/${setIdOrCode}/cards`);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const cards = await response.json();
            console.log(`[LorcastAPI] Fetched ${cards.length} cards for set ${setIdOrCode}`);

            // Validate cards
            const validCards = cards.filter((card: any) => {
                const isValid = card && card.name && card.set && card.set.code && card.collector_number;
                if (!isValid) {
                    console.warn(`[LorcastAPI] ⚠ Filtering out invalid card from fetchSetCards:`, {
                        id: card?.id,
                        name: card?.name,
                        hasSet: !!card?.set,
                        setCode: card?.set?.code,
                        collectorNumber: card?.collector_number
                    });
                }
                return isValid;
            });

            if (cards.length !== validCards.length) {
                console.warn(`[LorcastAPI] ⚠ Filtered out ${cards.length - validCards.length} invalid cards from fetchSetCards`);
            }

            return validCards;
        } catch (error) {
            console.error(`[LorcastAPI] Error fetching set cards for ${setIdOrCode}:`, error);
            throw error;
        }
    }

    /**
     * Fetch a single card by set and collector number
     */
    async fetchCard(setIdOrCode: string | number, collectorNumber: string | number): Promise<LorcastCard | null> {
        try {
            await this.enforceRateLimit();

            console.log(`[LorcastAPI] Fetching card: set ${setIdOrCode}, number ${collectorNumber}`);
            const response = await fetch(`${LORCAST_BASE_URL}/cards/${setIdOrCode}/${collectorNumber}`);

            if (response.status === 404) {
                console.log(`[LorcastAPI] Card not found: ${setIdOrCode}/${collectorNumber}`);
                return null;
            }

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const card = await response.json();
            console.log(`[LorcastAPI] Fetched card: ${card.name} - ${card.version || '(base)'}`);

            return card;
        } catch (error) {
            console.error(`[LorcastAPI] Error fetching card ${setIdOrCode}/${collectorNumber}:`, error);
            return null;
        }
    }

    /**
     * Search for cards using Lorcast's search syntax
     * Example: q="set:9 rarity:enchanted"
     */
    async searchCards(query: string, unique: 'cards' | 'prints' = 'prints'): Promise<LorcastCard[]> {
        try {
            await this.enforceRateLimit();

            console.log(`[LorcastAPI] Searching cards: query="${query}", unique=${unique}`);
            const encodedQuery = encodeURIComponent(query);
            const response = await fetch(`${LORCAST_BASE_URL}/cards/search?q=${encodedQuery}&unique=${unique}`);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            const cards = data.results || data; // Handle both array and {results: []} formats
            console.log(`[LorcastAPI] Search returned ${cards.length} cards`);

            // Validate cards
            const validCards = cards.filter((card: any) => {
                const isValid = card && card.name && card.set && card.set.code && card.collector_number;
                if (!isValid) {
                    console.warn(`[LorcastAPI] ⚠ Filtering out invalid card from searchCards:`, {
                        id: card?.id,
                        name: card?.name,
                        hasSet: !!card?.set,
                        setCode: card?.set?.code,
                        collectorNumber: card?.collector_number
                    });
                }
                return isValid;
            });

            if (cards.length !== validCards.length) {
                console.warn(`[LorcastAPI] ⚠ Filtered out ${cards.length - validCards.length} invalid cards from searchCards`);
            }

            return validCards;
        } catch (error) {
            console.error(`[LorcastAPI] Error searching cards:`, error);
            throw error;
        }
    }

    /**
     * Fetch ALL cards for a set using a comprehensive strategy:
     * 1. Bulk fetch via /sets/:id/cards (gets most cards 0-240)
     * 2. Search for variant prints (Enchanted, Epic, etc.)
     * 3. Try fetching higher collector numbers individually (241+)
     */
    async fetchAllCardsForSet(setIdOrCode: string | number): Promise<LorcastCard[]> {
        try {
            console.log(`[LorcastAPI] ════════════════════════════════════════`);
            console.log(`[LorcastAPI] COMPREHENSIVE FETCH FOR SET: ${setIdOrCode}`);
            console.log(`[LorcastAPI] ════════════════════════════════════════`);

            const allCards = new Map<string, LorcastCard>(); // Use Map to deduplicate by unique ID

            // Step 1: Bulk fetch main set cards
            console.log(`[LorcastAPI] → STEP 1: Bulk fetching main set cards...`);
            const bulkCards = await this.fetchSetCards(setIdOrCode);
            bulkCards.forEach(card => {
                const uniqueKey = `${card.set.code}-${card.collector_number}`;
                allCards.set(uniqueKey, card);
            });
            console.log(`[LorcastAPI] ✓ STEP 1 Complete: ${bulkCards.length} cards via bulk endpoint`);
            console.log(`[LorcastAPI]   Total unique cards so far: ${allCards.size}`);

            // Step 2: Search for all prints (includes Enchanted, Epic variants)
            console.log(`[LorcastAPI] → STEP 2: Searching for variant prints...`);
            try {
                const searchCards = await this.searchCards(`set:${setIdOrCode}`, 'prints');
                const beforeSize = allCards.size;
                searchCards.forEach(card => {
                    const uniqueKey = `${card.set.code}-${card.collector_number}`;
                    // Only add if we don't already have this card
                    if (!allCards.has(uniqueKey)) {
                        allCards.set(uniqueKey, card);
                    }
                });
                const newCards = allCards.size - beforeSize;
                console.log(`[LorcastAPI] ✓ STEP 2 Complete: Search returned ${searchCards.length} prints, added ${newCards} new unique cards`);
                console.log(`[LorcastAPI]   Total unique cards so far: ${allCards.size}`);
            } catch (error) {
                console.warn('[LorcastAPI] ⚠ STEP 2 Failed: Search error, continuing with bulk cards only');
                console.warn('[LorcastAPI]   Error:', error instanceof Error ? error.message : String(error));
            }

            // Step 3: Try fetching special/promo cards at high collector numbers
            console.log(`[LorcastAPI] → STEP 3: Checking for special cards (241-250)...`);
            const highNumbers = Array.from({ length: 10 }, (_, i) => 241 + i);
            let specialCardsFound = 0;

            for (const collectorNum of highNumbers) {
                const card = await this.fetchCard(setIdOrCode, collectorNum);
                if (card) {
                    const uniqueKey = `${card.set.code}-${card.collector_number}`;
                    if (!allCards.has(uniqueKey)) {
                        allCards.set(uniqueKey, card);
                        specialCardsFound++;
                        console.log(`[LorcastAPI]   ✓ Found special card #${collectorNum}: ${card.name}`);
                    }
                }
            }

            if (specialCardsFound > 0) {
                console.log(`[LorcastAPI] ✓ STEP 3 Complete: Found ${specialCardsFound} special cards`);
            } else {
                console.log(`[LorcastAPI] ✓ STEP 3 Complete: No special cards found at 241+`);
            }
            console.log(`[LorcastAPI]   Total unique cards so far: ${allCards.size}`);

            const finalCards = Array.from(allCards.values());

            // Validate cards before returning
            const validCards = finalCards.filter(card => {
                const isValid = card && card.name && card.set && card.set.code && card.collector_number;
                if (!isValid) {
                    console.warn(`[LorcastAPI] ⚠ Filtering out invalid card:`, {
                        id: card?.id,
                        name: card?.name,
                        hasSet: !!card?.set,
                        setCode: card?.set?.code,
                        collectorNumber: card?.collector_number
                    });
                }
                return isValid;
            });

            console.log(`[LorcastAPI] ════════════════════════════════════════`);
            console.log(`[LorcastAPI] ✓ COMPREHENSIVE FETCH COMPLETE!`);
            console.log(`[LorcastAPI] Total cards fetched: ${finalCards.length}`);
            console.log(`[LorcastAPI] Valid cards after filtering: ${validCards.length}`);
            if (finalCards.length !== validCards.length) {
                console.warn(`[LorcastAPI] ⚠ Filtered out ${finalCards.length - validCards.length} invalid cards`);
            }
            console.log(`[LorcastAPI] ════════════════════════════════════════`);

            return validCards;
        } catch (error) {
            console.error(`[LorcastAPI] ✖ ERROR in comprehensive fetch for set ${setIdOrCode}:`, error);
            throw error;
        }
    }
}

// Export singleton instance
export const lorcastAPI = new LorcastAPIService();
