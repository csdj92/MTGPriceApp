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
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as any;
import {
    forceRefreshAllLorcanaCards,
    getLorcanaCards,
} from '../../services/LorcanaService';
import { useTheme } from '../../context/ThemeContext';
import { imageCacheService, type DownloadProgress, type CacheStats } from '../../services/ImageCacheService';


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
    const [isImportingCards, setIsImportingCards] = useState(false);
    const [importProgress, setImportProgress] = useState<string>('');
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

    const handleImportAllLorcanaCards = async () => {
        console.log('[Settings] ========================================');
        console.log('[Settings] IMPORT STARTED - handleImportAllLorcanaCards called');
        console.log('[Settings] ========================================');

        Alert.alert(
            'Force Refresh All Lorcana Cards',
            'This will re-pull every Lorcana set from the API and overwrite existing card data in the database, including colors, text, and images. This may take a few minutes. Continue?',
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
                            console.log('[Settings] Calling forceRefreshAllLorcanaCards...');

                            const result = await forceRefreshAllLorcanaCards((progress) => {
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
                    icon="cloud-download"
                    title="Force Refresh All Lorcana Cards"
                    subtitle="Re-pull all sets and overwrite existing card data"
                    onPress={handleImportAllLorcanaCards}
                />
                {isImportingCards && (
                    <View style={[styles.rebuildingContainer, { backgroundColor: theme.background }]}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.rebuildingText, { color: theme.textSecondary }]}>{importProgress || 'Importing cards...'}</Text>
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
