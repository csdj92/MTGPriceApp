import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Image,
    TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { scryfallService } from '../services/ScryfallService';
import type { ExtendedCard } from '../types/card';
import { RootStackParamList } from '../navigation/AppNavigator';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface CardDetailScreenProps {
    route: RouteProp<RootStackParamList, 'CardDetails'>;
    navigation: any;
}

const CardDetailsScreen: React.FC<CardDetailScreenProps> = ({ route }) => {
    const { card, onClose } = route.params;
    const [cardData, setCardData] = useState<ExtendedCard | null>(card);
    const [isLoading, setIsLoading] = useState(true);
    const navigation = useNavigation();
    const cardId = route.params.card.id;
    const [showBackFace, setShowBackFace] = useState(false);

    useEffect(() => {
        const loadCard = async () => {
            try {
                const cardData = await scryfallService.getCardById(cardId);
                setCardData(cardData);
                navigation.setOptions({ title: cardData.name });
            } catch (error) {
                console.error('Error loading card:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadCard();
    }, [cardId, navigation]);

    const toggleCardFace = () => {
        setShowBackFace(prev => !prev);
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading card details...</Text>
            </View>
        );
    }

    if (!cardData) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Failed to load card details</Text>
            </View>
        );
    }

    const isDoubleSided = cardData.card_faces && cardData.card_faces.length === 2;
    const imageToShow = showBackFace && isDoubleSided && cardData.card_faces?.[1]?.image_uris?.normal 
        ? cardData.card_faces[1].image_uris.normal 
        : (showBackFace && isDoubleSided 
            ? `https://api.scryfall.com/cards/${cardData.setCode.toLowerCase()}/${cardData.collectorNumber}?format=image&face=back`
            : (cardData.imageUris?.normal || `https://api.scryfall.com/cards/${cardData.setCode.toLowerCase()}/${cardData.collectorNumber}?format=image`)
        );

    return (
        <ScrollView style={styles.container}>
            <Image
                source={{ uri: imageToShow }}
                style={styles.cardImage}
                resizeMode="contain"
            />
            
            <View style={styles.detailsContainer}>
                <Text style={styles.name}>{cardData.name}</Text>
                <Text style={styles.type}>{cardData.type}</Text>
                {cardData.manaCost && (
                    <Text style={styles.manaCost}>Mana Cost: {cardData.manaCost}</Text>
                )}
                {cardData.text && <Text style={styles.text}>{cardData.text}</Text>}
                <View style={styles.infoRow}>
                    <Text style={styles.setCode}>Set: {cardData.setCode}</Text>
                    <Text style={styles.rarity}>{cardData.rarity}</Text>
                </View>
                {cardData.prices?.usd !== undefined && (
                    <Text style={styles.price}>
                        Price: ${Number(cardData.prices.usd).toFixed(2)}
                    </Text>
                )}
            </View>
            {isDoubleSided && (
                <TouchableOpacity style={styles.flipButton} onPress={toggleCardFace}>
                    <Text style={styles.flipButtonIcon}>⟲</Text>
                    <Text style={styles.flipButtonText}>Flip Card</Text>
                </TouchableOpacity>
            )}
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
    flipButton: {
        backgroundColor: '#2196F3',
        padding: 10,
        borderRadius: 5,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 10,
    },
    flipButtonIcon: {
        color: '#fff',
        fontSize: 16,
        marginRight: 10,
    },
    flipButtonText: {
        color: '#fff',
        fontSize: 16,
    },
});

export default CardDetailsScreen;
