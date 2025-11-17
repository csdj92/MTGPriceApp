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
