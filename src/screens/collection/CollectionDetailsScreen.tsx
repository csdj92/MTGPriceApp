import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { databaseService } from '../../services/DatabaseService';
import { getLorcanaCollectionCards, getLorcanaSetCollections, deleteLorcanaCardFromCollection, getLorcanaSetMissingCards } from '../../services/LorcanaService';
import CardList from '../../components/CardList';
import LorcanaCardList from '../../components/LorcanaCardList';
import LorcanaGridView from '../../components/LorcanaGridView';
import MTGGridView from '../../components/MTGGridView';
import type { ExtendedCard } from '../../types/card';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'CollectionDetails'>;

const CollectionDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
    const { collectionId } = route.params;
    const [mtgCards, setMtgCards] = useState<ExtendedCard[]>([]);
    const [lorcanaCards, setLorcanaCards] = useState<LorcanaCardWithPrice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [collection, setCollection] = useState<{ id: string; name: string; totalValue: number; type: 'MTG' | 'Lorcana' } | null>(null);
    const [areAllExpanded, setAreAllExpanded] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        loadCollection();
    }, [collectionId]);

    const loadCollection = async () => {
        setIsLoading(true);
        try {
            // First try MTG collections
            const mtgCollection = await databaseService.getCollections()
                .then(collections => collections.find(c => c.id === collectionId));

            if (mtgCollection) {
                setCollection({
                    id: mtgCollection.id,
                    name: mtgCollection.name,
                    totalValue: mtgCollection.totalValue,
                    type: 'MTG'
                });
                navigation.setOptions({ title: mtgCollection.name });
                
                // Extract set code from the description (format: "Collection for [setName] ([setCode])")
                const setCodeMatch = mtgCollection.description?.match(/\(([^)]+)\)$/);
                if (setCodeMatch && setCodeMatch[1]) {
                    const setCode = setCodeMatch[1];
                    const allSetCards = await databaseService.getSetMissingCards(setCode);
                    setMtgCards(allSetCards);
                    setHasMore(false); // Disable pagination since we have all cards
                }
            } else {
                // If not found in MTG collections, check Lorcana collections
                const lorcanaCollections = await getLorcanaSetCollections();
                const lorcanaCollection = lorcanaCollections.find(c => c.id === collectionId);

                if (lorcanaCollection) {
                    setCollection({
                        id: lorcanaCollection.id,
                        name: lorcanaCollection.name,
                        totalValue: lorcanaCollection.totalValue,
                        type: 'Lorcana'
                    });
                    navigation.setOptions({ title: lorcanaCollection.name });
                    
                    // Extract set ID from the description (format: "Collection for Set Name (SET_ID)")
                    const setIdMatch = lorcanaCollection.description?.match(/\((.*?)\)$/);
                    if (setIdMatch && setIdMatch[1]) {
                        const setId = setIdMatch[1];
                        const allSetCards = await getLorcanaSetMissingCards(setId);
                        setLorcanaCards(allSetCards.filter((card): card is LorcanaCardWithPrice => Boolean(card.Unique_ID)));
                    }
                }
            }
        } catch (error) {
            console.error('Error loading collection:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadMoreCards = async (page: number, type: 'MTG' | 'Lorcana') => {
        if (!hasMore || isLoadingMore) return;

        setIsLoadingMore(true);
        try {
            if (type === 'MTG') {
                const newCards = await databaseService.getCollectionCards(collectionId, page);
                if (newCards.length === 0) {
                    setHasMore(false);
                    return;
                }
                if (page === 1) {
                    setMtgCards(newCards.map(card => ({ ...card, isExpanded: false })));
                } else {
                    setMtgCards(prevCards => [...prevCards, ...newCards.map(card => ({ ...card, isExpanded: false }))]);
                }
            } else {
                const newCards = await getLorcanaCollectionCards(collectionId, page);
                if (newCards.length === 0) {
                    setHasMore(false);
                    return;
                }
                setLorcanaCards(prevCards => {
                    const validCards = newCards.filter((card): card is LorcanaCardWithPrice => 
                        Boolean(card.Unique_ID && card.Name && card.Set_Name)
                    );
                    const updatedCards = page === 1 ? validCards : [...prevCards, ...validCards];
                    
                    // Calculate total value
                    const totalValue = updatedCards.reduce((sum, card) => {
                        const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
                        return sum + price;
                    }, 0);

                    // Update collection with new total value
                    setCollection(prev => prev ? {
                        ...prev,
                        totalValue
                    } : null);

                    return updatedCards;
                });
            }
            setCurrentPage(page);
        } catch (error) {
            console.error('Error loading more cards:', error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleCardPress = (card: ExtendedCard | LorcanaCardWithPrice) => {
        if (collection?.type === 'MTG') {
            setMtgCards(prevCards =>
                prevCards.map(c => c.id === (card as ExtendedCard).id ? { ...c, isExpanded: !c.isExpanded } : c)
            );
        } else {
            setLorcanaCards(prevCards =>
                prevCards.map(c => c.Unique_ID === (card as LorcanaCardWithPrice).Unique_ID ? { ...c, isExpanded: !c.isExpanded } : c)
            );
        }
    };

    const toggleAllCards = () => {
        setAreAllExpanded(!areAllExpanded);
        if (collection?.type === 'MTG') {
            setMtgCards(prevCards => prevCards.map(card => ({ ...card, isExpanded: !areAllExpanded })));
        } else {
            setLorcanaCards(prevCards => prevCards.map(card => ({ ...card, isExpanded: !areAllExpanded })));
        }
    };

    const handleEndReached = () => {
        if (!isLoading && !isLoadingMore && hasMore && collection) {
            loadMoreCards(currentPage + 1, collection.type);
        }
    };

    const handleDeleteCard = useCallback(async (card: ExtendedCard | LorcanaCardWithPrice) => {
        if (!collection) return;

        const cardName = 'name' in card ? card.name : card.Name;
        Alert.alert(
            'Delete Card',
            `Are you sure you want to remove "${cardName}" from this collection?`,
            [
                {
                    text: 'Cancel',
                    style: 'cancel'
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (collection.type === 'MTG' && 'uuid' in card) {
                                if (card.uuid) {
                                    await databaseService.removeCardFromCollection(card.uuid, collection.id);
                                    setMtgCards(prev => prev.filter(c => c.uuid !== card.uuid));
                                }
                            } else if (collection.type === 'Lorcana' && 'Unique_ID' in card) {
                                await databaseService.removeLorcanaCardFromCollection(card.Unique_ID, collection.id);
                                setLorcanaCards(prev => {
                                    const updatedCards = prev.filter(c => c.Unique_ID !== card.Unique_ID);
                                    
                                    // Update total value after deletion
                                    const totalValue = updatedCards.reduce((sum, c) => {
                                        const price = c.prices?.usd ? parseFloat(c.prices.usd) : 0;
                                        return sum + price;
                                    }, 0);

                                    setCollection(prev => prev ? { ...prev, totalValue } : null);
                                    
                                    return updatedCards;
                                });
                            }
                        } catch (error) {
                            console.error('Error deleting card:', error);
                            Alert.alert('Error', 'Failed to delete card from collection');
                        }
                    }
                }
            ]
        );
    }, [collection]);

    const cards = collection?.type === 'MTG' ? mtgCards : lorcanaCards;

    useEffect(() => {
        if (collection?.type === 'Lorcana' && lorcanaCards.length > 0) {
            const totalValue = lorcanaCards.reduce((sum, card) => {
                const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
                return sum + price;
            }, 0);
            setCollection(prev => prev ? { ...prev, totalValue } : null);
        }
    }, [lorcanaCards]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <Text style={styles.statsText}>
                        {cards.length} cards · ${collection?.type === 'Lorcana' ? 
                            lorcanaCards.reduce((sum, card) => sum + (card.prices?.usd ? parseFloat(card.prices.usd) : 0), 0).toFixed(2) 
                            : (collection?.totalValue || 0).toFixed(2)}
                    </Text>
                    <View style={styles.headerButtons}>
                        <TouchableOpacity 
                            onPress={() => setViewMode(prev => prev === 'list' ? 'grid' : 'list')} 
                            style={styles.viewButton}
                        >
                            <Icon
                                name={viewMode === 'list' ? 'view-grid' : 'view-list'}
                                size={24}
                                color="#2196F3"
                            />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={toggleAllCards} style={styles.toggleButton}>
                            <Text style={styles.toggleText}>
                                {areAllExpanded ? 'Collapse All' : 'Expand All'}
                            </Text>
                            <Icon
                                name={areAllExpanded ? 'chevron-up' : 'chevron-down'}
                                size={24}
                                color="#2196F3"
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            {collection?.type === 'Lorcana' ? (
                viewMode === 'list' ? (
                    <LorcanaCardList
                        cards={lorcanaCards.filter(card => card.collected)}
                        isLoading={isLoading}
                        onCardPress={handleCardPress}
                        onDeleteCard={handleDeleteCard}
                    />
                ) : (
                    <LorcanaGridView
                        cards={lorcanaCards}
                        isLoading={isLoading}
                        onCardPress={handleCardPress}
                        onDeleteCard={handleDeleteCard}
                    />
                )
            ) : (
                viewMode === 'list' ? (
                    <CardList
                        cards={mtgCards.filter(card => card.collected)}
                        isLoading={isLoading}
                        onCardPress={handleCardPress}
                        onEndReached={handleEndReached}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={
                            isLoadingMore ? (
                                <ActivityIndicator size="small" color="#2196F3" style={styles.loadingMore} />
                            ) : null
                        }
                    />
                ) : (
                    <MTGGridView
                        cards={mtgCards}
                        isLoading={isLoading}
                        onCardPress={handleCardPress}
                        onDeleteCard={card => {
                            if (card.collected) {
                                handleDeleteCard(card);
                            }
                        }}
                    />
                )
            )}
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
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statsText: {
        fontSize: 16,
        color: '#666',
    },
    toggleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    viewButton: {
        padding: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        backgroundColor: '#f5f5f5',
    },
    toggleText: {
        marginRight: 8,
        color: '#2196F3',
        fontSize: 14,
        fontWeight: '500',
    },
    loadingMore: {
        paddingVertical: 16,
    },
    gridPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default CollectionDetailsScreen; 