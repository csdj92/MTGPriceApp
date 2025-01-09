import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { ExtendedCard } from '../types/card';

interface CardItemProps {
    card: ExtendedCard;
    onPress?: () => void;
    onAddToCollection?: () => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onPress, onAddToCollection }) => (
    <TouchableOpacity
        style={[styles.cardItem, card.isExpanded && styles.cardItemExpanded]}
        onPress={onPress}
        activeOpacity={0.9}
    >
        <View style={styles.cardMainInfo}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{card.name}</Text>
            </View>

            <View style={styles.cardDetails}>
                <View style={styles.setInfoContainer}>
                    <Text style={styles.setInfo}>
                        {card.setName} ({card.setCode})
                    </Text>
                    <Text style={[
                        styles.rarity,
                        styles[((card.rarity || 'common').toLowerCase()) as keyof typeof styles]
                    ]}>
                        • {card.rarity}
                    </Text>
                    {card.collectorNumber && (
                        <Text style={styles.collectorNumber}>• #{card.collectorNumber}</Text>
                    )}
                </View>
            </View>

            {card.isExpanded && (
                <>
                    {card.imageUris?.normal && (
                        <Image
                            source={{ uri: card.imageUris.normal }}
                            style={styles.cardImage}
                            resizeMode="contain"
                        />
                    )}
                    <Text style={styles.cardType}>{card.type}</Text>
                    {card.text && (
                        <View style={styles.cardTextContainer}>
                            <Text style={styles.cardText}>{card.text}</Text>
                        </View>
                    )}
                    <View style={styles.cardFooter}>
                        <View style={styles.priceSection}>
                            <Text style={styles.sectionTitle}>Prices</Text>
                            <View style={styles.priceContainer}>
                                {card.prices?.usd && (
                                    <Text style={styles.price}>
                                        USD: ${Number(card.prices.usd).toFixed(2)}
                                    </Text>
                                )}
                                {card.prices?.usdFoil && (
                                    <Text style={styles.price}>
                                        Foil: ${Number(card.prices.usdFoil).toFixed(2)}
                                    </Text>
                                )}
                            </View>
                        </View>

                        {onAddToCollection && (
                            <TouchableOpacity
                                style={styles.addToCollectionButton}
                                onPress={onAddToCollection}
                                activeOpacity={0.9}
                            >
                                <Icon name="playlist-plus" size={20} color="white" />
                                <Text style={styles.addToCollectionText}>Add to Collection</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </>
            )}
        </View>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    cardItem: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        marginBottom: 12,
    },
    cardItemExpanded: {
        padding: 16,
        elevation: 3,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    cardMainInfo: {
        flex: 1,
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
        marginBottom: 4,
    },
    cardName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        flex: 1,
        marginRight: 8,
    },
    setInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    setInfo: {
        fontSize: 13,
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
});

export default CardItem; 