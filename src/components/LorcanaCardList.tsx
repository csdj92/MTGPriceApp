import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Image,
    Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getLorcanaCardPrice } from '../services/LorcanaService';
import type { LorcanaCard } from '../types/lorcana';

interface LorcanaCardListProps {
    cards: LorcanaCard[];
    isLoading: boolean;
    onCardPress?: (card: LorcanaCard) => void;
    onAddToCollection?: (card: LorcanaCard) => void;
    onDeleteCard?: (card: LorcanaCard) => void;
}

const PriceDisplay = ({ card }: { card: LorcanaCard }) => (
    <View style={styles.priceContainer}>
        {card.price_usd && (
            <Text style={styles.price}>USD: ${Number(card.price_usd).toFixed(2)}</Text>
        )}
        {card.price_usd_foil && (
            <Text style={styles.price}>Foil: ${Number(card.price_usd_foil).toFixed(2)}</Text>
        )}
        {(!card.price_usd && !card.price_usd_foil) && (
            <Text style={[styles.price, { color: '#666' }]}>No price data available</Text>
        )}
    </View>
);

const LorcanaCardItem = ({ card, onPress, onAddToCollection, onDelete }: { 
    card: LorcanaCard; 
    onPress?: () => void;
    onAddToCollection?: (card: LorcanaCard) => void;
    onDelete?: (card: LorcanaCard) => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [prices, setPrices] = useState<{ 
        usd: string | null; 
        usd_foil: string | null;
        tcgplayer_id?: number;
    }>({ usd: null, usd_foil: null });
    const [isLoadingPrices, setIsLoadingPrices] = useState(false);

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
                const priceData = await getLorcanaCardPrice({
                    Name: card.Name,
                    Set_Num: card.Set_Num,
                    Rarity: card.Rarity
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
    }, [card.Name, card.Set_ID, card.Rarity, card.price_usd, card.price_usd_foil]);

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
                    <Text style={styles.cardName}>{card.Name}</Text>
                    <Text style={styles.setName}>{card.Set_Name}</Text>
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
                    {card.Image && (
                        <Image
                            source={{ uri: card.Image }}
                            style={styles.cardImage}
                            resizeMode="contain"
                        />
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
};

const LorcanaCardList: React.FC<LorcanaCardListProps> = ({
    cards,
    isLoading,
    onCardPress,
    onAddToCollection,
    onDeleteCard,
}) => {
    if (isLoading) {
        return <ActivityIndicator style={styles.loader} size="large" color="#2196F3" />;
    }

    return (
        <FlatList
            data={cards}
            renderItem={({ item }) => (
                <LorcanaCardItem
                    card={item}
                    onPress={() => onCardPress?.(item)}
                    onAddToCollection={onAddToCollection}
                    onDelete={onDeleteCard}
                />
            )}
            keyExtractor={(item) => item.Unique_ID}
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
    cardImage: {
        width: '100%',
        height: 300,
        marginBottom: 12,
        borderRadius: 8,
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
});

export default LorcanaCardList; 