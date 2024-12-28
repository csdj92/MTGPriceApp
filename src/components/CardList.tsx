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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { ExtendedCard } from '../services/ScryfallService';

interface CardListProps {
    cards: ExtendedCard[];
    isLoading: boolean;
    onCardPress?: (card: ExtendedCard) => void;
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
    <TouchableOpacity style={styles.card} onPress={onPress}>
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

const CardList: React.FC<CardListProps> = ({ cards, isLoading, onCardPress }) => {
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
            <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.setInfo}>
                    {item.setCode} ({item.setName})
                </Text>
            </View>
            <View style={styles.cardDetails}>
                <Text style={styles.cardType}>{item.type}</Text>
                {item.manaCost && (
                    <Text style={styles.manaCost}>{item.manaCost}</Text>
                )}
            </View>
            <PriceDisplay prices={item.prices} />
            <PurchaseLinks urls={item.purchaseUrls} />
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
                    <Text style={styles.emptyText}>No cards found</Text>
                </View>
            }
        />
    );
};

const styles = StyleSheet.create({
    listContainer: {
        padding: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    cardItem: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        flex: 1,
    },
    setInfo: {
        fontSize: 14,
        color: '#666',
        marginLeft: 8,
    },
    cardDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardType: {
        fontSize: 14,
        color: '#666',
    },
    manaCost: {
        fontSize: 14,
        color: '#666',
    },
    priceContainer: {
        marginTop: 8,
    },
    price: {
        fontSize: 14,
        color: '#333',
        marginBottom: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
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
    type: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    text: {
        fontSize: 14,
        color: '#333',
        marginBottom: 8,
    },
    purchaseLinksContainer: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    purchaseButton: {
        backgroundColor: '#4CAF50',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    purchaseButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '500',
    },
    legalitiesContainer: {
        marginTop: 8,
    },
    legalitiesButton: {
        backgroundColor: '#F5F5F5',
        padding: 8,
        borderRadius: 4,
    },
    legalitiesButtonText: {
        fontSize: 14,
        color: '#666',
    },
    legalitiesList: {
        marginTop: 8,
        backgroundColor: '#FFFFFF',
        borderRadius: 4,
        padding: 8,
    },
    legalityItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    formatName: {
        fontSize: 14,
        color: '#666',
    },
    legalityStatus: {
        fontSize: 14,
        fontWeight: '500',
    },
    separator: {
        height: 16,
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
});

export default CardList; 