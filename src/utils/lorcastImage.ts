export const toLorcastLargeJpg = (rawUrl: string): string => {
    let normalized = rawUrl.trim();
    if (!normalized) {
        return normalized;
    }

    // Prefer JPG when APIs return AVIF/WEBP variants.
    normalized = normalized.replace(/([?&](?:format|fm)=)avif\b/gi, '$1jpg');
    normalized = normalized.replace(/([?&](?:format|fm)=)webp\b/gi, '$1jpg');
    normalized = normalized.replace(/\.avif(?=($|\?))/gi, '.jpg');
    normalized = normalized.replace(/\.webp(?=($|\?))/gi, '.jpg');

    // Lorcast serves AVIF for small/normal/large; JPG is exposed on digital/full.
    // Capture only the card id (without file extensions) to avoid ".jpg.jpg" URLs.
    normalized = normalized.replace(
        /\/card\/digital\/(?:small|normal|large|full)\/([^./?]+)(?:\.[a-z0-9]+)*(?=($|\?))/i,
        '/card/digital/full/$1.jpg'
    );

    // Defensive cleanup for any already-corrupted paths that repeated ".jpg".
    normalized = normalized.replace(/(\.jpg){2,}(?=($|\?))/gi, '.jpg');

    return normalized;
};

export const getPreferredLorcastImageUrl = (card: any): string | null => {
    const rawUrl =
        card?.image_uris?.digital?.large ||
        card?.image_uris?.digital?.normal ||
        card?.image_uris?.digital?.small ||
        card?.Image ||
        card?.imageUris?.normal ||
        card?.imageUrl ||
        null;

    if (!rawUrl || typeof rawUrl !== 'string') {
        return null;
    }

    return toLorcastLargeJpg(rawUrl);
};
