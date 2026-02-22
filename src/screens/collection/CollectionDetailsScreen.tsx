import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { databaseService } from '../../services/DatabaseService';
import { getLorcanaCollectionCards, getLorcanaSetCollections, getLorcanaSetMissingCards, removeLorcanaCardFromCollection, } from '../../services/LorcanaService';
import { exportService, collectionEventEmitter } from '../../services/ExportService';
import LorcanaGridView from '../../components/lorcana/LorcanaGridView';
import type { LorcanaCardWithPrice, PartialLorcanaCardWithPrice } from '../../types/lorcana';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Collection } from '../../types/collection';
import DatabaseInitializer from '../../services/DatabaseInitializer';

// Define a screen-specific type that includes isExpanded
type DisplayLorcanaCard = LorcanaCardWithPrice & { isExpanded?: boolean };

const Icon = MaterialCommunityIcons;

type Props = NativeStackScreenProps<RootStackParamList, 'CollectionDetails'>;

const CollectionDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
    const { collectionId } = route.params;
    const [lorcanaCards, setLorcanaCards] = useState<PartialLorcanaCardWithPrice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [collection, setCollection] = useState<Collection | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Define loadCollection as a useCallback to properly handle dependencies
    const loadCollection = useCallback(async () => {
        setIsLoading(true);
        try {
            // Check if databaseService is properly initialized
            if (!databaseService) {
                console.error('Database service is not initialized!');
                throw new Error('Database service is not initialized');
            }

            // Ensure database is initialized
            try {
                await DatabaseInitializer.initializeAllDatabases();
            } catch (initError) {
                console.error(`Database initialization failed: ${initError}`);
                throw initError;
            }

            // Load Lorcana collections
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
                            const allSetCards = await getLorcanaSetMissingCards(setId, collectionId)
                                .catch(error => {
                                    console.error(`[CollectionDetailsScreen] Error getting Lorcana set cards for ${setId}:`, error);
                                    return [];
                                });
                            setLorcanaCards(allSetCards.filter(card =>
                                card !== null && card !== undefined
                            ));
                        } catch (error) {
                            console.error(`[CollectionDetailsScreen] Error processing Lorcana set cards for ${setId}:`, error);
                            setLorcanaCards([]);
                        }
                    }
                } else {
                    // Collection not found
                    console.warn(`[CollectionDetailsScreen] Collection not found: ${collectionId}`);
                    setCollection({
                        id: collectionId,
                        name: 'Collection',
                        description: null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        totalValue: 0,
                        cardCount: 0,
                        type: 'Lorcana'
                    });
                    setLorcanaCards([]);
                }
            } catch (error) {
                console.error('[CollectionDetailsScreen] Error processing Lorcana collections:', error);
                setCollection({
                    id: collectionId,
                    name: 'Collection',
                    description: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    totalValue: 0,
                    cardCount: 0,
                    type: 'Lorcana'
                });
                setLorcanaCards([]);
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
                type: 'Lorcana'
            });
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

    const loadMoreCards = async (page: number) => {
        if (!hasMore || isLoadingMore) return;

        setIsLoadingMore(true);
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
                    return prevCards;
                }
            });
            setCurrentPage(page);
        } catch (error) {
            console.error('Error loading more cards:', error);
            setHasMore(false);
        } finally {
            setIsLoadingMore(false);
        }
    };

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

    const handleEndReached = () => {
        if (!isLoading && !isLoadingMore && hasMore) {
            loadMoreCards(currentPage + 1);
        }
    };

    const handleExportCollection = async () => {
        try {
            if (!collection) {
                Alert.alert('Export Error', 'No collection to export.');
                return;
            }

            // Show export options
            Alert.alert(
                'Export Options',
                'Choose what you want to export:',
                [
                    {
                        text: 'Export Collection',
                        onPress: async () => {
                            try {
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
                                Alert.alert('Export Error', 'Failed to export collection. Please try again.');
                            }
                        }
                    },
                    {
                        text: 'Export Database',
                        onPress: async () => {
                            try {
                                // Show a loading indicator
                                setIsLoading(true);

                                // Export the database as SQL dump
                                await exportService.exportDatabaseAsSQL('lorcana');

                                // Hide loading indicator
                                setIsLoading(false);
                            } catch (error) {
                                console.error('Error exporting database:', error);
                                setIsLoading(false);
                                Alert.alert('Export Error', 'Failed to export database. Please try again.');
                            }
                        }
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel'
                    }
                ]
            );
        } catch (error) {
            console.error('Error in export menu:', error);
            Alert.alert('Export Error', 'Failed to show export options. Please try again.');
        }
    };

    useEffect(() => {
        if (lorcanaCards.length > 0) {
            const totalValue = lorcanaCards.reduce((sum, card) => {
                // Only count collected cards
                if (!card.collected) return sum;
                const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
                return sum + (isNaN(price) ? 0 : price);
            }, 0);
            setCollection(prev => prev ? { ...prev, totalValue } : null);
        }
    }, [lorcanaCards]);

    // Prepare stats for LorcanaGridView
    const lorcanaCardCount = lorcanaCards.filter(card => card.collected).length;
    const lorcanaTotalValue =
        lorcanaCards.reduce((sum, card) => {
            if (!card.collected) return sum;

            // Get prices with fallback to foil if normal not available
            const normalPrice = card.price_usd || card.prices?.usd || 0;
            const foilPrice = card.price_usd_foil || card.prices?.usd_foil || 0;
            const priceToUse = normalPrice || foilPrice;
            const priceToUseFoil = foilPrice || normalPrice;

            // Calculate value for normal and foil quantities
            const quantityNormal = card.quantity_normal || 0;
            const quantityFoil = card.quantity_foil || 0;

            const normalValue = quantityNormal * Number(priceToUse);
            const foilValue = quantityFoil * Number(priceToUseFoil);

            return sum + normalValue + foilValue;
        }, 0).toFixed(2);

    return (
        <View style={[styles.container]}>
            <LorcanaGridView
                cards={lorcanaCards.filter(card => card && typeof card.Unique_ID === 'string') as LorcanaCardWithPrice[]}
                isLoading={isLoading}
                onCardPress={handleLorcanaCardPress}
                onDeleteCard={handleRemoveLorcanaCardFromCollection}
                onCardsUpdate={setLorcanaCards}
                onExportCollection={handleExportCollection}
                cardCount={lorcanaCardCount}
                totalValue={lorcanaTotalValue}
                collectionId={collectionId}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
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