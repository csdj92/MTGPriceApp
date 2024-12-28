import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ExtendedCard, scryfallService } from '../../services/ScryfallService';
import { databaseService } from '../../services/DatabaseService';
import CardList from '../../components/CardList';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

type CollectionScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Collection'>;
};

const CollectionScreen: React.FC<CollectionScreenProps> = ({ navigation }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [collection, setCollection] = useState<ExtendedCard[]>([]);
    const [view, setView] = useState<'grid' | 'list'>('list');
    const [sortBy, setSortBy] = useState<'name' | 'price' | 'rarity'>('name');
    const [totalValue, setTotalValue] = useState<number>(0);

    useEffect(() => {
        loadCollection();
    }, []);

    const calculateTotalValue = (cards: ExtendedCard[]) => {
        return cards.reduce((total, card) => {
            const price = card.prices?.usd ?? 0;
            return total + price;
        }, 0);
    };

    const updateTotalValue = () => {
        const newTotalValue = calculateTotalValue(collection);
        setTotalValue(newTotalValue);
    };

    const loadCollection = async () => {
        setIsLoading(true);
        try {
            // Try to get cached data first
            const cachedCards = await databaseService.getCollectionCache();
            if (cachedCards.length > 0) {
                console.log('[CollectionScreen] Using cached collection data');
                setCollection(cachedCards);
                const newTotalValue = calculateTotalValue(cachedCards);
                setTotalValue(newTotalValue);
                setIsLoading(false);
                return;
            }

            console.log('[CollectionScreen] Loading first 100 cards from database');
            const dbCards = await databaseService.getFirst100Cards();
            console.log(`[CollectionScreen] Found ${dbCards.length} cards in database`);

            if (dbCards.length > 0) {
                console.log('[CollectionScreen] Fetching extended data from Scryfall');
                const extendedCards = await scryfallService.getExtendedDataForCards(dbCards);
                console.log(`[CollectionScreen] Received extended data for ${extendedCards.length} cards`);

                // Save to cache
                await databaseService.saveCollectionCache(extendedCards);
                console.log('[CollectionScreen] Saved collection to cache');

                setCollection(extendedCards);
                const newTotalValue = calculateTotalValue(extendedCards);
                setTotalValue(newTotalValue);
            } else {
                console.log('[CollectionScreen] No cards found in database');
                setCollection([]);
                setTotalValue(0);
            }
        } catch (error) {
            console.error('[CollectionScreen] Error loading collection:', error);
            setCollection([]);
            setTotalValue(0);
        } finally {
            setIsLoading(false);
        }
    };

    const renderHeader = () => (
        <View style={styles.header}>
            <View style={styles.headerControls}>
                <TouchableOpacity
                    style={styles.viewToggle}
                    onPress={() => setView(view === 'grid' ? 'list' : 'grid')}
                >
                    <Icon
                        name={view === 'grid' ? 'view-grid' : 'view-list'}
                        size={24}
                        color="#2196F3"
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.sortButton}
                    onPress={() => {
                        // TODO: Implement sort menu
                    }}
                >
                    <Icon name="sort" size={24} color="#2196F3" />
                    <Text style={styles.sortButtonText}>Sort by {sortBy}</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.stats}>
                <Text style={styles.statsText}>
                    Total Cards: {collection.length}
                </Text>
                <Text style={styles.statsText}>
                    {`Total Value: $${totalValue.toFixed(2)}`}
                </Text>
            </View>
        </View>
    );

    const handleCardPress = (card: ExtendedCard) => {
        navigation.navigate('CardDetails', { card });
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading collection...</Text>
            </View>
        );
    }

    if (collection.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Icon name="cards-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>Your collection is empty</Text>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => navigation.navigate('Search' as never)}
                >
                    <Text style={styles.addButtonText}>Add Cards</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {renderHeader()}
            <CardList
                cards={collection}
                isLoading={isLoading}
                onCardPress={handleCardPress}
            />
        </View>
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
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyText: {
        fontSize: 18,
        color: '#666',
        marginTop: 16,
        marginBottom: 24,
    },
    addButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    addButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        backgroundColor: '#fff',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    viewToggle: {
        padding: 8,
    },
    sortButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
    },
    sortButtonText: {
        marginLeft: 8,
        fontSize: 16,
        color: '#2196F3',
    },
    stats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statsText: {
        fontSize: 14,
        color: '#666',
    },
});

export default CollectionScreen; 