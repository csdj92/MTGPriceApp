import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
    View,
    StyleSheet,
    Text,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import DocumentPicker from 'react-native-document-picker';
// Fix Icon type similar to LorcanaGridView
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;
import { databaseService } from '../../services/DatabaseService';
import { collectionCacheService } from '../../services/CollectionCacheService';
import { 
    getLorcanaSetCollections, 
    ensureLorcanaInitialized, 
    reloadLorcanaCards,
    getLorcanaCollectionCards,
    deleteLorcanaCardFromCollection,
    deleteLorcanaCollection
} from '../../services/LorcanaService';
import { exportService, collectionEventEmitter } from '../../services/ExportService';
import type { Collection } from '../../services/DatabaseService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

type SetCompletionScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'SetCompletion'>;
};

interface SetCollection extends Collection {
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
}

// Memoize the SetItem component
const SetItem = memo(({ item, onDelete, onPress }: { 
    item: SetCollection & { type: string },
    onDelete: (id: string, name: string) => void,
    onPress: (item: SetCollection & { type: string }) => void
}) => (
    <TouchableOpacity 
        style={styles.setItem}
        onPress={() => onPress(item)}
    >
        <View style={styles.setIcon}>
            <Icon name={item.type === 'MTG' ? 'cards' : 'cards-playing-outline'} size={24} color="#666" />
        </View>
        <View style={styles.setInfo}>
            <Text style={styles.setName}>{item.name}</Text>
            <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                    <View 
                        style={[
                            styles.progressFill, 
                            { width: `${item.completionPercentage}%` }
                        ]} 
                    />
                </View>
                <Text style={styles.progressText}>
                    {item.collectedCards}/{item.totalCards} ({item.completionPercentage.toFixed(1)}%)
                </Text>
            </View>
            <View style={styles.setStats}>
                <Text style={styles.statsText}>
                    ${(item.totalValue || 0).toFixed(2)}
                </Text>
            </View>
        </View>
        <View style={styles.actionButtons}>
            <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => onDelete(item.id, item.name)}
            >
                <Icon name="delete" size={24} color="#ff5252" />
            </TouchableOpacity>
            <Icon name="chevron-right" size={24} color="#666" />
        </View>
    </TouchableOpacity>
));

const SetCompletionScreen: React.FC<SetCompletionScreenProps> = ({ navigation }) => {
    // State hooks
    const [isLoading, setIsLoading] = useState(true);
    const [mtgCollections, setMtgCollections] = useState<SetCollection[]>([]);
    const [lorcanaCollections, setLorcanaCollections] = useState<SetCollection[]>([]);
    const [loadingMtg, setLoadingMtg] = useState(true);
    const [loadingLorcana, setLoadingLorcana] = useState(true);

    // Memoized callbacks
    const loadCollections = useCallback(async (forceRefresh = false) => {
        console.log('[SetCompletionScreen] Starting to load collections, forceRefresh:', forceRefresh);
        setIsLoading(true);
        setLoadingMtg(true);
        setLoadingLorcana(true);

        // Load MTG collections using the cache service
        try {
            const collections = await collectionCacheService.getSetCollections(forceRefresh);
            setMtgCollections(collections);
        } catch (error) {
            console.error('[SetCompletionScreen] Error loading MTG collections:', error);
            setMtgCollections([]);
        } finally {
            setLoadingMtg(false);
        }

        // Load Lorcana collections with force refresh option
        try {
            await ensureLorcanaInitialized();
            const lorcanaCollections = await getLorcanaSetCollections(forceRefresh);
            const mappedCollections = lorcanaCollections?.map(c => ({
                ...c,
                cardCount: c.collectedCards
            })) || [];
            setLorcanaCollections(mappedCollections);
        } catch (error) {
            console.error('[SetCompletionScreen] Error loading Lorcana collections:', error);
            setLorcanaCollections([]);
        } finally {
            setLoadingLorcana(false);
        }

        // Set a timeout to clear loading state if it gets stuck
        setTimeout(() => {
            setIsLoading(false);
            setLoadingMtg(false);
            setLoadingLorcana(false);
        }, 2000);
    }, []);

    const handleDeleteCollection = useCallback(async (collectionId: string, collectionName: string, type: string) => {
        Alert.alert(
            'Delete Collection',
            `Are you sure you want to delete "${collectionName}"? This action cannot be undone.`,
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
                            if (type === 'MTG') {
                                await databaseService.deleteCollection(collectionId);
                            } else {
                                await deleteLorcanaCollection(collectionId);
                            }
                            loadCollections();
                        } catch (error) {
                            console.error('Error deleting collection:', error);
                            Alert.alert('Error', 'Failed to delete collection');
                        }
                    }
                }
            ]
        );
    }, [loadCollections]);

    const keyExtractor = useCallback((item: SetCollection & { type: string }) => item.id, []);

    const getItemLayout = useCallback((_: any, index: number) => ({
        length: 92,
        offset: 92 * index,
        index,
    }), []);

    const handleSetPress = useCallback((item: SetCollection & { type: string }) => {
        // Extract set code from description which is in format "Collection for [setName] ([setCode])"
        const setCodeMatch = item.description?.match(/\(([^)]+)\)$/);
        const setCode = setCodeMatch ? setCodeMatch[1] : '';
        
        navigation.navigate('CollectionDetails', {
            collectionId: item.id,
            title: item.name
        });
    }, [navigation]);

    const renderSetItem = useCallback(({ item }: { item: SetCollection & { type: string } }) => (
        <SetItem 
            item={item} 
            onDelete={(id, name) => handleDeleteCollection(id, name, item.type)}
            onPress={handleSetPress}
        />
    ), [handleDeleteCollection, handleSetPress]);

    // Memoized values
    const allCollections = useMemo(() => {
        console.log('[SetCompletionScreen] Updating collections:', { 
            mtg: mtgCollections.length, 
            lorcana: lorcanaCollections.length 
        });
        const combined = [
            ...mtgCollections.map(c => ({ ...c, type: 'MTG' })),
            ...lorcanaCollections.map(c => ({ ...c, type: 'Lorcana' }))
        ].sort((a, b) => a.name.localeCompare(b.name));
        return combined;
    }, [mtgCollections, lorcanaCollections]);

    const EmptyComponent = useMemo(() => (
        <View style={styles.emptyContainer}>
            <Icon name="cards-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No Sets Found</Text>
            <Text style={styles.emptySubtext}>
                Scan cards to start tracking set completion
            </Text>
        </View>
    ), []);

    // Effects
    useEffect(() => {
        loadCollections(false); // Initial load without force refresh
    }, [loadCollections]);

    // Add focus listener to refresh collections
    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            console.log('[SetCompletionScreen] Screen focused, reloading collections...');
            // Force a complete reload from the database when screen is focused
            setMtgCollections([]);
            setLorcanaCollections([]);
            setIsLoading(true);
            loadCollections(true); // Use forceRefresh = true
        });

        return unsubscribe;
    }, [navigation, loadCollections]);

    // Add listener for collection import/update events
    useEffect(() => {
        const handleCollectionsUpdated = (data: { type: string }) => {
            console.log('[SetCompletionScreen] Collections updated event received:', data);
            // Force a reload of the collections data
            setMtgCollections([]);
            setLorcanaCollections([]);
            setIsLoading(true);
            loadCollections(true);
        };

        // Add event listener and store the subscription
        const subscription = collectionEventEmitter.addListener('collectionsUpdated', handleCollectionsUpdated);

        // Cleanup function
        return () => {
            subscription.remove(); // Use remove() instead of removeListener
        };
    }, [loadCollections]);

    useEffect(() => {
        console.log('[SetCompletionScreen] Loading states:', { loadingMtg, loadingLorcana });
        if (!loadingMtg && !loadingLorcana) {
            console.log('[SetCompletionScreen] All collections loaded, clearing loading state');
            setIsLoading(false);
        }
    }, [loadingMtg, loadingLorcana]);

    const handleImportCollection = async () => {
        try {
            // Show loading indicator
            setIsLoading(true);
            
            // Pick a single file
            const result = await DocumentPicker.pick({
                type: [DocumentPicker.types.allFiles],
                copyTo: 'cachesDirectory', // This ensures we get a file path we can work with
            });
            
            if (result && result[0]) {
                console.log('[SetCompletionScreen] File picked:', result[0]);
                
                // Get the file path - use fileCopyUri which is more reliable across platforms
                const filePath = result[0].fileCopyUri;
                
                if (!filePath) {
                    throw new Error('Failed to get file path from document picker');
                }
                
                console.log('[SetCompletionScreen] File path for import:', filePath);
                
                // Show importing message
                setIsLoading(true);
                
                // Import the collection
                // Note: We don't need to call loadCollections explicitly here anymore
                // because we'll receive the collectionsUpdated event from ExportService
                await exportService.importLorcanaCollections(filePath);
                
                // The collection update event will trigger the reload
                // But we'll still clear the loading state in case anything goes wrong
                setTimeout(() => {
                    setIsLoading(false);
                }, 500);
            }
        } catch (error) {
            // Handle user cancellation
            if (DocumentPicker.isCancel(error)) {
                console.log('User cancelled the picker');
            } else {
                console.error('Error picking document:', error);
                Alert.alert('Import Error', 'Failed to import collections. Please try again.');
            }
        } finally {
            // Ensure loading state is cleared
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading collections...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Set Completion</Text>
                <View style={styles.headerButtons}>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={handleImportCollection}
                    >
                        <Icon name="file-import" size={24} color="#2196F3" />
                        <Text style={styles.buttonText}>Import</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={async () => {
                            try {
                                setIsLoading(true);
                                await reloadLorcanaCards(); // Force reload all cards
                                await loadCollections(true); // Use forceRefresh = true
                                Alert.alert(
                                    'Success',
                                    'Collection data refreshed successfully!',
                                    [{ text: 'OK' }]
                                );
                            } catch (error) {
                                console.error('Error initializing Lorcana:', error);
                                Alert.alert('Error', 'Failed to initialize Lorcana database');
                            } finally {
                                setIsLoading(false);
                            }
                        }}
                    >
                        <Icon name="refresh" size={24} color="#2196F3" />
                        <Text style={styles.buttonText}>Refresh</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {allCollections.length === 0 ? EmptyComponent : (
                <FlatList
                    data={allCollections}
                    renderItem={renderSetItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.listContainer}
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={true}
                    getItemLayout={getItemLayout}
                />
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
    },
    listContainer: {
        padding: 16,
    },
    setItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    setIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    setInfo: {
        flex: 1,
    },
    setName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    progressContainer: {
        marginTop: 4,
    },
    progressBar: {
        height: 4,
        backgroundColor: '#e0e0e0',
        borderRadius: 2,
        marginBottom: 4,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#2196F3',
        borderRadius: 2,
    },
    progressText: {
        fontSize: 12,
        color: '#666',
    },
    setStats: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    statsText: {
        fontSize: 14,
        color: '#666',
        marginRight: 8,
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
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginTop: 8,
    },
    actionButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    deleteButton: {
        padding: 8,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        backgroundColor: '#f5f5f5',
        marginLeft: 8,
    },
    buttonText: {
        color: '#2196F3',
        marginLeft: 4,
        fontSize: 14,
        fontWeight: '500',
    },
});

export default SetCompletionScreen; 