import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { SortOption, SortDirection } from '../../hooks/useLorcanaFilters';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import type { Theme } from '../../context/ThemeContext';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;

interface SortHeaderProps {
    sortBy: SortOption;
    sortDirection: SortDirection;
    onSortChange: (option: SortOption) => void;
    onFilterPress: () => void;
    onExportPress?: () => void;
    showExportButton?: boolean;
    cardCount?: number;
    totalValue?: string;
    showStats?: boolean;
}

const sortOptionsConfig: { label: string; value: SortOption }[] = [
    { label: 'Name', value: 'name' },
    { label: 'Price', value: 'price' },
    { label: 'Number', value: 'number' },
];

const SortHeader: React.FC<SortHeaderProps> = ({
    sortBy,
    sortDirection,
    onSortChange,
    onFilterPress,
    onExportPress,
    showExportButton,
    cardCount,
    totalValue,
    showStats
}) => {
    const styles = useStyles();
    const { theme } = useTheme();

    const directionIcon = sortDirection === 'asc' ? 'arrow-up' : 'arrow-down';

    return (
        <View style={styles.header}>
            <View style={styles.leftControls}>
                {showStats && (
                    <View style={styles.statsContainer}>
                        <Text style={styles.statsText}>{cardCount} cards</Text>
                        <Text style={[styles.statsText, styles.statsSeparator]}>·</Text>
                        <Text style={styles.statsText}>${totalValue}</Text>
                    </View>
                )}
                <TouchableOpacity
                    style={styles.controlButton}
                    onPress={onFilterPress}
                >
                    <Icon name="filter-variant" size={20} color={theme.primary} />
                    <Text style={styles.buttonText}>Filter</Text>
                </TouchableOpacity>
                {showExportButton && onExportPress && (
                    <TouchableOpacity
                        style={styles.controlButton}
                        onPress={onExportPress}
                    >
                        <Icon name="export-variant" size={20} color={theme.primary} />
                        <Text style={styles.buttonText}>Export</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.sortControlsContainer}>
                {sortOptionsConfig.map(option => (
                    <TouchableOpacity
                        key={option.value}
                        style={[
                            styles.sortControlButton,
                            sortBy === option.value && styles.sortControlButtonActive,
                        ]}
                        onPress={() => onSortChange(option.value)}
                    >
                        <Text
                            style={[
                                styles.sortControlText,
                                sortBy === option.value && styles.sortControlTextActive,
                            ]}
                        >
                            {option.label}
                        </Text>
                        {sortBy === option.value && (
                            <Icon name={directionIcon} size={16} color={sortBy === option.value ? theme.card : theme.primary} />
                        )}
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
};

const useStyles = () => useThemedStyles((theme: Theme) => ({
    header: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        justifyContent: 'space-between' as 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: theme.surface,
    },
    leftControls: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        gap: 2,
    },
    statsContainer: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
    },
    statsText: {
        fontSize: 11,
        marginHorizontal: 1,
        color: theme.textSecondary,
    },
    statsSeparator: {
        marginLeft: 3,
        marginRight: 3,
        color: theme.textSecondary,
    },
    controlButton: {
        flexDirection: 'column' as 'column',
        alignItems: 'center' as 'center',
        paddingVertical: 2,
        paddingHorizontal: 10,
        borderRadius: 4,
        gap: 0,
        backgroundColor: theme.surface,
    },
    buttonText: {
        fontSize: 8,
        marginTop: 0,
        color: theme.primary,
    },
    sortControlsContainer: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        gap: 4,
        paddingLeft: 14,
    },
    sortControlButton: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 4,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
    },
    sortControlButtonActive: {
        backgroundColor: theme.primary,
        borderColor: theme.primary,
    },
    sortControlText: {
        fontSize: 12,
        color: theme.text,
        marginRight: 4,
    },
    sortControlTextActive: {
        color: theme.card,
        fontWeight: 'bold' as 'bold',
    },
}));

export default SortHeader; 