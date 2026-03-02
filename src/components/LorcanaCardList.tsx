import React, { useState, useEffect, useMemo, useReducer } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Linking,
} from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;
import { getLorcanaCardPrice, debugCardData } from '../services/LorcanaService';
import type { LorcanaCard, PartialLorcanaCard, PartialLorcanaCardWithPrice } from '../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../utils/imageUtils';
import { useTheme } from '../context/ThemeContext';
import { addToBuyList, isInBuyList, subscribeBuyList, unsubscribeBuyList } from '../services/BuyListService';

type LorcanaCardType = LorcanaCard | PartialLorcanaCard | PartialLorcanaCardWithPrice;

const loadedImages = new Set<string>();

interface LorcanaCardListProps {
    cards: LorcanaCardType[];
    isLoading: boolean;
    onCardPress?: (card: LorcanaCardType) => void;
    onAddToCollection?: (card: LorcanaCardType) => void;
    onDeleteCard?: (card: LorcanaCardType) => void;
}

const LorcanaCardItem = React.memo(({ card, onPress, onAddToCollection, onDelete, priceData, isPriceLoading }: {
    card: LorcanaCardType;
    onPress?: () => void;
    onAddToCollection?: (card: LorcanaCardType) => void;
    onDelete?: (card: LorcanaCardType) => void;
    priceData?: { usd: string | null; usd_foil: string | null; tcgplayer_id?: string | number | null };
    isPriceLoading?: boolean;
}) => {
    const { theme } = useTheme();
    const [isExpanded, setIsExpanded] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    const cardId = card.Unique_ID || `${card.Name}-${card.Set_Num}-${card.Card_Num}`;
    const inBuyList = isInBuyList(cardId);

    useEffect(() => {
        subscribeBuyList(forceUpdate);
        return () => unsubscribeBuyList(forceUpdate);
    }, []);

    const cardName = card.Name || 'Unknown Card';
    const cardUniqueId = card.Unique_ID;
    const cardSet = card.Set_Name || 'Unknown Set';
    const imageUrl = card.Image || '';
    const isImageAlreadyLoaded = loadedImages.has(imageUrl);

    const logImageLoading = (url: string) => {
        if (!loadedImages.has(url) && url) loadedImages.add(url);
    };

    const openTCGPlayer = () => {
        if (priceData?.tcgplayer_id) {
            Linking.openURL(`https://www.tcgplayer.com/product/${priceData.tcgplayer_id}`);
        }
    };

    return (
        <TouchableOpacity
            style={[styles.cardItem, { backgroundColor: theme.surface, shadowColor: theme.text }]}
            onPress={() => { setIsExpanded(!isExpanded); onPress?.(); }}
        >
            {/* Header */}
            <View style={styles.cardHeader}>
                <View style={styles.titleContainer}>
                    <Text style={[styles.cardName, { color: theme.text }]}>{cardName}</Text>
                    <Text style={[styles.setName, { color: theme.textSecondary }]}>{cardSet}</Text>
                </View>
                <View style={styles.headerButtons}>
                    {onAddToCollection && (
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={(e) => { e.stopPropagation(); onAddToCollection(card); }}
                        >
                            <Icon name="plus-circle-outline" size={24} color={theme.primary} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e) => {
                            e.stopPropagation();
                            if (!inBuyList) {
                                const price = priceData?.usd ? parseFloat(priceData.usd) : undefined;
                                addToBuyList({
                                    id: cardId,
                                    name: card.Name || '',
                                    setName: card.Set_Name,
                                    color: card.Color,
                                    price,
                                    imageUrl: card.Image,
                                    tcgplayerId: priceData?.tcgplayer_id,
                                });
                            }
                        }}
                    >
                        <Icon name={inBuyList ? 'cart-check' : 'cart-plus'} size={24} color={inBuyList ? '#E67E22' : theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, { marginLeft: 8 }]}
                        onPress={(e) => { e.stopPropagation(); onDelete?.(card); }}
                    >
                        <Icon name="delete-outline" size={24} color={theme.error} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Stats */}
            <View style={styles.cardDetails}>
                <View style={styles.statsContainer}>
                    <Text style={[styles.cardType, { color: theme.textSecondary }]}>{card.Type}</Text>
                    <Text style={[styles.cardStats, { color: theme.text }]}>
                        Cost: {card.Cost}
                        {card.Strength !== undefined && ` • Strength: ${card.Strength}`}
                        {card.Willpower !== undefined && ` • Willpower: ${card.Willpower}`}
                    </Text>
                    {card.Classifications && (
                        <Text style={[styles.classifications, { color: theme.textSecondary }]}>{card.Classifications}</Text>
                    )}
                </View>

                {/* Prices */}
                <View style={styles.priceContainer}>
                    {isPriceLoading ? (
                        <ActivityIndicator size="small" color={theme.textSecondary} />
                    ) : (
                        <>
                            {priceData?.usd && (
                                <Text style={[styles.price, { color: theme.text, backgroundColor: theme.background }]}>
                                    USD: ${Number(priceData.usd).toFixed(2)}
                                </Text>
                            )}
                            {priceData?.usd_foil && (
                                <Text style={[styles.price, { color: theme.text, backgroundColor: theme.background }]}>
                                    Foil: ${Number(priceData.usd_foil).toFixed(2)}
                                </Text>
                            )}
                            {!priceData?.usd && !priceData?.usd_foil && (
                                <Text style={[styles.price, { color: theme.textSecondary, backgroundColor: theme.background }]}>
                                    No price data
                                </Text>
                            )}
                        </>
                    )}
                </View>
            </View>

            {/* Expanded content */}
            {isExpanded && (
                <View style={[styles.expandedContent, { borderTopColor: theme.border }]}>
                    {card.Image ? (
                        <View style={styles.imageContainer}>
                            {!imageError ? (
                                <FastImage
                                    source={getImageSource(card.Image) || {
                                        uri: card.Image,
                                        priority: FastImage.priority.normal,
                                        cache: FastImage.cacheControl.immutable,
                                    }}
                                    style={styles.cardImage}
                                    resizeMode={FastImage.resizeMode.contain}
                                    onError={() => {
                                        handleImageLoadError(card.Image, cardName);
                                        setImageError(true);
                                    }}
                                    onLoad={() => {
                                        if (!isImageAlreadyLoaded && card.Image) logImageLoading(card.Image);
                                        handleImageLoadSuccess(card.Image, { name: cardName, id: cardUniqueId });
                                        setImageLoaded(true);
                                        setImageError(false);
                                    }}
                                />
                            ) : (
                                <View style={[styles.cardImage, styles.placeholderImage, { backgroundColor: theme.border }]}>
                                    <Icon name="image-broken" size={48} color={theme.textSecondary} />
                                    <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>Image failed to load</Text>
                                    <TouchableOpacity
                                        style={[styles.retryButton, { backgroundColor: theme.primary }]}
                                        onPress={() => setImageError(false)}
                                    >
                                        <Text style={styles.retryText}>Retry</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={[styles.imageContainer, styles.placeholderImage, { backgroundColor: theme.border }]}>
                            <Icon name="image-off" size={48} color={theme.textSecondary} />
                            <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>No image available</Text>
                        </View>
                    )}

                    {card.Body_Text && (
                        <Text style={[styles.bodyText, { color: theme.text }]}>{card.Body_Text}</Text>
                    )}
                    {card.Flavor_Text && (
                        <Text style={[styles.flavorText, { color: theme.textSecondary }]}>{card.Flavor_Text}</Text>
                    )}

                    {priceData?.tcgplayer_id && (
                        <View style={[styles.purchaseSection, { borderTopColor: theme.border }]}>
                            <Text style={[styles.sectionHeader, { color: theme.text }]}>Purchase</Text>
                            <TouchableOpacity style={styles.tcgPlayerButton} onPress={openTCGPlayer}>
                                <Icon name="shopping" size={20} color="#fff" />
                                <Text style={styles.tcgPlayerButtonText}>TCGPlayer</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
});

const LorcanaCardList: React.FC<LorcanaCardListProps> = ({
    cards,
    isLoading,
    onCardPress,
    onAddToCollection,
    onDeleteCard,
}) => {
    const { theme } = useTheme();
    const [cardPrices, setCardPrices] = useState<Map<string, { usd: string | null; usd_foil: string | null; tcgplayer_id?: string | number | null }>>(new Map());
    const [loadingPrices, setLoadingPrices] = useState<Set<string>>(new Set());

    const memoizedCards = useMemo(() => cards, [
        cards.length,
        cards.map(card => card.Unique_ID || `${card.Name}-${card.Set_Num}-${card.Card_Num}`).join(','),
    ]);

    useEffect(() => {
        const fetchAllPrices = async () => {
            const newPrices = new Map(cardPrices);
            const updatedLoadingPrices = new Set(loadingPrices);
            let pricesChanged = false;

            for (const card of memoizedCards) {
                const cardId = card.Unique_ID || `${card.Name}-${card.Set_Num}-${card.Card_Num}`;
                if (!cardId || newPrices.has(cardId) || updatedLoadingPrices.has(cardId)) continue;

                if (card.price_usd || card.price_usd_foil) {
                    const tcgId = ('prices' in card && card.prices && (typeof card.prices.tcgplayer_id === 'number' || typeof card.prices.tcgplayer_id === 'string'))
                        ? card.prices.tcgplayer_id : undefined;
                    newPrices.set(cardId, { usd: card.price_usd ?? null, usd_foil: card.price_usd_foil ?? null, tcgplayer_id: tcgId });
                    pricesChanged = true;
                    continue;
                }

                const isMTGCard = 'name' in card && !('Name' in card);
                const isMissingEssentials = !card.Name || (!card.Unique_ID && (!card.Card_Num || !card.Set_Num || !card.Rarity));

                if (isMTGCard || isMissingEssentials) {
                    newPrices.set(cardId, { usd: null, usd_foil: null, tcgplayer_id: undefined });
                    pricesChanged = true;
                    continue;
                }

                updatedLoadingPrices.add(cardId);
                setLoadingPrices(new Set(updatedLoadingPrices));

                try {
                    if (__DEV__) debugCardData(card, 'LorcanaCardListEffect fetchAllPrices');
                    const priceData = await getLorcanaCardPrice({
                        Name: card.Name || '',
                        Set_Num: card.Set_Num,
                        Card_Num: card.Card_Num,
                        Rarity: card.Rarity,
                        Unique_ID: card.Unique_ID || '',
                    });
                    newPrices.set(cardId, { usd: priceData.usd, usd_foil: priceData.usd_foil, tcgplayer_id: priceData.tcgplayer_id });
                    pricesChanged = true;
                } catch (error) {
                    console.error(`[LorcanaCardList] Error fetching price for ${card.Name}:`, error);
                    newPrices.set(cardId, { usd: null, usd_foil: null, tcgplayer_id: undefined });
                    pricesChanged = true;
                } finally {
                    updatedLoadingPrices.delete(cardId);
                }
            }

            if (pricesChanged) setCardPrices(newPrices);
            setLoadingPrices(updatedLoadingPrices);
        };

        if (memoizedCards.length > 0) fetchAllPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memoizedCards]);

    if (isLoading && memoizedCards.length === 0) {
        return <ActivityIndicator style={styles.loader} size="large" color={theme.primary} />;
    }

    return (
        <FlatList
            data={memoizedCards}
            renderItem={({ item }) => {
                const cardId = item.Unique_ID || `${item.Name}-${item.Set_Num}-${item.Card_Num}`;
                return (
                    <LorcanaCardItem
                        card={item}
                        onPress={() => onCardPress?.(item)}
                        onAddToCollection={onAddToCollection}
                        onDelete={onDeleteCard}
                        priceData={cardPrices.get(cardId)}
                        isPriceLoading={loadingPrices.has(cardId)}
                    />
                );
            }}
            keyExtractor={(item) =>
                item.Unique_ID?.toString() ||
                `${item.Name}-${item.Card_Num}-${item.Set_Num}-${Math.random()}`
            }
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={10}
            removeClippedSubviews={true}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
                !isLoading ? (
                    <View style={styles.emptyListContainer}>
                        <Text style={[styles.emptyListText, { color: theme.textSecondary }]}>No Lorcana cards found.</Text>
                    </View>
                ) : null
            }
        />
    );
};

const styles = StyleSheet.create({
    listContainer:        { padding: 8 },
    loader:               { marginVertical: 20 },
    cardItem: {
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        elevation: 2,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
    },
    cardHeader:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    titleContainer:       { flex: 1 },
    cardName:             { fontSize: 18, fontWeight: 'bold' },
    setName:              { fontSize: 14, marginTop: 2 },
    headerButtons:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionButton:         { padding: 4 },
    cardDetails:          { marginTop: 8 },
    statsContainer:       { marginBottom: 8 },
    cardType:             { fontSize: 14, marginBottom: 4 },
    cardStats:            { fontSize: 14 },
    classifications:      { fontSize: 14, marginTop: 4 },
    priceContainer:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    price:                { fontSize: 14, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    expandedContent:      { marginTop: 12, borderTopWidth: 1, paddingTop: 12 },
    imageContainer:       { width: '100%', height: 300, marginBottom: 12, borderRadius: 8, overflow: 'hidden' },
    cardImage:            { width: '100%', height: '100%' },
    placeholderImage:     { justifyContent: 'center', alignItems: 'center', padding: 12 },
    placeholderText:      { fontSize: 14, marginTop: 8 },
    retryButton:          { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, marginTop: 8 },
    retryText:            { color: '#fff', fontSize: 14, fontWeight: 'bold' },
    bodyText:             { fontSize: 14, marginBottom: 8, lineHeight: 20 },
    flavorText:           { fontSize: 14, fontStyle: 'italic', marginTop: 8 },
    purchaseSection:      { marginTop: 12, borderTopWidth: 1, paddingTop: 12 },
    sectionHeader:        { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
    tcgPlayerButton:      { backgroundColor: '#4CAF50', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 8, gap: 8 },
    tcgPlayerButtonText:  { color: '#fff', fontSize: 16, fontWeight: '600' },
    emptyListContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    emptyListText:        { fontSize: 16 },
    addButton:            { padding: 4 },
    tcgButton:            { padding: 4 },
});

export default LorcanaCardList;
