import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Linking,
    Animated
} from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
// Fix the Icon type with a proper type assertion to avoid type errors
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;
import { getLorcanaCardPrice, debugCardData } from '../services/LorcanaService';
import type { LorcanaCard, PartialLorcanaCard, PartialLorcanaCardWithPrice } from '../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../utils/imageUtils';

// Use a more flexible type for cards
type LorcanaCardType = LorcanaCard | PartialLorcanaCard | PartialLorcanaCardWithPrice;

// Track already loaded images to prevent duplicate loading
const loadedImages = new Set<string>();

interface LorcanaCardListProps {
    cards: LorcanaCardType[];
    isLoading: boolean;
    onCardPress?: (card: LorcanaCardType) => void;
    onAddToCollection?: (card: LorcanaCardType) => void;
    onDeleteCard?: (card: LorcanaCardType) => void;
}

// PriceDisplay component can be removed or simplified as LorcanaCardItem will handle price display
// For now, let's assume LorcanaCardItem handles it directly.

// Memoize the LorcanaCardItem component to prevent unnecessary re-renders
const LorcanaCardItem = React.memo(({ card, onPress, onAddToCollection, onDelete, priceData, isPriceLoading }: { 
    card: LorcanaCardType; 
    onPress?: () => void;
    onAddToCollection?: (card: LorcanaCardType) => void;
    onDelete?: (card: LorcanaCardType) => void;
    priceData?: { usd: string | null; usd_foil: string | null; tcgplayer_id?: number };
    isPriceLoading?: boolean;
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    // Removed price state and loading state from here
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    // Safe access to properties with nullish coalescing
    const cardName = card.Name || 'Unknown Card';
    const cardUniqueId = card.Unique_ID;
    const cardSet = card.Set_Name || 'Unknown Set';
    
    const imageUrl = card.Image || '';
    const isImageAlreadyLoaded = loadedImages.has(imageUrl);

    const logImageLoading = (url: string) => {
        if (!loadedImages.has(url) && url) {
            loadedImages.add(url);
        }
    };

    const openTCGPlayer = () => {
        if (priceData?.tcgplayer_id) {
            Linking.openURL(`https://www.tcgplayer.com/product/${priceData.tcgplayer_id}`);
        }
    };

    // Removed useEffect for fetching prices

    return (
        <TouchableOpacity
            style={styles.cardItem}
            onPress={() => {
                setIsExpanded(!isExpanded);
                onPress?.();
            }}
        >
            <View style={styles.cardHeader}>
                <View style={styles.titleContainer}>
                    <Text style={styles.cardName}>{cardName}</Text>
                    <Text style={styles.setName}>{cardSet}</Text>
                </View>
                <View style={styles.headerButtons}>
                    {onAddToCollection && (
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={(e) => {
                                e.stopPropagation();
                                onAddToCollection(card);
                            }}
                        >
                            <Icon name="plus-circle-outline" size={24} color="#2196F3" />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={[styles.actionButton, { marginLeft: 8 }]}
                        onPress={(e) => {
                            e.stopPropagation();
                            onDelete?.(card);
                        }}
                    >
                        <Icon name="delete-outline" size={24} color="#ff5252" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.cardDetails}>
                <View style={styles.statsContainer}>
                    <Text style={styles.cardType}>{card.Type}</Text>
                    <Text style={styles.cardStats}>
                        Cost: {card.Cost}
                        {card.Strength !== undefined && ` • Strength: ${card.Strength}`}
                        {card.Willpower !== undefined && ` • Willpower: ${card.Willpower}`}
                    </Text>
                    {card.Classifications && (
                        <Text style={styles.classifications}>{card.Classifications}</Text>
                    )}
                </View>

                <View style={styles.priceContainer}>
                    {isPriceLoading ? (
                        <ActivityIndicator size="small" color="#666" />
                    ) : (
                        <>
                            {priceData?.usd && (
                                <Text style={styles.price}>USD: ${Number(priceData.usd).toFixed(2)}</Text>
                            )}
                            {priceData?.usd_foil && (
                                <Text style={styles.price}>Foil: ${Number(priceData.usd_foil).toFixed(2)}</Text>
                            )}
                            {(!priceData?.usd && !priceData?.usd_foil) && (
                                <Text style={[styles.price, { color: '#666' }]}>No price data available</Text>
                            )}
                        </>
                    )}
                </View>
            </View>

            {isExpanded && (
                <View style={styles.expandedContent}>
                    {card.Image ? (
                        <View style={styles.imageContainer}>
                            {!imageError ? (
                                <FastImage
                                    source={getImageSource(card.Image) || { 
                                        uri: card.Image,
                                        priority: FastImage.priority.normal,
                                        cache: FastImage.cacheControl.immutable
                                    }}
                                    style={styles.cardImage}
                                    resizeMode={FastImage.resizeMode.contain}
                                    onError={() => {
                                        console.log(`[LorcanaCardList] Image load error for ${cardName}: ${card.Image}`);
                                        handleImageLoadError(card.Image, cardName);
                                        setImageError(true);
                                    }}
                                    onLoad={() => {
                                        if (!isImageAlreadyLoaded) {
                                            if (card.Image) {
                                                logImageLoading(card.Image);
                                            }
                                            handleImageLoadSuccess(card.Image, { name: cardName, id: cardUniqueId });
                                        }
                                        setImageLoaded(true);
                                        setImageError(false);
                                    }}
                                />
                            ) : (
                                <View style={[styles.cardImage, styles.placeholderImage]}>
                                    <Icon name="image-broken" size={48} color="#666" />
                                    <Text style={styles.placeholderText}>Image failed to load</Text>
                                    <TouchableOpacity 
                                        style={styles.retryButton}
                                        onPress={() => setImageError(false)}
                                    >
                                        <Text style={styles.retryText}>Retry</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={[styles.imageContainer, styles.placeholderImage]}>
                            <Icon name="image-off" size={48} color="#666" />
                            <Text style={styles.placeholderText}>No image available</Text>
                        </View>
                    )}
                    {card.Body_Text && (
                        <Text style={styles.bodyText}>{card.Body_Text}</Text>
                    )}
                    {card.Flavor_Text && (
                        <Text style={styles.flavorText}>{card.Flavor_Text}</Text>
                    )}
                    {priceData?.tcgplayer_id && (
                        <View style={styles.purchaseSection}>
                            <Text style={styles.sectionHeader}>Purchase</Text>
                            <TouchableOpacity
                                style={styles.tcgPlayerButton}
                                onPress={openTCGPlayer}
                            >
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
    const [cardPrices, setCardPrices] = useState<Map<string, { usd: string | null; usd_foil: string | null; tcgplayer_id?: number }>>(new Map());
    const [loadingPrices, setLoadingPrices] = useState<Set<string>>(new Set());

    // Memoize the card data to prevent re-renders when the reference hasn't changed
    const memoizedCards = useMemo(() => cards, [
        cards.length,
        cards.map(card => card.Unique_ID || `${card.Name}-${card.Set_Num}-${card.Card_Num}`).join(',')
    ]);

    useEffect(() => {
        const fetchAllPrices = async () => {
            const newPrices = new Map(cardPrices);
            const updatedLoadingPrices = new Set(loadingPrices);
            let pricesChanged = false;

            for (const card of memoizedCards) {
                const cardId = card.Unique_ID || `${card.Name}-${card.Set_Num}-${card.Card_Num}`;
                if (!cardId || newPrices.has(cardId) || updatedLoadingPrices.has(cardId)) {
                    continue;
                }

                // Skip if card already has prices from props
                if (card.price_usd || card.price_usd_foil) {
                    const tcgId = ('prices' in card && card.prices && typeof card.prices.tcgplayer_id === 'number') 
                                  ? card.prices.tcgplayer_id 
                                  : undefined;
                    newPrices.set(cardId, {
                        usd: card.price_usd ?? null,
                        usd_foil: card.price_usd_foil ?? null,
                        tcgplayer_id: tcgId
                    });
                    pricesChanged = true;
                    continue;
                }
                
                const isMTGCard = 'name' in card && !('Name' in card);
                const isMissingEssentials = !card.Name || (
                    !card.Unique_ID && 
                    (!card.Card_Num || !card.Set_Num || !card.Rarity)
                );

                if (isMTGCard || isMissingEssentials) {
                    if (__DEV__) {
                        console.log(`[LorcanaCardListEffect] Skipping price fetch for ${isMTGCard ? 'MTG' : 'incomplete'} card:`, 
                            card.Name || (card as any).name || 'Unknown');
                    }
                    newPrices.set(cardId, { usd: null, usd_foil: null, tcgplayer_id: undefined });
                    pricesChanged = true;
                    continue;
                }

                updatedLoadingPrices.add(cardId);
                setLoadingPrices(new Set(updatedLoadingPrices)); // Immediate feedback for loading state

                try {
                    if (__DEV__) {
                         debugCardData(card, 'LorcanaCardListEffect fetchAllPrices');
                    }
                    const priceData = await getLorcanaCardPrice({
                        Name: card.Name || '',
                        Set_Num: card.Set_Num,
                        Card_Num: card.Card_Num,
                        Rarity: card.Rarity,
                        Unique_ID: card.Unique_ID || ''
                    });
                    newPrices.set(cardId, {
                        usd: priceData.usd,
                        usd_foil: priceData.usd_foil,
                        tcgplayer_id: priceData.tcgplayer_id
                    });
                    pricesChanged = true;
                } catch (error) {
                    console.error(`[LorcanaCardListEffect] Error fetching price for ${card.Name}:`, error);
                    newPrices.set(cardId, { usd: null, usd_foil: null, tcgplayer_id: undefined }); // Set error state or default
                    pricesChanged = true;
                } finally {
                    updatedLoadingPrices.delete(cardId);
                }
            }

            if (pricesChanged) {
                setCardPrices(newPrices);
            }
            setLoadingPrices(updatedLoadingPrices);
        };

        if (memoizedCards.length > 0) {
            fetchAllPrices();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memoizedCards]); // cardPrices and loadingPrices are managed internally by this effect


    if (isLoading && memoizedCards.length === 0) { // Show main loader only if cards are also loading
        return <ActivityIndicator style={styles.loader} size="large" color="#2196F3" />;
    }
    
    // console.log('[LorcanaCardList] Rendering with cards:', memoizedCards.length, 'prices:', cardPrices.size, 'loading:', loadingPrices.size);


    return (
        <FlatList
            data={memoizedCards}
            renderItem={({ item }) => {
                const cardId = item.Unique_ID || `${item.Name}-${item.Set_Num}-${item.Card_Num}`;
                const priceDataItem = cardPrices.get(cardId);
                const isPriceItemLoading = loadingPrices.has(cardId);
                // console.log(`[LorcanaCardList RenderItem] Card: ${item.Name}, Price Data:`, priceDataItem, `Loading: ${isPriceItemLoading}`);

                return (
                    <LorcanaCardItem
                        card={item}
                        onPress={() => onCardPress?.(item)}
                        onAddToCollection={onAddToCollection}
                        onDelete={onDeleteCard}
                        priceData={priceDataItem}
                        isPriceLoading={isPriceItemLoading}
                    />
                );
            }}
            keyExtractor={(item) => {
                return item.Unique_ID?.toString() || 
                       `${item.Name}-${item.Card_Num}-${item.Set_Num}-${Math.random()}`; // Fallback for more uniqueness
            }}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={10} // Increased windowSize
            removeClippedSubviews={true}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={ // Added ListEmptyComponent
                !isLoading ? (
                    <View style={styles.emptyListContainer}>
                        <Text style={styles.emptyListText}>No Lorcana cards found.</Text>
                    </View>
                ) : null // Don't show empty text if main isLoading is true
            }
        />
    );
};

const styles = StyleSheet.create({
    listContainer: {
        padding: 8,
    },
    loader: {
        marginVertical: 20,
    },
    cardItem: {
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    titleContainer: {
        flex: 1,
    },
    cardName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    setName: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    addButton: {
        padding: 4,
    },
    cardDetails: {
        marginTop: 8,
    },
    statsContainer: {
        marginBottom: 8,
    },
    cardType: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    cardStats: {
        fontSize: 14,
        color: '#333',
    },
    classifications: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    priceContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    price: {
        fontSize: 14,
        color: '#333',
        backgroundColor: '#f5f5f5',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    expandedContent: {
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 12,
    },
    imageContainer: {
        width: '100%',
        height: 300,
        marginBottom: 12,
        borderRadius: 8,
        overflow: 'hidden',
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    bodyText: {
        fontSize: 14,
        color: '#333',
        marginBottom: 8,
        lineHeight: 20,
    },
    flavorText: {
        fontSize: 14,
        color: '#666',
        fontStyle: 'italic',
        marginTop: 8,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    tcgButton: {
        padding: 4,
    },
    purchaseSection: {
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 12,
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    tcgPlayerButton: {
        backgroundColor: '#4CAF50',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        borderRadius: 8,
        gap: 8,
    },
    tcgPlayerButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    actionButton: {
        padding: 4,
    },
    placeholderImage: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#e0e0e0', // Added background for placeholder
    },
    placeholderText: {
        color: '#666',
        fontSize: 14,
        marginTop: 8,
    },
    retryButton: {
        paddingHorizontal: 12, // Made retry button larger
        paddingVertical: 8,
        backgroundColor: '#2196F3',
        borderRadius: 4,
        marginTop: 8, // Added margin
    },
    retryText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    emptyListContainer: { // Styles for empty list
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyListText: { // Styles for empty list text
        fontSize: 16,
        color: '#666',
    },
});

export default LorcanaCardList; 