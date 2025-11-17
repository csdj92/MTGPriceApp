import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    Switch,
    ScrollView,
    Alert,
    ActivityIndicator,
    InteractionManager,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as any;
import { databaseService } from '../../services/DatabaseService';
import { fixCardNames, getNewSetCards, safeRefreshLorcanaCards,fixCardSetIdentifiers,deleteAllSet10Cards, updateAllLorcanaPrices,reloadLorcanaCards, fetchAndStoreEnchantedCards, cleanupDuplicateCards, clearAllLorcanaCards} from '../../services/LorcanaService';
import { cardImportService } from '../../services/CardImportService';
import { useTheme } from '../../context/ThemeContext';
import { downloadAndImportPriceData } from '../../utils/priceData';
import SQLite from 'react-native-sqlite-storage';
import { AddSetNumberToLorcanaCollections } from '../../database/migrations/002_AddSetNumberToLorcanaCollections';
import { MigrationManager } from '../../database/migrations/MigrationManager';
import { imageCacheService, type DownloadProgress, type CacheStats } from '../../services/ImageCacheService';
import { getLorcanaCards } from '../../services/LorcanaService';


interface SettingsSectionProps {
    title: string;
    children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ title, children }) => {
    const { theme } = useTheme();
    return (
        <View style={[styles.section, { backgroundColor: theme.background }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
            <View style={[styles.sectionContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>
        </View>
    );
};

interface SettingsItemProps {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    value?: boolean;
    onValueChange?: (value: boolean) => void;
}

const SettingsItem: React.FC<SettingsItemProps> = ({
    icon,
    title,
    subtitle,
    onPress,
    value,
    onValueChange,
}) => {
    const { theme } = useTheme();
    return (
        <TouchableOpacity
            style={[styles.settingsItem, { borderBottomColor: theme.borderLight }]}
            onPress={onPress}
            disabled={!onPress && !onValueChange}
        >
            <Icon name={icon} size={24} color={theme.icon} style={styles.settingsIcon} />
            <View style={styles.settingsText}>
                <Text style={[styles.settingsTitle, { color: theme.text }]}>{title}</Text>
                {subtitle && <Text style={[styles.settingsSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
            </View>
            {onValueChange && (
                <Switch
                    value={value}
                    onValueChange={onValueChange}
                    trackColor={{ false: theme.switchTrackFalse, true: theme.switchTrackTrue }}
                    thumbColor={value ? theme.switchThumbTrue : theme.switchThumbFalse}
                />
            )}
            {onPress && <Icon name="chevron-right" size={24} color={theme.iconSecondary} />}
        </TouchableOpacity>
    );
};

const SettingsScreen = () => {
    const [notifications, setNotifications] = useState(true);
    const [priceAlerts, setPriceAlerts] = useState(true);
    const { isDark, setDarkMode, theme } = useTheme();
    const [isRebuilding, setIsRebuilding] = useState(false);
    const [isFixingNames, setIsFixingNames] = useState(false);
    const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
    const [isImportingCards, setIsImportingCards] = useState(false);
    const [importProgress, setImportProgress] = useState<string>('');
    const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
    const [isClearingAllCards, setIsClearingAllCards] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [isDownloadingImages, setIsDownloadingImages] = useState(false);

    // Load cache stats on component mount
    useEffect(() => {
        loadCacheStats();
    }, []);

    const loadCacheStats = async () => {
        try {
            const stats = await imageCacheService.getCacheStats();
            setCacheStats(stats);
        } catch (error) {
            console.error('Failed to load cache stats:', error);
        }
    };

    const handleDownloadAllImages = async () => {
        Alert.alert(
            'Download All Images',
            `This will download all Lorcana card images (~100-400 MB depending on quality). Continue?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Download',
                    style: 'default',
                    onPress: async () => {
                        setIsDownloadingImages(true);
                        try {
                            const allCards = await getLorcanaCards();
                            await imageCacheService.downloadAllImages(
                                allCards,
                                (progress) => setDownloadProgress(progress)
                            );
                            Alert.alert('Success', 'All images downloaded successfully!');
                            await loadCacheStats();
                        } catch (error) {
                            console.error('Failed to download images:', error);
                            Alert.alert('Error', 'Failed to download images. Please try again.');
                        } finally {
                            setIsDownloadingImages(false);
                            setDownloadProgress(null);
                        }
                    },
                },
            ]
        );
    };

    const handleClearImageCache = async () => {
        Alert.alert(
            'Clear Image Cache',
            'This will delete all downloaded card images to free up space. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await imageCacheService.clearCache();
                            Alert.alert('Success', 'Image cache cleared successfully!');
                            await loadCacheStats();
                        } catch (error) {
                            console.error('Failed to clear cache:', error);
                            Alert.alert('Error', 'Failed to clear image cache.');
                        }
                    },
                },
            ]
        );
    };

    const handleBackup = () => {
        Alert.alert('Coming Soon', 'Backup functionality will be available in a future update.');
    };

    const handleRestore = () => {
        Alert.alert('Coming Soon', 'Restore functionality will be available in a future update.');
    };

    const handleClearData = () => {
        Alert.alert(
            'Clear All Data',
            'Are you sure you want to clear all app data? This action cannot be undone.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                        // TODO: Implement clear data functionality
                    },
                },
            ]
        );
    };

    const resyncLorcana = async () => {
        // await getNewSetCards();
        // await deleteAllSet7Cards();
        // await fixCardSetIdentifiers('7');
        await fetchAndStoreEnchantedCards();
    };

    const handleCleanupDuplicateCards = async () => {
        Alert.alert(
            'Clean Up Duplicate Cards',
            'This will remove duplicate cards that were created during import (cards with old numeric Set_ID format). This operation cannot be undone. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clean Up',
                    style: 'destructive',
                    onPress: async () => {
                        setIsCleaningDuplicates(true);
                        try {
                            const result = await cleanupDuplicateCards();
                            Alert.alert(
                                'Cleanup Complete',
                                `Removed ${result.deleted} duplicate cards.\n${result.remaining} cards remaining in database.`
                            );
                        } catch (error) {
                            console.error('Error cleaning up duplicates:', error);
                            Alert.alert('Error', 'Failed to clean up duplicate cards. Please try again.');
                        } finally {
                            setIsCleaningDuplicates(false);
                        }
                    }
                }
            ]
        );
    };

    const handleClearAllCards = async () => {
        Alert.alert(
            '⚠️ CLEAR ALL CARDS ⚠️',
            'This will PERMANENTLY DELETE ALL Lorcana cards from your database, including your collection and all card data. This operation CANNOT be undone!\n\nOnly your user-created collections will remain.\n\nAre you ABSOLUTELY sure?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'I understand - Clear Everything',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            'FINAL WARNING',
                            'This is your LAST CHANCE to cancel. All card data will be lost forever.\n\nType "DELETE" to confirm:',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Delete All Cards',
                                    style: 'destructive',
                                    onPress: async () => {
                                        setIsClearingAllCards(true);
                                        try {
                                            const result = await clearAllLorcanaCards();
                                            Alert.alert(
                                                'All Cards Cleared',
                                                `Removed ${result.cleared} cards and all related data from database.\n\nYou can now re-import cards if needed.`
                                            );
                                        } catch (error) {
                                            console.error('Error clearing all cards:', error);
                                            Alert.alert('Error', 'Failed to clear all cards. Please try again.');
                                        } finally {
                                            setIsClearingAllCards(false);
                                        }
                                    }
                                }
                            ],
                            { cancelable: false }
                        );
                    }
                }
            ],
            { cancelable: false }
        );
    };

    const handleImportAllLorcanaCards = async () => {
        console.log('[Settings] ========================================');
        console.log('[Settings] IMPORT STARTED - handleImportAllLorcanaCards called');
        console.log('[Settings] ========================================');

        Alert.alert(
            'Import All Lorcana Cards',
            'This will fetch ALL Lorcana cards from all sets including Enchanted, Epic, and Iconic rarities. This may take a few minutes. Continue?',
            [
                { text: 'Cancel', style: 'cancel', onPress: () => {
                    console.log('[Settings] User cancelled import');
                }},
                {
                    text: 'Import',
                    onPress: async () => {
                        console.log('[Settings] User confirmed import - starting...');
                        setIsImportingCards(true);
                        setImportProgress('Starting import...');

                        try {
                            console.log('[Settings] Calling cardImportService.importAllSets...');

                            const result = await cardImportService.importAllSets((progress) => {
                                const progressText = `Set ${progress.currentSet}/${progress.totalSets}: ${progress.setName}\n${progress.processedCards}/${progress.totalCards} cards`;
                                setImportProgress(progressText);
                                console.log('[Settings] ✓ Import progress:', {
                                    currentSet: progress.currentSet,
                                    totalSets: progress.totalSets,
                                    setName: progress.setName,
                                    processedCards: progress.processedCards,
                                    totalCards: progress.totalCards,
                                    addedCards: progress.addedCards,
                                    updatedCards: progress.updatedCards,
                                    skippedCards: progress.skippedCards
                                });
                            });

                            console.log('[Settings] ✓ Import completed successfully!');
                            console.log('[Settings] Final result:', {
                                success: result.success,
                                setsProcessed: result.setsProcessed,
                                totalCards: result.totalCards,
                                addedCards: result.addedCards,
                                updatedCards: result.updatedCards,
                                skippedCards: result.skippedCards,
                                errors: result.errors
                            });

                            Alert.alert(
                                'Import Complete!',
                                `${result.summary}\n\n` +
                                `Sets: ${result.setsProcessed}\n` +
                                `Added: ${result.addedCards}\n` +
                                `Updated: ${result.updatedCards}\n` +
                                `Total: ${result.totalCards} cards`,
                                [{ text: 'OK' }]
                            );
                        } catch (error) {
                            console.error('[Settings] ✖ ERROR during import:', error);
                            console.error('[Settings] Error details:', {
                                message: error instanceof Error ? error.message : String(error),
                                stack: error instanceof Error ? error.stack : 'No stack trace'
                            });
                            Alert.alert('Import Error', `Failed to import cards: ${error instanceof Error ? error.message : String(error)}`);
                        } finally {
                            console.log('[Settings] Cleanup - resetting UI state');
                            setIsImportingCards(false);
                            setImportProgress('');
                            console.log('[Settings] ========================================');
                            console.log('[Settings] IMPORT FINISHED');
                            console.log('[Settings] ========================================');
                        }
                    }
                }
            ]
        );
    };

    const handleRebuildDatabase = async () => {
        Alert.alert(
            'Rebuild Database',
            'Are you sure you want to rebuild the MTG database? This will download the latest data from MTGJson and update prices. This process may take several minutes.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Rebuild',
                    style: 'destructive',
                    onPress: () => {
                        setIsRebuilding(true);
                        InteractionManager.runAfterInteractions(async () => {
                            try {
                                // Step 1: Download MTGJson Database
                                const downloadSuccess = await databaseService.downloadMTGJsonDatabase();
                                if (!downloadSuccess) {
                                    throw new Error('Failed to download MTGJson database.');
                                }

                                // Step 2: Initialize Database Structure
                                await databaseService.initDatabase();

                                // Step 3: Force Price Data Update
                                const shouldUpdate = await databaseService.shouldUpdatePrices(true);
                                if (shouldUpdate) {
                                    await downloadAndImportPriceData((progress: number) => {
                                        console.log(`Price data download progress: ${progress}%`);
                                    }, true);
                                }

                                // Step 4: Verify Database Integrity
                                const integrityCheck = await databaseService.verifyPriceDataIntegrity();
                                if (!integrityCheck.isValid) {
                                    throw new Error('Database integrity check failed.');
                                }

                                Alert.alert('Success', 'Database has been rebuilt successfully.');
                            } catch (error: any) {
                                console.error('Error rebuilding database:', error);
                                Alert.alert('Error', error.message || 'Failed to rebuild database. Please try again.');
                            } finally {
                                setIsRebuilding(false);
                            }
                        });
                    },
                },
            ]
        );
    };

    const handleFixCardNames = async () => {
        try {
            setIsFixingNames(true);
            
            // Use InteractionManager to ensure UI remains responsive
            InteractionManager.runAfterInteractions(async () => {
                try {
                    const fixedCount = await fixCardNames();
                    
                    if (fixedCount > 0) {
                        Alert.alert(
                            'Success',
                            `Fixed ${fixedCount} cards with "Name - undefined" issue.`
                        );
                    } else {
                        Alert.alert(
                            'No Issues Found',
                            'No cards with "Name - undefined" were found in the database.'
                        );
                    }
                } catch (error) {
                    console.error('Error fixing card names:', error);
                    Alert.alert('Error', 'Failed to fix card names. Please try again.');
                } finally {
                    setIsFixingNames(false);
                }
            });
        } catch (error) {
            console.error('Error fixing card names:', error);
            setIsFixingNames(false);
            Alert.alert('Error', 'Failed to fix card names. Please try again.');
        }
    };

    const updateLorcanaSetNumbers = async () => {
        // Mapping of set codes to release numbers
        const setCodeToNumber: Record<string, number> = {
            'TFC': 1, // The First Chapter
            'ROF': 2, // Rise of the Floodborn
            'INK': 3, // Into the Inklands
            'URS': 4, // Ursula's Return
            'SSK': 5, // Shimmering Skies
            'ARI': 6, // Archazia's Island
            'AZS': 7, // Azurite Sea
            'JAF': 8, // Reign of the Jafar
            'FAB': 9, // Fabled
        };
        try {
            const db = await SQLite.openDatabase({ name: 'lorcana.db', location: 'default' });
            await db.executeSql('ALTER TABLE lorcana_collections ADD COLUMN set_number INTEGER');
            const [results] = await db.executeSql('SELECT id, description FROM lorcana_collections');
            let updated = 0;
            for (let i = 0; i < results.rows.length; i++) {
                const row = results.rows.item(i);
                if (row.description) {
                    const match = row.description.match(/\(([A-Z]{3})\)$/);
                    if (match) {
                        const setCode = match[1];
                        const setNumber = setCodeToNumber[setCode];
                        if (setNumber) {
                            await db.executeSql('UPDATE lorcana_collections SET set_number = ? WHERE id = ?', [setNumber, row.id]);
                            updated++;
                        }
                    }
                }
            }
            Alert.alert('Set Numbers Updated', `Updated set_number for ${updated} Lorcana collections.`);
        } catch (error) {
            console.error('Error updating Lorcana set numbers:', error);
            Alert.alert('Error', 'Failed to update Lorcana set numbers.');
        }
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
            <SettingsSection title="Preferences">
                <SettingsItem
                    icon="bell-outline"
                    title="Notifications"
                    subtitle="Enable push notifications"
                    value={notifications}
                    onValueChange={setNotifications}
                />
                <SettingsItem
                    icon="currency-usd"
                    title="Price Alerts"
                    subtitle="Get notified of price changes"
                    value={priceAlerts}
                    onValueChange={setPriceAlerts}
                />
                <SettingsItem
                    icon="theme-light-dark"
                    title="Dark Mode"
                    subtitle="Use dark theme"
                    value={isDark}
                    onValueChange={setDarkMode}
                />
            </SettingsSection>

            <SettingsSection title="Database Management">
                <SettingsItem
                    icon="database-refresh"
                    title="Rebuild Database"
                    subtitle="Download latest MTG data"
                    onPress={handleRebuildDatabase}
                />
                <SettingsItem
                    icon="database-refresh"
                    title="Resync Lorcana"
                    subtitle="Resync Lorcana data"
                    onPress={resyncLorcana}
                />
                <SettingsItem
                    icon="cloud-download"
                    title="Import All Lorcana Cards"
                    subtitle="Fetch all sets including Enchanted, Epic & Iconic"
                    onPress={handleImportAllLorcanaCards}
                />
                {isImportingCards && (
                    <View style={[styles.rebuildingContainer, { backgroundColor: theme.background }]}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.rebuildingText, { color: theme.textSecondary }]}>{importProgress || 'Importing cards...'}</Text>
                    </View>
                )}
                <SettingsItem
                    icon="delete-sweep"
                    title="Clean Up Duplicate Cards"
                    subtitle="Remove duplicate cards from import (old numeric format)"
                    onPress={handleCleanupDuplicateCards}
                />
                {isCleaningDuplicates && (
                    <View style={[styles.rebuildingContainer, { backgroundColor: theme.background }]}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.rebuildingText, { color: theme.textSecondary }]}>Cleaning up duplicates...</Text>
                    </View>
                )}
                <SettingsItem
                    icon="delete-alert"
                    title="Clear ALL Cards"
                    subtitle="⚠️ PERMANENTLY delete all Lorcana cards (nuclear option)"
                    onPress={handleClearAllCards}
                />
                {isClearingAllCards && (
                    <View style={[styles.rebuildingContainer, { backgroundColor: theme.background }]}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.rebuildingText, { color: theme.textSecondary }]}>Clearing all cards...</Text>
                    </View>
                )}
                <SettingsItem
                    icon="cash-sync"
                    title="Refresh Lorcana Prices"
                    subtitle="Update all Lorcana card prices"
                    onPress={async () => {
                        try {
                            setIsUpdatingPrices(true);
                            const result = await updateAllLorcanaPrices(0); // Pass 0 to force update all prices
                            Alert.alert(
                                'Price Update Complete',
                                `Updated: ${result.updated} cards\nSkipped: ${result.skipped} cards`
                            );
                        } catch (error) {
                            console.error('Error updating prices:', error);
                            Alert.alert('Error', 'Failed to update prices. Please try again.');
                        } finally {
                            setIsUpdatingPrices(false);
                        }
                    }}
                />
                {isUpdatingPrices && (
                    <View style={[styles.rebuildingContainer, { backgroundColor: theme.background }]}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.rebuildingText, { color: theme.textSecondary }]}>Updating prices...</Text>
                    </View>
                )}
                {isRebuilding && (
                    <View style={[styles.rebuildingContainer, { backgroundColor: theme.background }]}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.rebuildingText, { color: theme.textSecondary }]}>Rebuilding database...</Text>
                    </View>
                )}
                <SettingsItem
                    icon="card-text-outline"
                    title="Fix Card Names"
                    subtitle="Fix cards with 'Name - undefined' issue"
                    onPress={handleFixCardNames}
                />
                {isFixingNames && (
                    <View style={[styles.rebuildingContainer, { backgroundColor: theme.background }]}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.rebuildingText, { color: theme.textSecondary }]}>Fixing card names...</Text>
                    </View>
                )}
            </SettingsSection>

            <SettingsSection title="Data Management">
                <SettingsItem
                    icon="cloud-upload-outline"
                    title="Backup Data"
                    subtitle="Save your collection and watchlist"
                    onPress={handleBackup}
                />
                <SettingsItem
                    icon="cloud-download-outline"
                    title="Restore Data"
                    subtitle="Restore from backup"
                    onPress={handleRestore}
                />
                <SettingsItem
                    icon="delete-outline"
                    title="Clear Data"
                    subtitle="Remove all app data"
                    onPress={handleClearData}
                />
                
            </SettingsSection>

            <SettingsSection title="Lorcana Database Tools">
                <SettingsItem
                    icon="numeric"
                    title="Update Lorcana Set Numbers"
                    subtitle="Populate set_number for all Lorcana sets (release order)"
                    onPress={() => {
                        Alert.alert(
                            'Update Lorcana Set Numbers',
                            'This will update the set_number field for all Lorcana set collections. Continue?',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Update', style: 'destructive', onPress: updateLorcanaSetNumbers },
                            ]
                        );
                    }}
                />
            </SettingsSection>

            <SettingsSection title="About">
                <SettingsItem
                    icon="information-outline"
                    title="Version"
                    subtitle="1.0.0"
                />
                <SettingsItem
                    icon="help-circle-outline"
                    title="Help & Support"
                    onPress={() => {
                        // TODO: Implement help & support
                    }}
                />
                <SettingsItem
                    icon="shield-check-outline"
                    title="Privacy Policy"
                    onPress={() => {
                        // TODO: Implement privacy policy
                    }}
                />
            </SettingsSection>

            <SettingsSection title="Image Cache Management">
                {cacheStats && (
                    <View style={[styles.cacheStatsContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                        <Text style={[styles.cacheStatsTitle, { color: theme.text }]}>Cache Statistics</Text>
                        <Text style={[styles.cacheStatsText, { color: theme.textSecondary }]}>
                            Images: {cacheStats.totalImages} • Size: {cacheStats.totalSizeMB.toFixed(1)} MB
                        </Text>
                        <Text style={[styles.cacheStatsText, { color: theme.textSecondary }]}>
                            Available: {cacheStats.availableSpaceMB.toFixed(1)} MB
                        </Text>
                    </View>
                )}
                
                {downloadProgress && (
                    <View style={[styles.progressContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                        <Text style={[styles.progressTitle, { color: theme.text }]}>
                            Downloading Images...
                        </Text>
                        <Text style={[styles.progressText, { color: theme.textSecondary }]}>
                            {downloadProgress.current} / {downloadProgress.total}
                        </Text>
                        {downloadProgress.cardName && (
                            <Text style={[styles.progressText, { color: theme.textSecondary }]} numberOfLines={1}>
                                {downloadProgress.cardName}
                            </Text>
                        )}
                        <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                            <View 
                                style={[
                                    styles.progressFill, 
                                    { 
                                        backgroundColor: theme.primary,
                                        width: `${(downloadProgress.current / downloadProgress.total) * 100}%`
                                    }
                                ]} 
                            />
                        </View>
                    </View>
                )}

                <SettingsItem
                    icon="download"
                    title="Download All Images"
                    subtitle={isDownloadingImages ? "Downloading..." : "Download all Lorcana card images for offline use"}
                    onPress={isDownloadingImages ? undefined : handleDownloadAllImages}
                />
                <SettingsItem
                    icon="delete"
                    title="Clear Image Cache"
                    subtitle="Free up space by clearing downloaded images"
                    onPress={handleClearImageCache}
                />
            </SettingsSection>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    section: {
        marginTop: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginLeft: 16,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    sectionContent: {
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
    },
    settingsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    settingsIcon: {
        marginRight: 16,
    },
    settingsText: {
        flex: 1,
    },
    settingsTitle: {
        fontSize: 16,
        color: '#333',
    },
    settingsSubtitle: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    rebuildingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: '#f5f5f5',
    },
    rebuildingText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#666',
    },
    cacheStatsContainer: {
        padding: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
    },
    cacheStatsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    cacheStatsText: {
        fontSize: 14,
        color: '#666',
    },
    progressContainer: {
        padding: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
    },
    progressTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    progressText: {
        fontSize: 14,
        color: '#666',
    },
    progressBar: {
        height: 20,
        backgroundColor: '#e0e0e0',
        borderRadius: 10,
        marginTop: 8,
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        borderRadius: 10,
    },
});

export default SettingsScreen; 