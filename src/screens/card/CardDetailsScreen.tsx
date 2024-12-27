import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { ExtendedCard, scryfallService } from '../../services/ScryfallService';
import CardList from '../../components/CardList';

type RootStackParamList = {
    CardDetails: { cardId: string };
};

type CardDetailsScreenRouteProp = RouteProp<RootStackParamList, 'CardDetails'>;

const CardDetailsScreen = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [cardDetails, setCardDetails] = useState<ExtendedCard | null>(null);
    const route = useRoute<CardDetailsScreenRouteProp>();

    useEffect(() => {
        loadCard();
    }, [route.params?.cardId]);

    const loadCard = async () => {
        if (!route.params?.cardId) return;

        setIsLoading(true);
        try {
            console.log(`[CardDetailsScreen] Loading card details for ID: ${route.params.cardId}`);
            const card = await scryfallService.getCardById(route.params.cardId);
            if (card) {
                console.log('[CardDetailsScreen] Card details loaded:', card);
                setCardDetails(card);
            } else {
                console.error('[CardDetailsScreen] Card not found');
                Alert.alert('Error', 'Card not found');
            }
        } catch (error) {
            console.error('[CardDetailsScreen] Error loading card details:', error);
            Alert.alert('Error', 'Failed to load card details');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading card details...</Text>
            </View>
        );
    }

    if (!cardDetails) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>No card details available</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <CardList cards={[cardDetails]} isLoading={false} />
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
        color: '#666',
        textAlign: 'center',
    },
});

export default CardDetailsScreen; 