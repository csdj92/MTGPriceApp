import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { ExtendedCard } from '../../services/ScryfallService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

type CardDetailsScreenProps = NativeStackScreenProps<RootStackParamList, 'CardDetails'>;

const CardDetailsScreen: React.FC<CardDetailsScreenProps> = ({ route, navigation }) => {
    const { card } = route.params;

    const openPurchaseLink = async (url: string | undefined) => {
        if (!url) {
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
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Icon name="arrow-left" size={24} color="#666" />
                </TouchableOpacity>
                <Text style={styles.title}>{card.name}</Text>
            </View>

            {card.imageUrl && (
                <Image
                    source={{ uri: card.imageUrl }}
                    style={styles.cardImage}
                    resizeMode="contain"
                />
            )}

            <View style={styles.detailsContainer}>
                <Text style={styles.setInfo}>
                    {card.setName} ({card.setCode.toUpperCase()})
                </Text>

                <View style={styles.priceContainer}>
                    <Text style={styles.sectionTitle}>Prices</Text>
                    {card.prices?.usd && (
                        <Text style={styles.price}>USD: ${card.prices.usd}</Text>
                    )}
                    {card.prices?.eur && (
                        <Text style={styles.price}>EUR: €{card.prices.eur}</Text>
                    )}
                    {card.prices?.tix && (
                        <Text style={styles.price}>MTGO: {card.prices.tix} tix</Text>
                    )}
                </View>

                <View style={styles.purchaseContainer}>
                    <Text style={styles.sectionTitle}>Purchase Options</Text>
                    {card.purchaseUrls?.tcgplayer && (
                        <TouchableOpacity
                            style={styles.purchaseButton}
                            onPress={() => openPurchaseLink(card.purchaseUrls.tcgplayer)}
                        >
                            <Text style={styles.purchaseButtonText}>Buy on TCGPlayer</Text>
                        </TouchableOpacity>
                    )}
                    {card.purchaseUrls?.cardmarket && (
                        <TouchableOpacity
                            style={styles.purchaseButton}
                            onPress={() => openPurchaseLink(card.purchaseUrls.cardmarket)}
                        >
                            <Text style={styles.purchaseButtonText}>Buy on Cardmarket</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.legalitiesContainer}>
                    <Text style={styles.sectionTitle}>Format Legalities</Text>
                    {Object.entries(card.legalities || {}).map(([format, legality]) => (
                        <View key={format} style={styles.legalityRow}>
                            <Text style={styles.formatName}>{format}:</Text>
                            <Text style={[
                                styles.legality,
                                { color: legality === 'legal' ? '#4CAF50' : '#f44336' }
                            ]}>
                                {legality}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    backButton: {
        marginRight: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        flex: 1,
    },
    cardImage: {
        width: '100%',
        height: 400,
        marginVertical: 16,
    },
    detailsContainer: {
        padding: 16,
    },
    setInfo: {
        fontSize: 16,
        color: '#666',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    priceContainer: {
        marginBottom: 24,
    },
    price: {
        fontSize: 16,
        marginBottom: 4,
    },
    purchaseContainer: {
        marginBottom: 24,
    },
    purchaseButton: {
        backgroundColor: '#2196F3',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    purchaseButtonText: {
        color: 'white',
        fontSize: 16,
        textAlign: 'center',
        fontWeight: '500',
    },
    legalitiesContainer: {
        marginBottom: 24,
    },
    legalityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    formatName: {
        fontSize: 16,
        textTransform: 'capitalize',
    },
    legality: {
        fontSize: 16,
        fontWeight: '500',
    },
});

export default CardDetailsScreen; 