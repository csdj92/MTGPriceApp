import React from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import type { Card } from '../services/DatabaseService';

interface CardListProps {
    cards: Card[];
    isLoading: boolean;
}

const CardList: React.FC<CardListProps> = ({ cards, isLoading }) => {
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3498db" />
            </View>
        );
    }

    const renderCard = ({ item }: { item: Card }) => (
        <View style={styles.card}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.setName}>{item.set_name}</Text>
            <Text style={styles.price}>${item.price?.toFixed(2) || 'N/A'}</Text>
        </View>
    );

    return (
        <FlatList
            data={cards}
            renderItem={renderCard}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.listContainer}
        />
    );
};

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContainer: {
        padding: 16,
    },
    card: {
        backgroundColor: 'white',
        padding: 16,
        marginBottom: 12,
        borderRadius: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.22,
        shadowRadius: 2.22,
    },
    cardName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    setName: {
        fontSize: 14,
        color: '#7f8c8d',
        marginTop: 4,
    },
    price: {
        fontSize: 16,
        color: '#27ae60',
        fontWeight: '600',
        marginTop: 8,
    },
});

export default CardList; 