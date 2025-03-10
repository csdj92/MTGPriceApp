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
import { fixCardNames, getNewSetCards, safeRefreshLorcanaCards,fixCardSetIdentifiers,deleteAllSet7Cards} from '../../services/LorcanaService';
import { useTheme } from '../../context/ThemeContext';
import { downloadAndImportPriceData } from '../../utils/priceData';


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
        await deleteAllSet7Cards();
        // await fixCardSetIdentifiers('7');
        
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
});

export default SettingsScreen; 