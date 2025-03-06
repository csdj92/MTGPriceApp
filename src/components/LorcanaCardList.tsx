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

const PriceDisplay = ({ card }: { card: LorcanaCardType }) => {
    const [prices, setPrices] = useState<{ 
        usd: string | null; 
        usd_foil: string | null;
    }>({ 
        usd: card.price_usd || null,
        usd_foil: card.price_usd_foil || null
    });
    const [isLoadingPrices, setIsLoadingPrices] = useState(false);

    useEffect(() => {
        const fetchPrices = async () => {
            if (!card.price_usd && !card.price_usd_foil) {
                setIsLoadingPrices(true);
                try {
                    // Debug card data integrity
                    debugCardData(card, 'PriceDisplay fetchPrices');
                    
                    const priceData = await getLorcanaCardPrice({
                        Name: card.Name || '',
                        Set_Num: card.Set_Num,
                        Card_Num: card.Card_Num,
                        Rarity: card.Rarity,
                        Unique_ID: card.Unique_ID || ''
                    });
                    setPrices({
                        usd: priceData.usd,
                        usd_foil: priceData.usd_foil
                    });
                } catch (error) {
                    console.error('[PriceDisplay] Error fetching price data:', error);
                } finally {
                    setIsLoadingPrices(false);
                }
            }
        };
        
        fetchPrices();
    }, [card]);

    if (isLoadingPrices) {
        return (
            <View style={styles.priceContainer}>
                <ActivityIndicator size="small" color="#666" />
            </View>
        );
    }

    return (
        <View style={styles.priceContainer}>
            {prices.usd && (
                <Text style={styles.price}>USD: ${Number(prices.usd).toFixed(2)}</Text>
            )}
            {prices.usd_foil && (
                <Text style={styles.price}>Foil: ${Number(prices.usd_foil).toFixed(2)}</Text>
            )}
            {(!prices.usd && !prices.usd_foil) && (
                <Text style={[styles.price, { color: '#666' }]}>No price data available</Text>
            )}
        </View>
    );
};

// Memoize the LorcanaCardItem component to prevent unnecessary re-renders
const LorcanaCardItem = React.memo(({ card, onPress, onAddToCollection, onDelete }: { 
    card: LorcanaCardType; 
    onPress?: () => void;
    onAddToCollection?: (card: LorcanaCardType) => void;
    onDelete?: (card: LorcanaCardType) => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [prices, setPrices] = useState<{ 
        usd: string | null; 
        usd_foil: string | null;
        tcgplayer_id?: number;
    }>({ usd: null, usd_foil: null });
    const [isLoadingPrices, setIsLoadingPrices] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    // Safe access to properties with nullish coalescing
    const cardName = card.Name || 'Unknown Card';
    const cardUniqueId = card.Unique_ID;
    const cardSet = card.Set_Name || 'Unknown Set';
    
    // Check if image was already loaded
    const imageUrl = card.Image || '';
    const isImageAlreadyLoaded = loadedImages.has(imageUrl);

    // Only log image loading the first time
    const logImageLoading = (url: string) => {
        if (!loadedImages.has(url) && url) {
            loadedImages.add(url);
        }
    };

    const openTCGPlayer = () => {
        if (prices.tcgplayer_id) {
            Linking.openURL(`https://www.tcgplayer.com/product/${prices.tcgplayer_id}`);
        }
    };

    useEffect(() => {
        const fetchPrices = async () => {
            if (card.price_usd || card.price_usd_foil) {
                setPrices({
                    usd: card.price_usd ?? null,
                    usd_foil: card.price_usd_foil ?? null
                });
                return;
            }
            
            setIsLoadingPrices(true);
            try {
                // Debug card data integrity
                debugCardData(card, 'LorcanaCardItem fetchPrices');
                
                const priceData = await getLorcanaCardPrice({
                    Name: cardName,
                    Set_Num: typeof cardSet === 'number' ? cardSet : undefined,
                    Card_Num: card.Card_Num,
                    Rarity: card.Rarity,
                    Unique_ID: cardUniqueId
                });
                setPrices({
                    ...priceData,
                    tcgplayer_id: priceData.tcgplayer_id
                });
            } catch (error) {
                console.error('Error fetching price for card:', error);
            } finally {
                setIsLoadingPrices(false);
            }
        };

        fetchPrices();
    }, [cardName, cardSet, card.Card_Num, card.Rarity, cardUniqueId]);

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
                    {isLoadingPrices ? (
                        <ActivityIndicator size="small" color="#666" />
                    ) : (
                        <>
                            {prices.usd && (
                                <Text style={styles.price}>USD: ${Number(prices.usd).toFixed(2)}</Text>
                            )}
                            {prices.usd_foil && (
                                <Text style={styles.price}>Foil: ${Number(prices.usd_foil).toFixed(2)}</Text>
                            )}
                            {(!prices.usd && !prices.usd_foil) && (
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
                    {prices.tcgplayer_id && (
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
    // Memoize the card data to prevent re-renders when the reference hasn't changed
    const memoizedCards = useMemo(() => cards, [
        // Only update when the array length changes or IDs change
        cards.length,
        // Use a stable string representation of card IDs for comparison
        cards.map(card => card.Unique_ID).join(',')
    ]);

    if (isLoading) {
        return <ActivityIndicator style={styles.loader} size="large" color="#2196F3" />;
    }

    return (
        <FlatList
            data={memoizedCards}
            renderItem={({ item }) => (
                <LorcanaCardItem
                    card={item}
                    onPress={() => onCardPress?.(item)}
                    onAddToCollection={onAddToCollection}
                    onDelete={onDeleteCard}
                />
            )}
            keyExtractor={(item) => {
                // Create a stable, unique key for each card
                return item.Unique_ID?.toString() || 
                       `${item.Name}-${item.Card_Num}-${item.Set_Num}`;
            }}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            removeClippedSubviews={true}
            contentContainerStyle={styles.listContainer}
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
    },
    placeholderText: {
        color: '#666',
        fontSize: 14,
        marginTop: 8,
    },
    retryButton: {
        padding: 8,
        backgroundColor: '#2196F3',
        borderRadius: 4,
    },
    retryText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default LorcanaCardList; 