import React, { useState } from 'react';
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { databaseService } from '../../services/DatabaseService';

interface SettingsSectionProps {
    title: string;
    children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ title, children }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionContent}>{children}</View>
    </View>
);

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
}) => (
    <TouchableOpacity
        style={styles.settingsItem}
        onPress={onPress}
        disabled={!onPress && !onValueChange}
    >
        <Icon name={icon} size={24} color="#666" style={styles.settingsIcon} />
        <View style={styles.settingsText}>
            <Text style={styles.settingsTitle}>{title}</Text>
            {subtitle && <Text style={styles.settingsSubtitle}>{subtitle}</Text>}
        </View>
        {onValueChange && (
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: '#ddd', true: '#81c784' }}
                thumbColor={value ? '#4caf50' : '#f5f5f5'}
            />
        )}
        {onPress && <Icon name="chevron-right" size={24} color="#ccc" />}
    </TouchableOpacity>
);

const SettingsScreen = () => {
    const [notifications, setNotifications] = useState(true);
    const [priceAlerts, setPriceAlerts] = useState(true);
    const [darkMode, setDarkMode] = useState(false);
    const [isRebuilding, setIsRebuilding] = useState(false);

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

    const handleRebuildDatabase = async () => {
        Alert.alert(
            'Rebuild Database',
            'Are you sure you want to rebuild the MTG database? This will download the latest data from MTGJson. This process may take several minutes.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Rebuild',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsRebuilding(true);
                            await databaseService.downloadMTGJsonDatabase();
                            await databaseService.updatePrices({});
                            Alert.alert('Success', 'Database has been rebuilt successfully.');
                        } catch (error) {
                            console.error('Error rebuilding database:', error);
                            Alert.alert('Error', 'Failed to rebuild database. Please try again.');
                        } finally {
                            setIsRebuilding(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <ScrollView style={styles.container}>
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
                    value={darkMode}
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
                {isRebuilding && (
                    <View style={styles.rebuildingContainer}>
                        <ActivityIndicator size="small" color="#2196F3" />
                        <Text style={styles.rebuildingText}>Rebuilding database...</Text>
                    </View>
                )}
                <SettingsItem
                    icon="database-import"
                    title="Load Card Hashes"
                    subtitle="Load precomputed card image hashes"
                    onPress={async () => {
                        try {
                            Alert.alert(
                                'Load Card Hashes',
                                'Are you sure you want to load the precomputed card image hashes? This will replace any existing hashes.',
                                [
                                    {
                                        text: 'Cancel',
                                        style: 'cancel',
                                    },
                                    {
                                        text: 'Load',
                                        onPress: async () => {
                                            try {
                                                await databaseService.preloadHashes();
                                                Alert.alert('Success', 'Card hashes have been loaded successfully.');
                                            } catch (error) {
                                                console.error('Error loading hashes:', error);
                                                Alert.alert('Error', 'Failed to load card hashes. Please try again.');
                                            }
                                        },
                                    },
                                ]
                            );
                        } catch (error) {
                            console.error('Error loading hashes:', error);
                            Alert.alert('Error', 'Failed to load card hashes. Please try again.');
                        }
                    }}
                />
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