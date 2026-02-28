import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
    View,
    StyleSheet,
    Text,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
    Platform,
} from 'react-native';
import {
    pick as DocumentPickerPick,
    types as DocumentPickerTypes,
    errorCodes as DocumentPickerErrorCodes,
    isErrorWithCode as isDocumentPickerErrorWithCode,
    DocumentPickerResponse
} from '@react-native-documents/picker';
import { Icon } from '../../utils/icons';
import { databaseService } from '../../services/DatabaseService';
import { collectionCacheService } from '../../services/CollectionCacheService';
import { 
    getLorcanaSetCollections, 
    ensureLorcanaInitialized, 
    getLorcanaCollectionCards,
    deleteLorcanaCardFromCollection,
    deleteLorcanaCollection,
    safeRefreshLorcanaCards,
    updateLorcanaCollectionPrices
} from '../../services/LorcanaService';
import { exportService, collectionEventEmitter } from '../../services/ExportService';
import type { Collection } from '../../services/DatabaseService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import type { Theme } from '../../context/ThemeContext';
import RNFS from 'react-native-fs';

type SetCompletionScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'SetCompletion'>;
};

interface SetCollection extends Collection {
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
}

// Memoize the SetItem component
const SetItem = memo(({ item, onPress, onLongPress, onRefreshPrices, isRefreshing, isSelected, isSelectionModeActive }: { 
    item: SetCollection & { type: string },
    onPress: (item: SetCollection & { type: string }) => void,
    onLongPress: (item: SetCollection & { type: string }) => void,
    onRefreshPrices: (id: string, type: string) => void,
    isRefreshing: boolean,
    isSelected: boolean,
    isSelectionModeActive: boolean
}) => {
    const { theme } = useTheme();
    const styles = useThemedStyles(() => createStyles(theme));
    
    return (
        <TouchableOpacity 
            style={[styles.setItem, isSelected && isSelectionModeActive && styles.selectedSetItem]}
            onPress={() => onPress(item)}
            onLongPress={() => onLongPress(item)}
        >
            <View style={styles.selectionIndicatorContainer}>
                {isSelectionModeActive && (
                    <Icon 
                        name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} 
                        size={24} 
                        color={isSelected ? theme.primary : theme.icon} 
                    />
                )}
            </View>
            <View style={styles.setIcon}>
                <Icon name={item.type === 'MTG' ? 'cards' : 'cards-playing-outline'} size={24} color={theme.icon} />
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
                {item.type === 'Lorcana' && (
                    isRefreshing ? (
                        <ActivityIndicator size="small" color={theme.primary} style={styles.refreshButton} />
                    ) : (
                        <TouchableOpacity
                            style={styles.refreshButton}
                            onPress={() => onRefreshPrices(item.id, item.type)}
                        >
                            <Icon name="refresh" size={24} color={theme.primary} />
                        </TouchableOpacity>
                    )
                )}
                <Icon name="chevron-right" size={24} color={theme.iconSecondary} />
            </View>
        </TouchableOpacity>
    );
});

const SetCompletionScreen: React.FC<SetCompletionScreenProps> = ({ navigation }) => {
    // State hooks
    const [mtgCollections, setMtgCollections] = useState<SetCollection[]>([]);
    const [lorcanaCollections, setLorcanaCollections] = useState<SetCollection[]>([]);
    const [loadingMtg, setLoadingMtg] = useState(true);
    const [loadingLorcana, setLoadingLorcana] = useState(true);
    const [refreshingCollectionId, setRefreshingCollectionId] = useState<string | null>(null);
    const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set());
    const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);
    const { theme } = useTheme();
    const styles = useThemedStyles(() => createStyles(theme));

    // Memoized callbacks
    const loadCollections = useCallback(async (forceRefresh = false) => {
        setLoadingMtg(true);
        setLoadingLorcana(true);

        const loadMtg = async () => {
            try {
                const collections = await collectionCacheService.getSetCollections(forceRefresh);
                setMtgCollections(collections);
            } catch (error) {
                console.error('[SetCompletionScreen] Error loading MTG collections:', error);
                setMtgCollections([]);
            } finally {
                setLoadingMtg(false);
            }
        };

        const loadLorcana = async () => {
            try {
                await ensureLorcanaInitialized();
                try {
                    const lorcanaData = await getLorcanaSetCollections(forceRefresh);
                    const mappedCollections = lorcanaData?.map(c => ({
                        ...c,
                        cardCount: c.collectedCards
                    })) || [];
                    // Sort by set_number (release order), fallback to name if missing
                    mappedCollections.sort((a, b) => {
                        const aSetNum = (a as any).set_number;
                        const bSetNum = (b as any).set_number;
                        if (aSetNum && bSetNum) {
                            return aSetNum - bSetNum;
                        } else if (aSetNum) {
                            return -1;
                        } else if (bSetNum) {
                            return 1;
                        } else {
                            return a.name.localeCompare(b.name);
                        }
                    });
                    setLorcanaCollections(mappedCollections);
                } catch (lorcanaError) {
                    console.error('[SetCompletionScreen] Error getting Lorcana collections:', lorcanaError);
                    setLorcanaCollections([]);
                }
            } catch (error) {
                console.error('[SetCompletionScreen] Error loading Lorcana collections:', error);
                setLorcanaCollections([]);
            } finally {
                setLoadingLorcana(false);
            }
        };

        await Promise.all([loadMtg(), loadLorcana()]);
    }, []);

    // Memoized values - moved up
    const allCollections = useMemo(() => {
        // Only sort MTG sets alphabetically; Lorcana sets are already sorted by Set_Num
        const sortedMtg = [...mtgCollections].sort((a, b) => a.name.localeCompare(b.name));
        // Lorcana sets are already sorted by Set_Num in loadLorcana
        const combined = [
            ...sortedMtg.map(c => ({ ...c, type: 'MTG' })),
            ...lorcanaCollections.map(c => ({ ...c, type: 'Lorcana' }))
        ];
        return combined;
    }, [mtgCollections, lorcanaCollections]);

    const handleRefreshPrices = useCallback(async (collectionId: string, type: string) => {
        if (type === 'Lorcana') {
            setRefreshingCollectionId(collectionId);
            try {
                console.log(`[SetCompletionScreen] Refreshing prices for Lorcana collection: ${collectionId}`);
                const result = await updateLorcanaCollectionPrices(collectionId, true);
                console.log(`[SetCompletionScreen] Price refresh result for ${collectionId}: Updated ${result.updated}, Skipped ${result.skipped}`);
                // Reload all collections to reflect updated totalValue and other stats
                // We might want to optimize this later to only reload the specific collection
                // or update it in place if possible.
                await loadCollections(true); 
            } catch (error) {
                console.error(`[SetCompletionScreen] Error refreshing prices for collection ${collectionId}:`, error);
                Alert.alert('Error', 'Failed to refresh prices for the collection.');
            } finally {
                setRefreshingCollectionId(null);
            }
        } else {
            // Placeholder for MTG price refresh if needed in the future
            console.log(`[SetCompletionScreen] Price refresh requested for MTG collection: ${collectionId} (not yet implemented)`);
        }
    }, [loadCollections]);

    const handleDeleteSelectedCollections = useCallback(async () => {
        if (selectedCollectionIds.size === 0) {
            Alert.alert("No Collections Selected", "Please select collections to delete.");
            return;
        }

        const selectedNames = allCollections
            .filter(col => selectedCollectionIds.has(col.id))
            .map(col => col.name)
            .join(', ');

        Alert.alert(
            'Delete Selected Collections',
            `Are you sure you want to delete ${selectedCollectionIds.size} collection(s): ${selectedNames}? This action cannot be undone.`,
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
                            const deletePromises = Array.from(selectedCollectionIds).map(id => {
                                const col = allCollections.find(c => c.id === id);
                                return col?.type === 'MTG'
                                    ? databaseService.deleteCollection(id)
                                    : deleteLorcanaCollection(id);
                            });
                            await Promise.all(deletePromises);
                            Alert.alert('Success', `${selectedCollectionIds.size} collection(s) deleted successfully.`);
                            setSelectedCollectionIds(new Set());
                            setIsSelectionModeActive(false);
                            await loadCollections(true);
                        } catch (error) {
                            console.error('Error deleting selected collections:', error);
                            Alert.alert('Error', 'Failed to delete selected collections.');
                        }
                    }
                }
            ]
        );
    }, [selectedCollectionIds, allCollections, loadCollections]);

    const keyExtractor = useCallback((item: SetCollection & { type: string }) => item.id, []);

    const getItemLayout = useCallback((_: any, index: number) => ({
        length: 92,
        offset: 92 * index,
        index,
    }), []);

    const handleSetPressNavigation = useCallback((item: SetCollection & { type: string }) => {
        navigation.navigate('CollectionDetails', {
            collectionId: item.id,
            title: item.name,
        });
    }, [navigation]);

    const handleToggleSelectionLogic = useCallback((collectionId: string) => {
        setSelectedCollectionIds(prevSelectedIds => {
            const newSelectedIds = new Set(prevSelectedIds);
            if (newSelectedIds.has(collectionId)) {
                newSelectedIds.delete(collectionId);
            } else {
                newSelectedIds.add(collectionId);
            }

            // If no items are selected anymore, deactivate selection mode
            if (newSelectedIds.size === 0) {
                setIsSelectionModeActive(false);
            } else if (!isSelectionModeActive && newSelectedIds.size > 0) {
                // If selection mode wasn't active but now we have a selection, activate it.
                // This covers the initial long press.
                setIsSelectionModeActive(true);
            }
            return newSelectedIds;
        });
    }, [isSelectionModeActive]);

    const handleItemInteraction = useCallback((item: SetCollection & { type: string }, isLongPress: boolean) => {
        if (isLongPress) {
            if (!isSelectionModeActive) {
                setIsSelectionModeActive(true); // Activate selection mode on first long press
            }
            handleToggleSelectionLogic(item.id);
        } else { // Is a regular tap
            if (isSelectionModeActive) {
                handleToggleSelectionLogic(item.id); // Tap toggles selection if mode is active
            } else {
                handleSetPressNavigation(item); // Navigate if mode is not active
            }
        }
    }, [isSelectionModeActive, handleToggleSelectionLogic, handleSetPressNavigation]);

    const renderSetItem = useCallback(({ item }: { item: SetCollection & { type: string } }) => (
        <SetItem 
            item={item} 
            onPress={(item) => handleItemInteraction(item, false)}
            onLongPress={(item) => handleItemInteraction(item, true)}
            onRefreshPrices={handleRefreshPrices}
            isRefreshing={refreshingCollectionId === item.id}
            isSelected={selectedCollectionIds.has(item.id)}
            isSelectionModeActive={isSelectionModeActive}
        />
    ), [handleItemInteraction, handleRefreshPrices, refreshingCollectionId, selectedCollectionIds, isSelectionModeActive]);

    const EmptyComponent = useMemo(() => (
        <View style={styles.emptyContainer}>
            <Icon name="cards-outline" size={64} color={theme.iconSecondary} />
            <Text style={styles.emptyText}>No Sets Found</Text>
            <Text style={styles.emptySubtext}>
                Scan cards to start tracking set completion
            </Text>
        </View>
    ), [theme, styles]);

    // Effects — focus listener fires on initial mount too, so no separate initial-load effect needed
    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadCollections(true);
        });

        return unsubscribe;
    }, [navigation, loadCollections]);

    // Add listener for collection import/update events
    useEffect(() => {
        const handleCollectionsUpdated = () => {
            loadCollections(true);
        };

        // Add event listener and store the subscription
        const subscription = collectionEventEmitter.addListener('collectionsUpdated', handleCollectionsUpdated);

        // Cleanup function
        return () => {
            subscription.remove(); // Use remove() instead of removeListener
        };
    }, [loadCollections]);

    const handleImportCollection = async () => {
        try {
            const results: DocumentPickerResponse[] = await DocumentPickerPick({
                type: [DocumentPickerTypes.allFiles],
                allowMultiSelection: false,
                mode: 'import',
            });

            const result = results?.[0] ?? null;
            if (!result?.uri) return;

            let filePath = result.uri;
            if (Platform.OS === 'android' && filePath.startsWith('content://') && result.name) {
                const destPath = `${RNFS.CachesDirectoryPath}/${result.name}`;
                await RNFS.copyFile(filePath, destPath);
                filePath = destPath;
            }

            await exportService.importLorcanaCollections(filePath);
        } catch (error) {
            if (isDocumentPickerErrorWithCode(error) && error.code === DocumentPickerErrorCodes.OPERATION_CANCELED) {
                return;
            }
            console.error('[SetCompletionScreen] Error importing collection:', error);
            Alert.alert('Import Error', 'Failed to import collections. Please try again.');
        }
    };

    const handleRefreshData = useCallback(async () => {
        try {
            setLoadingMtg(true);
            setLoadingLorcana(true);
            const result = await safeRefreshLorcanaCards();
            await loadCollections(true);
            Alert.alert(
                'Success',
                `Collection data refreshed successfully!\nUpdated: ${result.updated} cards\nAdded: ${result.added} new cards`,
                [{ text: 'OK' }]
            );
        } catch (error) {
            console.error('Error refreshing Lorcana data:', error);
            Alert.alert('Error', 'Failed to refresh Lorcana database');
        }
    }, [loadCollections]);

    const hasSelectedItems = selectedCollectionIds.size > 0;

    const handleCancelSelectionMode = () => {
        setSelectedCollectionIds(new Set());
        setIsSelectionModeActive(false);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Set Completion</Text>
                <View style={styles.headerButtons}>
                    {isSelectionModeActive ? (
                        <>
                            {hasSelectedItems && (
                                <TouchableOpacity
                                    style={[styles.headerButton, styles.deleteSelectedButton]}
                                    onPress={handleDeleteSelectedCollections} 
                                >
                                    <Icon name="delete-sweep" size={24} color={'#FFFFFF'} />
                                    <Text style={[styles.buttonText, styles.deleteSelectedButtonText]}>Delete</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={styles.headerButton}
                                onPress={handleCancelSelectionMode}
                            >
                                <Icon name="close-circle-outline" size={24} color={theme.primary} />
                                <Text style={styles.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TouchableOpacity
                                style={styles.headerButton}
                                onPress={handleImportCollection}
                            >
                                <Icon name="file-import" size={24} color={theme.primary} />
                                <Text style={styles.buttonText}>Import</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.headerButton}
                                onPress={handleRefreshData}
                            >
                                <Icon name="refresh" size={24} color={theme.primary} />
                                <Text style={styles.buttonText}>Refresh</Text>
                            </TouchableOpacity>
                        </>
                    )}
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

// Define styles
const createStyles = (theme: Theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.text,
    },
    listContainer: {
        padding: 16,
    },
    setItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: theme.text,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    selectedSetItem: {
        backgroundColor: theme.surface,
        borderColor: theme.primary,
        borderWidth: 1,
    },
    selectionIndicatorContainer: {
        width: 0,
        
    },
    setIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.background,
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
        color: theme.text,
        marginBottom: 4,
    },
    progressContainer: {
        marginTop: 4,
    },
    progressBar: {
        height: 4,
        backgroundColor: theme.border,
        borderRadius: 2,
        marginBottom: 4,
    },
    progressFill: {
        height: '100%',
        backgroundColor: theme.primary,
        borderRadius: 2,
    },
    progressText: {
        fontSize: 12,
        color: theme.textSecondary,
    },
    setStats: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    statsText: {
        fontSize: 14,
        color: theme.textSecondary,
        marginRight: 8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.background,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: theme.textSecondary,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: theme.background,
    },
    emptyText: {
        fontSize: 20,
        fontWeight: '600',
        color: theme.text,
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 16,
        color: theme.textSecondary,
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
    deleteSelectedButton: {
        backgroundColor: theme.error,
        borderColor: theme.error,
    },
    deleteSelectedButtonText: {
        color: '#FFFFFF',
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
        borderColor: theme.border,
        backgroundColor: theme.surface,
        marginLeft: 8,
    },
    buttonText: {
        color: theme.primary,
        marginLeft: 4,
        fontSize: 14,
        fontWeight: '500',
    },
    refreshButton: {
        padding: 8,
        marginRight: 4,
    },
});

export default SetCompletionScreen;
