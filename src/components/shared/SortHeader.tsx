import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { SortOption, SortDirection } from '../../hooks/useLorcanaFilters';
import { useTheme } from '../../context/ThemeContext';

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
}

const SortHeader: React.FC<SortHeaderProps> = ({
    sortBy,
    sortDirection,
    onSortChange,
    onFilterPress
    }) => {
    const { theme } = useTheme();

    return (
        <View style={[styles.header, { backgroundColor: theme.surface }]}>
            <View style={styles.filterButtonContainer}>
                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: theme.surface }]}
                    onPress={onFilterPress}
                >
                    <Icon name="filter-variant" size={24} color={theme.primary} />
                    <Text style={[styles.buttonText, { color: theme.primary }]}>Filter</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.sortContainer}>
                <View style={styles.sortButtonContainer}>
                    <TouchableOpacity
                        style={[styles.sortButton, sortBy === 'name' && styles.sortButtonActive]}
                        onPress={() => onSortChange('name')}
                    >
                        <Icon
                            name="order-alphabetical-ascending"
                            size={24}
                            color={sortBy === 'name' ? theme.primary : theme.text}
                        />
                        <Text style={[styles.sortButtonText, sortBy === 'name' && styles.sortButtonTextActive]}>
                            Name
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.sortButtonContainer}>
                    <TouchableOpacity
                        style={[styles.sortButton, sortBy === 'price' && styles.sortButtonActive]}
                        onPress={() => onSortChange('price')}
                    >
                        <Icon
                            name="currency-usd"
                            size={24}
                            color={sortBy === 'price' ? theme.primary : theme.text}
                        />
                        <Text style={[styles.sortButtonText, sortBy === 'price' && styles.sortButtonTextActive]}>
                            Price
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.sortButtonContainer}>
                    <TouchableOpacity
                        style={[styles.sortButton, sortBy === 'number' && styles.sortButtonActive]}
                        onPress={() => onSortChange('number')}
                    >
                        <Icon
                            name="order-numeric-ascending"
                            size={24}
                            color={sortBy === 'number' ? theme.primary : theme.text}
                        />
                        <Text style={[styles.sortButtonText, sortBy === 'number' && styles.sortButtonTextActive]}>
                            Number
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.sortButtonContainer}>
                    <TouchableOpacity
                        style={styles.sortButton}
                        onPress={() => onSortChange(sortBy)}
                    >
                        <Icon
                            name={sortDirection === 'asc' ? 'sort-ascending' : 'sort-descending'}
                            size={24}
                            color={theme.primary}
                        />
                        <Text style={[styles.sortButtonText, { color: theme.primary }]}>
                            {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({ 
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    filterButtonContainer: {
        alignItems: 'center',
    },
    filterButton: {
        flexDirection: 'column',
        alignItems: 'center',
        padding: 8,
        borderRadius: 4,
        gap: 2,
    },
    buttonText: {
        fontSize: 10,
        color: '#2196F3',   
        marginTop: 2,
    },
    sortContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sortButtonContainer: {
        alignItems: 'center',
    },
    sortButton: {
        flexDirection: 'column',
        alignItems: 'center',
        padding: 8,
        borderRadius: 4,
        gap: 2,
    },
    sortButtonActive: {
        backgroundColor: '#e3f2fd',
    },
    sortButtonText: {
        fontSize: 10,
        color: '#666',
        marginTop: 2,
    },
    sortButtonTextActive: {
        color: '#2196F3',
        fontWeight: '500',
    },
});

export default SortHeader; 