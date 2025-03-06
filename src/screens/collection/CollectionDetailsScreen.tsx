import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Alert, Platform, ToastAndroid} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { databaseService } from '../../services/DatabaseService';
import { getLorcanaCollectionCards, getLorcanaSetCollections, getLorcanaSetMissingCards, removeLorcanaCardFromCollection, } from '../../services/LorcanaService';
import { exportService, collectionEventEmitter } from '../../services/ExportService';
import CardList from '../../components/CardList';
import LorcanaCardList from '../../components/LorcanaCardList';
import LorcanaGridView from '../../components/lorcana/LorcanaGridView';
import MTGGridView from '../../components/MTGGridView';
import type { ExtendedCard } from '../../types/card';
import type { LorcanaCardWithPrice, PartialLorcanaCardWithPrice } from '../../types/lorcana';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Collection } from '../../types/collection';
import DatabaseInitializer from '../../services/DatabaseInitializer';
const Icon = MaterialCommunityIcons as any; // Temporary type assertion

type Props = NativeStackScreenProps<RootStackParamList, 'CollectionDetails'>;

const CollectionDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
    const { collectionId } = route.params;
    const [mtgCards, setMtgCards] = useState<ExtendedCard[]>([]);
    const [lorcanaCards, setLorcanaCards] = useState<PartialLorcanaCardWithPrice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [collection, setCollection] = useState<Collection | null>(null);
    const [areAllExpanded, setAreAllExpanded] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Define loadCollection as a useCallback to properly handle dependencies
    const loadCollection = useCallback(async () => {
        setIsLoading(true);
        try {
            ToastAndroid.show('Starting to load collection...', ToastAndroid.SHORT);

            // Check if databaseService is properly initialized
            if (!databaseService) {
                ToastAndroid.show('Database service is not initialized!', ToastAndroid.LONG);
                throw new Error('Database service is not initialized');
            }

            // Ensure database is initialized
            try {
                await DatabaseInitializer.initializeAllDatabases();
                ToastAndroid.show('Database initialized successfully', ToastAndroid.SHORT);
            } catch (initError) {
                ToastAndroid.show(`Database initialization failed: ${initError}`, ToastAndroid.LONG);
                throw initError;
            }

            // First try MTG collections
            let collections;
            try {
                collections = await databaseService.getCollections();
                if (!collections || !Array.isArray(collections)) {
                    ToastAndroid.show('Got invalid collections data', ToastAndroid.LONG);
                    throw new Error('Invalid collections data received');
                }
                ToastAndroid.show(`Found ${collections.length} collections`, ToastAndroid.SHORT);
            } catch (error) {
                ToastAndroid.show(`Failed to get collections: ${error}`, ToastAndroid.LONG);
                throw error;
            }

            const mtgCollection = collections.find(c => c.id === collectionId);

            if (mtgCollection) {
                ToastAndroid.show(`Found collection: ${mtgCollection.name}`, ToastAndroid.SHORT);
                setCollection({
                    id: mtgCollection.id,
                    name: mtgCollection.name,
                    description: mtgCollection.description || null,
                    createdAt: mtgCollection.createdAt || new Date().toISOString(),
                    updatedAt: mtgCollection.updatedAt || new Date().toISOString(),
                    totalValue: mtgCollection.totalValue || 0,
                    cardCount: mtgCollection.cardCount || 0,
                    type: 'MTG'
                });
                navigation.setOptions({ title: mtgCollection.name });
                
                // Extract set code from the description (format: "Collection for [setName] ([setCode])")
                const setCodeMatch = mtgCollection.description?.match(/\(([^)]+)\)$/);
                if (setCodeMatch && setCodeMatch[1]) {
                    const setCode = setCodeMatch[1];
                    ToastAndroid.show(`Loading set cards for ${setCode}...`, ToastAndroid.SHORT);
                    try {
                        const allSetCards = await databaseService.getSetMissingCards(setCode)
                            .catch(error => {
                                ToastAndroid.show(`Error getting set cards: ${error}`, ToastAndroid.LONG);
                                console.error(`[CollectionDetailsScreen] Error getting set cards for ${setCode}:`, error);
                                return [];
                            });
                        ToastAndroid.show(`Loaded ${allSetCards.length} set cards`, ToastAndroid.SHORT);
                        setMtgCards(allSetCards);
                        setHasMore(false); // Disable pagination since we have all cards
                    } catch (error) {
                        ToastAndroid.show(`Error processing set cards: ${error}`, ToastAndroid.LONG);
                        console.error(`[CollectionDetailsScreen] Error processing set cards for ${setCode}:`, error);
                        setMtgCards([]);
                        setHasMore(false);
                    }
                }
            } else {
                ToastAndroid.show('MTG collection not found, checking Lorcana...', ToastAndroid.SHORT);
                // If not found in MTG collections, check Lorcana collections
                try {
                    const lorcanaCollections = await getLorcanaSetCollections()
                        .catch(error => {
                            console.error('[CollectionDetailsScreen] Error getting Lorcana collections:', error);
                            return [];
                        });
                    const lorcanaCollection = lorcanaCollections.find(c => c.id === collectionId);

                    if (lorcanaCollection) {
                        setCollection({
                            id: lorcanaCollection.id,
                            name: lorcanaCollection.name,
                            description: lorcanaCollection.description || null,
                            createdAt: lorcanaCollection.createdAt || new Date().toISOString(),
                            updatedAt: lorcanaCollection.updatedAt || new Date().toISOString(),
                            totalValue: lorcanaCollection.totalValue || 0,
                            cardCount: lorcanaCollection.cardCount || 0,
                            type: 'Lorcana'
                        });
                        navigation.setOptions({ title: lorcanaCollection.name });
                        
                        // Extract set ID from the description (format: "Collection for Set Name (SET_ID)")
                        const setIdMatch = lorcanaCollection.description?.match(/\((.*?)\)$/);
                        if (setIdMatch && setIdMatch[1]) {
                            const setId = setIdMatch[1];
                            try {
                                const allSetCards = await getLorcanaSetMissingCards(setId)
                                    .catch(error => {
                                        console.error(`[CollectionDetailsScreen] Error getting Lorcana set cards for ${setId}:`, error);
                                        return [];
                                    });
                                setLorcanaCards(allSetCards.filter((card): card is LorcanaCardWithPrice => 
                                    card !== null && card !== undefined && typeof card.Unique_ID === 'string'
                                ));
                            } catch (error) {
                                console.error(`[CollectionDetailsScreen] Error processing Lorcana set cards for ${setId}:`, error);
                                setLorcanaCards([]);
                            }
                        }
                    } else {
                        // Neither MTG nor Lorcana collection found
                        console.warn(`[CollectionDetailsScreen] Collection not found: ${collectionId}`);
                        // Set empty collection data
                        setCollection({
                            id: collectionId,
                            name: 'Collection',
                            description: null,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            totalValue: 0,
                            cardCount: 0,
                            type: 'MTG'
                        });
                        setMtgCards([]);
                        setLorcanaCards([]);
                    }
                } catch (error) {
                    console.error('[CollectionDetailsScreen] Error processing Lorcana collections:', error);
                    // Set default values
                    setCollection({
                        id: collectionId,
                        name: 'Collection',
                        description: null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        totalValue: 0,
                        cardCount: 0,
                        type: 'MTG'
                    });
                    setMtgCards([]);
                    setLorcanaCards([]);
                }
            }
        } catch (error) {
            console.error('Error loading collection:', error);
            // Set fallback values
            setCollection({
                id: collectionId,
                name: 'Collection',
                description: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalValue: 0,
                cardCount: 0,
                type: 'MTG'
            });
            setMtgCards([]);
            setLorcanaCards([]);
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
                try {
                    const newCards = await databaseService.getCollectionCards(collectionId, page)
                        .catch(error => {
                            console.error(`[CollectionDetailsScreen] Error getting MTG collection cards for page ${page}:`, error);
                            return [];
                        });
                        
                    if (newCards.length === 0) {
                        setHasMore(false);
                        return;
                    }
                    
                    if (page === 1) {
                        setMtgCards(newCards.map(card => ({ ...card, isExpanded: false })));
                    } else {
                        setMtgCards(prevCards => [...prevCards, ...newCards.map(card => ({ ...card, isExpanded: false }))]);
                    }
                } catch (error) {
                    console.error(`[CollectionDetailsScreen] Error processing MTG cards for page ${page}:`, error);
                    setHasMore(false);
                    // Keep existing cards, don't overwrite
                }
            } else {
                try {
                    const newCards = await getLorcanaCollectionCards(collectionId, page)
                        .catch(error => {
                            console.error(`[CollectionDetailsScreen] Error getting Lorcana collection cards for page ${page}:`, error);
                            return [];
                        });
                        
                    if (newCards.length === 0) {
                        setHasMore(false);
                        return;
                    }
                    
                    const validCards = newCards.filter(card => 
                        Boolean(card?.Unique_ID || card?.id)
                    ) as PartialLorcanaCardWithPrice[];
                    
                    setLorcanaCards(prevCards => {
                        try {
                            const updatedCards = page === 1 ? validCards : [...prevCards, ...validCards];
                            
                            // Calculate total value safely
                            const totalValue = updatedCards.reduce((sum, card) => {
                                const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
                                return sum + (isNaN(price) ? 0 : price);
                            }, 0);

                            // Update collection with new total value
                            setCollection(prev => prev ? {
                                ...prev,
                                totalValue
                            } : null);

                            return updatedCards;
                        } catch (error) {
                            console.error(`[CollectionDetailsScreen] Error processing Lorcana cards state update:`, error);
                            // Return previous state to avoid breaking the app
                            return prevCards;
                        }
                    });
                } catch (error) {
                    console.error(`[CollectionDetailsScreen] Error processing Lorcana cards for page ${page}:`, error);
                    setHasMore(false);
                    // Keep existing cards, don't overwrite
                }
            }
            setCurrentPage(page);
        } catch (error) {
            console.error('Error loading more cards:', error);
            setHasMore(false);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleCardPress = useCallback((card: ExtendedCard) => {
        // Make sure we have the most up-to-date card data from state
        const updatedCard = mtgCards.find(c => c.id === card.id) || card;
        navigation.navigate('CardDetails', { card: updatedCard });
    }, [navigation, mtgCards]);

    const handleLorcanaCardPress = useCallback((card: PartialLorcanaCardWithPrice) => {
        // Safe navigation - make sure we have a valid card and collectionId
        if (card && collectionId) {
            navigation.navigate('LorcanaCardDetails', { 
                card, 
                collectionId 
            });
        } else {
            console.error('[CollectionDetailsScreen] Cannot navigate to card details: invalid card or collectionId');
        }
    }, [collectionId, navigation]);

    const handleDeleteCard = useCallback((card: ExtendedCard) => {
        if (!card.id || !collectionId) {
            console.error('[CollectionDetailsScreen] Cannot delete card: missing id or collectionId');
            return;
        }
        
        try {
            databaseService.markCardAsMissing(card.id, collectionId)
                .then(() => {
                    setMtgCards(prevCards => prevCards.map(c => 
                        c.id === card.id ? { ...c, quantity: 0 } : c
                    ));
                    // No need to update the collection count since the card is still in the collection, just marked as missing
                })
                .catch(error => {
                    console.error('[CollectionDetailsScreen] Error marking card as missing:', error);
                });
        } catch (error) {
            console.error('[CollectionDetailsScreen] Exception when marking card as missing:', error);
        }
    }, [collectionId, databaseService]);

    const handleRemoveLorcanaCardFromCollection = useCallback((card: PartialLorcanaCardWithPrice) => {
        const cardId = card.Unique_ID || (card as any).id;
        
        if (!cardId || !collectionId) {
            console.error('[CollectionDetailsScreen] Cannot delete Lorcana card: missing Unique_ID/id or collectionId');
            return;
        }
        
        try {
            removeLorcanaCardFromCollection(cardId.toString(), collectionId)
                .then(() => {
                    setLorcanaCards(prevCards => 
                        prevCards.map(c => {
                            if ((c.Unique_ID === cardId) || ((c as any).id === cardId)) {
                                return { ...c, collected: false };
                            }
                            return c;
                        })
                    );
                    // Update the collection count
                    if (collection) {
                        setCollection({
                            ...collection,
                            cardCount: collection.cardCount - 1
                        });
                    }
                })
                .catch(error => {
                    console.error('[CollectionDetailsScreen] Error removing Lorcana card from collection:', error);
                });
        } catch (error) {
            console.error('[CollectionDetailsScreen] Exception when removing Lorcana card from collection:', error);
        }
    }, [collectionId, collection, databaseService]);

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
                // Only count collected cards
                if (!card.collected) return sum;
                const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
                return sum + (isNaN(price) ? 0 : price);
            }, 0);
            setCollection(prev => prev ? { ...prev, totalValue } : null);
        }
    }, [lorcanaCards]);

    // Add useEffect hook to update totalValue when mtgCards changes
    useEffect(() => {
        if (collection?.type === 'MTG' && mtgCards.length > 0) {
            const totalValue = mtgCards.reduce((sum, card) => {
                // Only count collected cards
                if (!card.collected) return sum;
                // Parse price from card data
                const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
                return sum + (isNaN(price) ? 0 : price);
            }, 0);
            setCollection(prev => prev ? { ...prev, totalValue } : null);
        }
    }, [mtgCards]);

    return (
        <View style={[styles.container]}>
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <Text style={styles.statsText}>
                    {cards.length} cards · ${collection?.type === 'Lorcana' ? 
                            lorcanaCards.reduce((sum, card) => 
                                sum + (card.collected && card.prices?.usd ? Number(card.prices.usd) : 0), 0).toFixed(2) 
                            :Number(collection?.totalValue || 0).toFixed(2)}
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
                        onCardPress={handleLorcanaCardPress}
                        onDeleteCard={handleRemoveLorcanaCardFromCollection}
                    />
                ) : (
                    <LorcanaGridView
                        cards={lorcanaCards as any}
                        isLoading={isLoading}
                        onCardPress={handleLorcanaCardPress}
                        onDeleteCard={handleRemoveLorcanaCardFromCollection}
                        onCardsUpdate={setLorcanaCards}
                    />
                )
            ) : (
                viewMode === 'list' ? (
                    <CardList
                        cards={mtgCards.filter(card => card.collected)}
                        isLoading={isLoading}
                        onCardPress={handleCardPress}
                        onDeleteCard={handleDeleteCard}
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