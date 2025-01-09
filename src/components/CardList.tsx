import React from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    Text,
    ListRenderItemInfo,
} from 'react-native';
import CardItem from './CardItem';
import type { ExtendedCard } from '../types/card';

interface CardListProps {
    cards: ExtendedCard[];
    isLoading: boolean;
    onCardPress?: (card: ExtendedCard) => void;
    onAddToCollection?: (card: ExtendedCard) => void;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    ListFooterComponent?: React.ReactElement | null;
}

const CardList: React.FC<CardListProps> = ({
    cards,
    isLoading,
    onCardPress,
    onAddToCollection,
    onEndReached,
    onEndReachedThreshold = 0.5,
    ListFooterComponent
}) => {
    const renderItem = ({ item }: ListRenderItemInfo<ExtendedCard>) => (
        <CardItem
            card={item}
            onPress={() => onCardPress?.(item)}
            onAddToCollection={() => onAddToCollection?.(item)}
        />
    );

    if (isLoading && cards.length === 0) {
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
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            onEndReached={onEndReached}
            onEndReachedThreshold={onEndReachedThreshold}
            ListFooterComponent={ListFooterComponent}
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
});

export default CardList; 