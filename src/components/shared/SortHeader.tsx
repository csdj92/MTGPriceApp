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
    style?: any;
}>;

interface SortHeaderProps {
    sortBy: SortOption;
    sortDirection: SortDirection;
    onSortChange: (option: SortOption) => void;
    cardCount?: number;
    totalValue?: string;
    showStats?: boolean;
}

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
    { label: 'Name',   value: 'name'   },
    { label: 'Price',  value: 'price'  },
    { label: 'Number', value: 'number' },
];

const SortHeader: React.FC<SortHeaderProps> = ({
    sortBy,
    sortDirection,
    onSortChange,
    cardCount,
    totalValue,
    showStats,
}) => {
    const styles = useStyles();
    const { theme } = useTheme();

    const directionIcon = sortDirection === 'asc' ? 'arrow-up' : 'arrow-down';

    return (
        <View style={styles.wrapper}>
            {/* Stats pill (left) + Sort tabs (right) — single row */}
            <View style={styles.row}>
                {showStats ? (
                    <View style={styles.statsChip}>
                        <Icon name="cards-outline" size={14} color={theme.textSecondary} />
                        <Text style={styles.statsCount}>{cardCount}</Text>
                        <Text style={styles.statsLabel}> cards</Text>
                        <View style={styles.statsDivider} />
                        <Icon name="currency-usd" size={14} color={theme.primary} />
                        <Text style={styles.statsValue}>{totalValue}</Text>
                    </View>
                ) : (
                    <View />
                )}

                {/* Segmented sort control */}
                <View style={styles.sortTabs}>
                    {SORT_OPTIONS.map((opt, i) => {
                        const isActive = sortBy === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.value}
                                style={[
                                    styles.sortTab,
                                    i < SORT_OPTIONS.length - 1 && styles.sortTabBorder,
                                    isActive && styles.sortTabActive,
                                ]}
                                onPress={() => onSortChange(opt.value)}
                                activeOpacity={0.75}
                            >
                                <Text style={[styles.sortTabText, isActive && styles.sortTabTextActive]}>
                                    {opt.label}
                                </Text>
                                {isActive && (
                                    <Icon
                                        name={directionIcon}
                                        size={11}
                                        color="#fff"
                                    />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>
    );
};

const useStyles = () => useThemedStyles((theme: Theme) => ({
    wrapper: {
        backgroundColor: theme.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.border,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },

    row: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        justifyContent: 'space-between' as 'space-between',
        gap: 12,
    },

    // ── Stats pill ──
    statsChip: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        gap: 5,
        backgroundColor: theme.background,
        borderRadius: 24,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.border,
    },
    statsCount: {
        fontSize: 15,
        fontWeight: '700' as '700',
        color: theme.text,
        letterSpacing: -0.3,
    },
    statsLabel: {
        fontSize: 12,
        fontWeight: '400' as '400',
        color: theme.textSecondary,
    },
    statsDivider: {
        width: 1,
        height: 14,
        backgroundColor: theme.border,
        marginHorizontal: 3,
    },
    statsValue: {
        fontSize: 15,
        fontWeight: '800' as '800',
        color: theme.primary,
        letterSpacing: -0.3,
    },

    // ── Sort segmented control ──
    sortTabs: {
        flexDirection: 'row' as 'row',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden' as 'hidden',
    },
    sortTab: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        justifyContent: 'center' as 'center',
        paddingVertical: 8,
        paddingHorizontal: 14,
        gap: 4,
    },
    sortTabBorder: {
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: theme.border,
    },
    sortTabActive: {
        backgroundColor: theme.primary,
    },
    sortTabText: {
        fontSize: 12,
        fontWeight: '500' as '500',
        color: theme.textSecondary,
    },
    sortTabTextActive: {
        color: '#fff',
        fontWeight: '700' as '700',
    },
}));

export default SortHeader;
