import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { databaseService } from '../../services/DatabaseService';
import { getLorcanaCollectionCards, getLorcanaSetCollections, deleteLorcanaCardFromCollection, getLorcanaSetMissingCards, } from '../../services/LorcanaService';
import { exportService, collectionEventEmitter } from '../../services/ExportService';
import CardList from '../../components/CardList';
import LorcanaCardList from '../../components/LorcanaCardList';
import LorcanaGridView from '../../components/lorcana/LorcanaGridView';
import MTGGridView from '../../components/MTGGridView';
import type { ExtendedCard } from '../../types/card';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as any; // Temporary type assertion

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

    // Define loadCollection as a useCallback to properly handle dependencies
    const loadCollection = useCallback(async () => {
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
    }, [collectionId, navigation]);

    useEffect(() => {
        loadCollection();
    }, [loadCollection]);

    // Add listener for collection import/update events
    useEffect(() => {
        const handleCollectionsUpdated = (data: { type: string }) => {
            console.log('[CollectionDetailsScreen] Collections updated event received:', data);
            // Reload the collection data
            loadCollection();
        };

        // Add event listener and store the subscription
        const subscription = collectionEventEmitter.addListener('collectionsUpdated', handleCollectionsUpdated);

        // Cleanup function
        return () => {
            subscription.remove(); // Use remove() instead of removeListener
        };
    }, [loadCollection]);

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
        if (!collection) return;

        if (collection.type === 'MTG') {
            navigation.navigate('CardDetails', { card: card as ExtendedCard });
        } else {
            navigation.navigate('LorcanaCardDetails', { 
                card: card as LorcanaCardWithPrice,
                collectionId: collection.id
            });
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
                                await deleteLorcanaCardFromCollection(card.Unique_ID, collection.id);
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

    const handleExportCollection = async () => {
        try {
            if (!collection || collection.type !== 'Lorcana') {
                Alert.alert('Export Error', 'Only Lorcana collections can be exported at this time.');
                return;
            }

            // Show a loading indicator
            setIsLoading(true);

            // Export the collection
            const filePath = await exportService.exportLorcanaCollections();
            
            // Hide loading indicator
            setIsLoading(false);

            // Ask if the user wants to share the file
            Alert.alert(
                'Export Successful',
                'Your Lorcana collection has been exported successfully. Would you like to share it?',
                [
                    {
                        text: 'No',
                        style: 'cancel'
                    },
                    {
                        text: 'Share',
                        onPress: async () => {
                            try {
                                // Show loading indicator during share
                                setIsLoading(true);
                                
                                // Show a message about what to expect
                                if (Platform.OS === 'android') {
                                    console.log('Showing Android share instructions');
                                    Alert.alert(
                                        'Sharing Instructions',
                                        'You will now see share options. If the file is not attached, you can find it in your Downloads/LorcanaExports folder to share manually.',
                                        [{ text: 'OK', onPress: async () => {
                                            await exportService.shareLorcanaCollections(filePath);
                                            setIsLoading(false);
                                        }}]
                                    );
                                } else {
                                    // On iOS, just share directly
                                    await exportService.shareLorcanaCollections(filePath);
                                    setIsLoading(false);
                                }
                            } catch (error) {
                                console.error('Error sharing:', error);
                                setIsLoading(false);
                                Alert.alert('Share Error', 'Failed to share. You can find the export file in your downloads folder.');
                            }
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('Error exporting collection:', error);
            setIsLoading(false);
            Alert.alert('Export Error', 'Failed to export your collection. Please try again.');
        }
    };

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
                            lorcanaCards.reduce((sum, card) => 
                                sum + (card.collected && card.prices?.usd ? Number(card.prices.usd) : 0), 0).toFixed(2) 
                            : Number(collection?.totalValue || 0).toFixed(2)}
                    </Text>
                    <View style={styles.headerButtons}>
                        {collection?.type === 'Lorcana' && (
                            <TouchableOpacity 
                                onPress={handleExportCollection} 
                                style={styles.exportButton}
                            >
                                <Icon
                                    name="export"
                                    size={24}
                                    color="#2196F3"
                                />
                                <Text style={styles.buttonText}>Export</Text>
                            </TouchableOpacity>
                        )}
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
                        onCardsUpdate={updatedCards => {
                            setLorcanaCards(updatedCards);
                        }}
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
                        onDeleteCard={handleDeleteCard}
                        onCardsUpdate={setMtgCards}
                        collectionId={collectionId}
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
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        backgroundColor: '#f5f5f5',
        marginRight: 8,
    },
    buttonText: {
        color: '#2196F3',
        marginLeft: 4,
        fontSize: 14,
        fontWeight: '500',
    },
});

export default CollectionDetailsScreen; 