import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Text,
    ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { databaseService } from '../../services/DatabaseService';
import type { Collection } from '../../services/DatabaseService';
import type { ExtendedCard } from '../../types/card';
import CardList from '../../components/CardList';

type CollectionDetailsScreenProps = NativeStackScreenProps<RootStackParamList, 'CollectionDetails'>;

const CollectionDetailsScreen: React.FC<CollectionDetailsScreenProps> = ({ route, navigation }) => {
    const { collectionId } = route.params;
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [collection, setCollection] = useState<Collection | null>(null);
    const [cards, setCards] = useState<ExtendedCard[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        loadCollection();
    }, [collectionId]);

    const loadCollection = async () => {
        setIsLoading(true);
        try {
            const [collectionData, collectionCards] = await Promise.all([
                databaseService.getCollections().then(collections =>
                    collections.find(c => c.id === collectionId)
                ),
                databaseService.getCollectionCards(collectionId, 1)
            ]);

            if (collectionData) {
                setCollection(collectionData);
                navigation.setOptions({ title: collectionData.name });
            }
            setCards(collectionCards);
            setHasMore(collectionCards.length > 0);
            setCurrentPage(1);
        } catch (error) {
            console.error('Error loading collection details:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadMoreCards = async () => {
        if (isLoadingMore || !hasMore) return;

        setIsLoadingMore(true);
        try {
            const nextPage = currentPage + 1;
            const moreCards = await databaseService.getCollectionCards(collectionId, nextPage);

            if (moreCards.length === 0) {
                setHasMore(false);
            } else {
                setCards(prev => [...prev, ...moreCards]);
                setCurrentPage(nextPage);
            }
        } catch (error) {
            console.error('Error loading more cards:', error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleCardPress = (card: ExtendedCard) => {
        navigation.navigate('CardDetails', { card });
    };

    const renderFooter = () => {
        if (!isLoadingMore) return null;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#2196F3" />
            </View>
        );
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading collection...</Text>
            </View>
        );
    }

    if (!collection) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Collection not found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.statsText}>
                    {cards.length} cards · ${collection.totalValue.toFixed(2)}
                </Text>
            </View>
            <CardList
                cards={cards}
                isLoading={isLoading}
                onCardPress={handleCardPress}
                onEndReached={loadMoreCards}
                onEndReachedThreshold={0.5}
                ListFooterComponent={renderFooter}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    statsText: {
        fontSize: 16,
        color: '#666',
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
    footerLoader: {
        paddingVertical: 16,
        alignItems: 'center',
    },
});

export default CollectionDetailsScreen; 