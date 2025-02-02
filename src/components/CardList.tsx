import React, { useState } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Linking,
    Modal,
    Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { ExtendedCard } from '../types/card';
interface CardListProps {
    cards: ExtendedCard[];
    isLoading: boolean;
    onCardPress?: (card: ExtendedCard) => void;
    onAddToCollection?: (card: ExtendedCard) => void;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    ListFooterComponent?: React.ComponentType<any> | React.ReactElement | null;
}

const PriceDisplay = ({ prices }: { prices: ExtendedCard['prices'] }) => (
    <View style={styles.priceContainer}>
        {prices?.usd !== undefined && prices?.usd !== null && (
            <Text key="usd" style={styles.price}>USD: ${Number(prices.usd).toFixed(2)}</Text>
        )}
        {prices?.usdFoil !== undefined && prices?.usdFoil !== null && (
            <Text key="usdFoil" style={styles.price}>Foil: ${Number(prices.usdFoil).toFixed(2)}</Text>
        )}
        {prices?.usdEtched !== undefined && prices?.usdEtched !== null && (
            <Text key="usdEtched" style={styles.price}>Etched: ${Number(prices.usdEtched).toFixed(2)}</Text>
        )}
        {prices?.eur !== undefined && prices?.eur !== null && (
            <Text key="eur" style={styles.price}>EUR: €{Number(prices.eur).toFixed(2)}</Text>
        )}
        {prices?.eurFoil !== undefined && prices?.eurFoil !== null && (
            <Text key="eurFoil" style={styles.price}>EUR Foil: €{Number(prices.eurFoil).toFixed(2)}</Text>
        )}
        {prices?.tix !== undefined && prices?.tix !== null && (
            <Text key="tix" style={styles.price}>MTGO: {Number(prices.tix).toFixed(2)} tix</Text>
        )}
        {(!prices || Object.values(prices).every(price => price === undefined || price === null)) && (
            <Text key="noPrices" style={[styles.price, { color: '#666' }]}>No price data available</Text>
        )}
    </View>
);

const LegalitiesDropdown = ({ legalities }: { legalities: ExtendedCard['legalities'] }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const formatNames = {
        standard: 'Standard',
        pioneer: 'Pioneer',
        modern: 'Modern',
        legacy: 'Legacy',
        vintage: 'Vintage',
        commander: 'Commander',
        pauper: 'Pauper',
    };

    return (
        <View style={styles.legalitiesContainer}>
            <TouchableOpacity
                style={styles.legalitiesButton}
                onPress={() => setIsExpanded(!isExpanded)}
            >
                <Text style={styles.legalitiesButtonText}>
                    Legalities {isExpanded ? '▼' : '▶'}
                </Text>
            </TouchableOpacity>
            {isExpanded && (
                <View style={styles.legalitiesList}>
                    {Object.entries(legalities)
                        .filter(([format]) => format in formatNames)
                        .map(([format, status]) => (
                            <View key={`legality-${format}`} style={styles.legalityItem}>
                                <Text style={styles.formatName}>
                                    {formatNames[format as keyof typeof formatNames]}:
                                </Text>
                                <Text style={[
                                    styles.legalityStatus,
                                    { color: status === 'legal' ? '#4CAF50' : '#F44336' }
                                ]}>
                                    {status === 'legal' ? 'Legal' : 'Not Legal'}
                                </Text>
                            </View>
                        ))}
                </View>
            )}
        </View>
    );
};

const PurchaseLinks = ({ urls }: { urls: ExtendedCard['purchaseUrls'] }) => {
    const handlePurchaseLink = async (url: string | undefined) => {
        console.log('Attempting to open purchase URL:', url);
        if (!url) {
            console.log('No purchase URL available');
            return;
        }

        try {
            let targetUrl = url;

            // Handle TCGPlayer affiliate links
            if (url.includes('partner.tcgplayer.com')) {
                const redirectMatch = url.match(/[?&]u=([^&]+)/);
                if (redirectMatch) {
                    targetUrl = decodeURIComponent(redirectMatch[1]);
                }
            }

            // Ensure URL has a scheme
            if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                targetUrl = 'https://' + targetUrl;
            }

            console.log('Opening URL:', targetUrl);
            await Linking.openURL(targetUrl);
        } catch (error) {
            console.error('Error opening URL:', error);
            // If all else fails, try opening a search URL
            try {
                const cardName = url.split('/').pop()?.split('?')[0] || '';
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cardName + ' mtg card price')}`;
                await Linking.openURL(searchUrl);
            } catch (fallbackError) {
                console.error('Fallback error:', fallbackError);
            }
        }
    };

    return (
        <View style={styles.purchaseLinksContainer}>
            {urls.tcgplayer && (
                <TouchableOpacity
                    key="tcgplayer"
                    style={styles.purchaseButton}
                    onPress={() => handlePurchaseLink(urls.tcgplayer)}
                >
                    <Text style={styles.purchaseButtonText}>TCGplayer</Text>
                </TouchableOpacity>
            )}
            {urls.cardmarket && (
                <TouchableOpacity
                    key="cardmarket"
                    style={styles.purchaseButton}
                    onPress={() => handlePurchaseLink(urls.cardmarket)}
                >
                    <Text style={styles.purchaseButtonText}>Cardmarket</Text>
                </TouchableOpacity>
            )}
            {urls.cardhoarder && (
                <TouchableOpacity
                    key="cardhoarder"
                    style={styles.purchaseButton}
                    onPress={() => handlePurchaseLink(urls.cardhoarder)}
                >
                    <Text style={styles.purchaseButtonText}>Cardhoarder</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const ManaSymbol = ({ symbol }: { symbol: string }) => {
    // Map mana symbols to MaterialCommunityIcons
    const getManaIcon = (symbol: string) => {
        const symbolMap: { [key: string]: { name: string; color: string } } = {
            'W': { name: 'brightness-7', color: '#F8E7B9' },  // White
            'U': { name: 'water', color: '#98C1D9' },        // Blue
            'B': { name: 'skull', color: '#444444' },        // Black
            'R': { name: 'fire', color: '#E85D4E' },         // Red
            'G': { name: 'tree', color: '#4A8753' },         // Green
            'C': { name: 'hexagon-outline', color: '#BFBFBF' }, // Colorless
        };

        // Handle numbers in mana cost
        if (!isNaN(Number(symbol))) {
            return {
                name: 'numeric-' + symbol + '-circle-outline',
                color: '#666666'
            };
        }

        return symbolMap[symbol] || { name: 'circle-outline', color: '#666666' };
    };

    const { name, color } = getManaIcon(symbol);

    return (
        <View style={styles.manaSymbol}>
            <Icon name={name} size={18} color={color} />
        </View>
    );
};

const ManaCost = ({ manaCost }: { manaCost: string }) => {
    if (!manaCost) return null;

    // Parse mana cost string into individual symbols
    const symbols = manaCost.replace(/[{}]/g, '').split('');

    return (
        <View style={styles.manaCostContainer}>
            {symbols.map((symbol, index) => (
                <ManaSymbol key={`${symbol}-${index}`} symbol={symbol} />
            ))}
        </View>
    );
};

const CardItem = ({ card, onPress }: { card: ExtendedCard; onPress?: () => void }) => (
    <TouchableOpacity style={styles.cardItem} onPress={onPress}>
        <View style={styles.cardHeader}>
            <Text style={styles.cardName}>{card.name}</Text>
            <ManaCost manaCost={card.manaCost || ''} />
        </View>
        <View style={styles.cardDetails}>
            <Text style={styles.setInfo}>
                {card.setCode} - {card.setName}
            </Text>
            <Text style={[
                styles.rarity,
                styles[((card.rarity || 'common').toLowerCase()) as keyof typeof styles]
            ]}>
                {card.rarity || 'Common'}
            </Text>
        </View>
        <Text style={styles.type}>{card.type}</Text>
        {card.text && <Text style={styles.text}>{card.text}</Text>}
        <PriceDisplay prices={card.prices} />
        <PurchaseLinks urls={card.purchaseUrls} />
        <LegalitiesDropdown legalities={card.legalities} />
    </TouchableOpacity>
);

const CardList: React.FC<CardListProps> = ({ cards, isLoading, onCardPress, onAddToCollection, onEndReached, onEndReachedThreshold, ListFooterComponent }) => {
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading cards...</Text>
            </View>
        );
    }

    const keyExtractor = (item: ExtendedCard) => {
        // Create a unique key by combining multiple identifiers
        const uniqueKey = [
            item.id,                    // Scryfall's unique print ID
            item.uuid,                  // Our database UUID
            item.setCode,               // Set code
            item.collectorNumber,       // Collector number
            item.name                   // Card name
        ].filter(Boolean).join('-');    // Join all non-null values with a dash

        return uniqueKey;
    };

    const renderItem = ({ item }: { item: ExtendedCard }) => (
        <TouchableOpacity
            style={styles.cardItem}
            onPress={() => onCardPress?.(item)}
        >
            <View style={styles.cardMainInfo}>
                <View style={styles.cardHeader}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <ManaCost manaCost={item.manaCost || ''} />
                </View>

                {item.imageUris?.normal && (
                    <Image
                        source={{ uri: item.imageUris.normal }}
                        style={styles.cardImage}
                        resizeMode="contain"
                    />
                )}

                <View style={styles.cardDetails}>
                    <View style={styles.setInfoContainer}>
                        <Text style={styles.setInfo}>
                            {item.setName} ({item.setCode})
                        </Text>
                        <Text style={[
                            styles.rarity,
                            styles[((item.rarity || 'common').toLowerCase()) as keyof typeof styles]
                        ]}>
                            • {item.rarity}
                        </Text>
                        {item.collectorNumber && (
                            <Text style={styles.collectorNumber}>• #{item.collectorNumber}</Text>
                        )}
                    </View>
                    <Text style={styles.cardType}>{item.type}</Text>
                </View>

                {item.text && (
                    <View style={styles.cardTextContainer}>
                        <Text style={styles.cardText}>{item.text}</Text>
                    </View>
                )}
            </View>

            <View style={styles.cardFooter}>
                <View style={styles.priceSection}>
                    <Text style={styles.sectionTitle}>Prices</Text>
                    <PriceDisplay prices={item.prices} />
                </View>

                <View style={styles.purchaseSection}>
                    <Text style={styles.sectionTitle}>Purchase</Text>
                    <PurchaseLinks urls={item.purchaseUrls} />
                </View>

                <TouchableOpacity
                    style={styles.addToCollectionButton}
                    onPress={() => onAddToCollection?.(item)}
                >
                    <Icon name="playlist-plus" size={20} color="white" />
                    <Text style={styles.addToCollectionText}>Add to Collection</Text>
                </TouchableOpacity>

                <View style={styles.legalitySection}>
                    <Text style={styles.sectionTitle}>Format Legality</Text>
                    <LegalitiesDropdown legalities={item.legalities} />
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <FlatList
            data={cards}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
                <View style={styles.emptyContainer}>
                    <Icon name="cards-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>No cards found</Text>
                </View>
            }
            onEndReached={onEndReached}
            onEndReachedThreshold={onEndReachedThreshold}
            ListFooterComponent={ListFooterComponent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
    );
};

const styles = StyleSheet.create({
    listContainer: {
        padding: 16,
        paddingBottom: 32,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    cardItem: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    cardMainInfo: {
        marginBottom: 16,
    },
    cardImage: {
        width: '100%',
        height: 350,
        borderRadius: 8,
        marginBottom: 12,
    },
    cardDetails: {
        marginBottom: 8,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
        flex: 1,
        marginRight: 8,
    },
    cardSubInfo: {
        marginBottom: 8,
    },
    setInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 4,
    },
    setInfo: {
        fontSize: 14,
        color: '#666',
    },
    collectorNumber: {
        fontSize: 14,
        color: '#666',
    },
    cardType: {
        fontSize: 15,
        color: '#444',
        fontStyle: 'italic',
    },
    cardTextContainer: {
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        padding: 12,
        marginTop: 8,
    },
    cardText: {
        fontSize: 14,
        color: '#333',
        lineHeight: 20,
    },
    cardFooter: {
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    priceSection: {
        marginBottom: 12,
    },
    purchaseSection: {
        marginBottom: 12,
    },
    legalitySection: {
        marginBottom: 4,
    },
    rarity: {
        fontSize: 14,
        fontWeight: '500',
    },
    common: {
        color: '#666',
    },
    uncommon: {
        color: '#607D8B',
    },
    rare: {
        color: '#FFC107',
    },
    mythic: {
        color: '#F44336',
    },
    priceContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    price: {
        fontSize: 14,
        color: '#333',
        backgroundColor: '#f0f0f0',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    purchaseLinksContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    purchaseButton: {
        backgroundColor: '#4CAF50',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    purchaseButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    legalitiesContainer: {
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        overflow: 'hidden',
    },
    legalitiesButton: {
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    legalitiesButtonText: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    legalitiesList: {
        padding: 12,
        backgroundColor: '#fff',
    },
    legalityItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    formatName: {
        fontSize: 14,
        color: '#444',
        fontWeight: '500',
    },
    legalityStatus: {
        fontSize: 14,
        fontWeight: '600',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    separator: {
        height: 12,
    },
    emptyContainer: {
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        marginTop: 16,
        textAlign: 'center',
    },
    manaCostContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    manaSymbol: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
    },
    type: {
        fontSize: 15,
        color: '#444',
        marginBottom: 8,
    },
    text: {
        fontSize: 14,
        color: '#333',
        marginBottom: 12,
    },
    addToCollectionButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 12,
    },
    addToCollectionText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
} as const);

export default CardList; 