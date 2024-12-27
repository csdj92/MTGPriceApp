import React from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import type { Card } from '../services/DatabaseService';

interface CardListProps {
    cards: Card[];
    isLoading: boolean;
}

const CardItem = ({ card }: { card: Card }) => (
    <TouchableOpacity style={styles.card}>
        <View style={styles.cardHeader}>
            <Text style={styles.cardName}>{card.name}</Text>
            <Text style={styles.manaCost}>{card.manaCost || ''}</Text>
        </View>
        <View style={styles.cardDetails}>
            <Text style={styles.setCode}>Set: {card.setCode}</Text>
            <Text style={[styles.rarity, styles[card.rarity.toLowerCase() as keyof typeof styles]]}>
                {card.rarity}
            </Text>
        </View>
        <Text style={styles.type}>{card.type}</Text>
        {card.text && <Text style={styles.text}>{card.text}</Text>}
    </TouchableOpacity>
);

const CardList = ({ cards, isLoading }: CardListProps) => {
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading cards...</Text>
            </View>
        );
    }

    return (
        <FlatList
            data={cards}
            renderItem={({ item }) => <CardItem card={item} />}
            keyExtractor={item => item.uuid}
            contentContainerStyle={styles.listContainer}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
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
        marginTop: 8,
        fontSize: 16,
        color: '#666',
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
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardName: {
        fontSize: 18,
        fontWeight: 'bold',
        flex: 1,
    },
    manaCost: {
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 8,
    },
    cardDetails: {
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
    common: {
        color: '#666',
    },
    uncommon: {
        color: '#607D8B',
    },
    rare: {
        color: '#FFD700',
    },
    mythic: {
        color: '#FF4500',
    },
    type: {
        fontSize: 14,
        color: '#444',
        marginBottom: 8,
    },
    text: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    separator: {
        height: 12,
    },
});

export default CardList; 