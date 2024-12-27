import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    Switch,
    ScrollView,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

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

    const handleBackup = () => {
        // TODO: Implement backup functionality
        Alert.alert('Coming Soon', 'Backup functionality will be available in a future update.');
    };

    const handleRestore = () => {
        // TODO: Implement restore functionality
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
});

export default SettingsScreen; 