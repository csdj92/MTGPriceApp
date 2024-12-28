import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Image,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { scryfallService } from '../services/ScryfallService';
import type { ExtendedCard } from '../types/card';

const CardDetailsScreen = () => {
    const [card, setCard] = useState<ExtendedCard | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const route = useRoute();
    const navigation = useNavigation();
    const cardId = (route.params as { cardId: string })?.cardId;

    useEffect(() => {
        const loadCard = async () => {
            try {
                const cardData = await scryfallService.getCardById(cardId);
                setCard(cardData);
                navigation.setOptions({ title: cardData.name });
            } catch (error) {
                console.error('Error loading card:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadCard();
    }, [cardId, navigation]);

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading card details...</Text>
            </View>
        );
    }

    if (!card) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Failed to load card details</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            {card.imageUrl && (
                <Image
                    source={{ uri: card.imageUrl }}
                    style={styles.cardImage}
                    resizeMode="contain"
                />
            )}
            <View style={styles.detailsContainer}>
                <Text style={styles.name}>{card.name}</Text>
                <Text style={styles.type}>{card.type}</Text>
                {card.manaCost && (
                    <Text style={styles.manaCost}>Mana Cost: {card.manaCost}</Text>
                )}
                {card.text && <Text style={styles.text}>{card.text}</Text>}
                <View style={styles.infoRow}>
                    <Text style={styles.setCode}>Set: {card.setCode}</Text>
                    <Text style={styles.rarity}>{card.rarity}</Text>
                </View>
                {card.prices?.usd !== undefined && (
                    <Text style={styles.price}>
                        Price: ${Number(card.prices.usd).toFixed(2)}
                    </Text>
                )}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
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
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        fontSize: 16,
        color: '#f44336',
        textAlign: 'center',
    },
    cardImage: {
        width: '100%',
        height: 400,
        backgroundColor: '#fff',
    },
    detailsContainer: {
        padding: 16,
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    type: {
        fontSize: 16,
        color: '#666',
        marginBottom: 8,
    },
    manaCost: {
        fontSize: 16,
        color: '#444',
        marginBottom: 8,
    },
    text: {
        fontSize: 16,
        color: '#333',
        marginBottom: 16,
        lineHeight: 24,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    setCode: {
        fontSize: 14,
        color: '#666',
    },
    rarity: {
        fontSize: 14,
        fontWeight: '500',
    },
    price: {
        fontSize: 18,
        fontWeight: '600',
        color: '#4caf50',
        marginTop: 8,
    },
});

export default CardDetailsScreen;
