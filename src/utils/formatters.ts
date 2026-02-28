export const formatCurrency = (value: string | number | null): string => {
    if (value === null || value === '') return '$0.00';
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numericValue);
};

type LorcanaRarityKey =
    | 'common'
    | 'uncommon'
    | 'rare'
    | 'super rare'
    | 'legendary'
    | 'enchanted'
    | 'epic'
    | 'iconic'
    | 'promo';

const LORCANA_RARITY_ORDER: LorcanaRarityKey[] = [
    'common',
    'uncommon',
    'rare',
    'super rare',
    'legendary',
    'enchanted',
    'epic',
    'iconic',
    'promo',
];

const LORCANA_RARITY_INFO: Record<LorcanaRarityKey, { label: string; shortLabel: string; color: string }> = {
    common: { label: 'Common', shortLabel: 'C', color: '#B0B0B0' },
    uncommon: { label: 'Uncommon', shortLabel: 'U', color: '#7FFFD4' },
    rare: { label: 'Rare', shortLabel: 'R', color: '#FFD700' },
    'super rare': { label: 'Super Rare', shortLabel: 'SR', color: '#FF6F61' },
    legendary: { label: 'Legendary', shortLabel: 'L', color: '#C68CFF' },
    enchanted: { label: 'Enchanted', shortLabel: 'EN', color: '#00BFFF' },
    epic: { label: 'Epic', shortLabel: 'EP', color: '#FF8C00' },
    iconic: { label: 'Iconic', shortLabel: 'IC', color: '#9400D3' },
    promo: { label: 'Promo', shortLabel: 'PR', color: '#2ECC71' },
};

const LORCANA_RARITY_ALIASES: Record<string, LorcanaRarityKey> = {
    common: 'common',
    commons: 'common',
    uncommon: 'uncommon',
    uncommons: 'uncommon',
    rare: 'rare',
    rares: 'rare',
    super: 'super rare',
    'super rare': 'super rare',
    superrare: 'super rare',
    'super-rare': 'super rare',
    'super_rare': 'super rare',
    legendary: 'legendary',
    enchanted: 'enchanted',
    epic: 'epic',
    icon: 'iconic',
    iconic: 'iconic',
    promo: 'promo',
    promos: 'promo',
};

const toTitleCase = (value: string): string =>
    value
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

export const normalizeLorcanaRarity = (rarity?: string | null): LorcanaRarityKey | null => {
    if (!rarity) return null;
    const normalized = rarity
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');

    const match = LORCANA_RARITY_ALIASES[normalized];
    if (match) {
        return match;
    }

    return null;
};

export const formatLorcanaRarity = (rarity?: string | null, fallback: string = 'Unknown'): string => {
    const normalized = normalizeLorcanaRarity(rarity);
    if (normalized) {
        return LORCANA_RARITY_INFO[normalized].label;
    }

    if (!rarity) {
        return fallback;
    }

    return toTitleCase(rarity.replace(/[_-]+/g, ' '));
};

export const getLorcanaRarityColor = (
    rarity?: string | null,
    fallback: string = '#B0B0B0'
): string => {
    const normalized = normalizeLorcanaRarity(rarity);
    if (normalized) {
        return LORCANA_RARITY_INFO[normalized].color;
    }
    return fallback;
};

export const getLorcanaRarityShortLabel = (
    rarity?: string | null,
    fallback: string = '?'
): string => {
    const normalized = normalizeLorcanaRarity(rarity);
    if (normalized) {
        return LORCANA_RARITY_INFO[normalized].shortLabel;
    }
    return fallback;
};

export const LORCANA_RARITY_OPTIONS = LORCANA_RARITY_ORDER.map(
    key => LORCANA_RARITY_INFO[key].label
);

// ── Lorcana ink colours ───────────────────────────────────────────────────────

export const INK_COLOR_MAP: Record<string, string> = {
    amber: '#FFA500',
    amethyst: '#9966CC',
    emerald: '#50C878',
    ruby: '#E0115F',
    sapphire: '#0F52BA',
    steel: '#71797E',
};

type LorcastInkSource = {
    ink?: string | null;
    inks?: string[] | null;
};

const LORCANA_INK_NAME_MAP: Record<string, string> = {
    amber: 'Amber',
    amethyst: 'Amethyst',
    emerald: 'Emerald',
    ruby: 'Ruby',
    sapphire: 'Sapphire',
    steel: 'Steel',
};

export const normalizeLorcanaInk = (ink?: string | null): string | null => {
    if (typeof ink !== 'string') return null;
    const trimmed = ink.trim();
    if (!trimmed) return null;

    return LORCANA_INK_NAME_MAP[trimmed.toLowerCase()] ?? trimmed;
};

export const getLorcanaInkList = (card?: LorcastInkSource | null): string[] => {
    if (!card) return [];

    const seen = new Set<string>();
    const normalizedInks: string[] = [];

    const inkCandidates =
        Array.isArray(card.inks) && card.inks.length > 0
            ? card.inks
            : [];

    for (const ink of inkCandidates) {
        const normalizedInk = normalizeLorcanaInk(ink);
        if (!normalizedInk) continue;

        const inkKey = normalizedInk.toLowerCase();
        if (seen.has(inkKey)) continue;

        seen.add(inkKey);
        normalizedInks.push(normalizedInk);
    }

    if (normalizedInks.length === 0) {
        const fallbackInk = normalizeLorcanaInk(card.ink);
        if (fallbackInk) {
            normalizedInks.push(fallbackInk);
        }
    }

    return normalizedInks;
};

export const buildLorcanaColorString = (card?: LorcastInkSource | null): string | null => {
    const inks = getLorcanaInkList(card);
    return inks.length > 0 ? inks.join('/') : null;
};

/** Returns the hex colour for the first ink in a card's Color field. */
export const inkColor = (color: string | undefined): string =>
    INK_COLOR_MAP[(color ?? '').toLowerCase().split(/[/,|& ]+/)[0]?.trim() ?? ''] ?? '#999';

/** Splits a Color string into individual Lorcana ink tokens. */
export const tokenizeColorString = (color: string | undefined): string[] => {
    if (typeof color !== 'string' || !color.trim()) return [];
    const normalized = color.toLowerCase();
    const keywordMatches = normalized.match(/\b(amber|amethyst|emerald|ruby|sapphire|steel)\b/g);
    if (keywordMatches && keywordMatches.length > 0) return keywordMatches;
    return normalized
        .replace(/[\/|&+]/g, ',')
        .split(',')
        .map(token => token.trim())
        .filter(Boolean);
};

/** Returns 1–2 gradient hex colours for a card's Color field. */
export const getBadgeGradientColors = (color: string | undefined): string[] => {
    const resolvedColors: string[] = [];
    for (const token of tokenizeColorString(color)) {
        const mapped = INK_COLOR_MAP[token];
        if (!mapped || resolvedColors.includes(mapped)) continue;
        resolvedColors.push(mapped);
        if (resolvedColors.length === 2) break;
    }
    return resolvedColors;
};
