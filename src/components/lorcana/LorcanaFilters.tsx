import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';

export interface Filters {
    search: string;
    rarities: string[];
    colors: string[];
    collectionStatus: 'all' | 'collected' | 'missing';
    priceRange: {
        min: number | null;
        max: number | null;
    };
}

interface LorcanaFiltersProps {
    filters: Filters;
    onFiltersChange: (newFilters: Filters) => void;
    onReset: () => void;
    visible: boolean;
}

const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Enchanted'];
const colorOptions = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];

const LorcanaFilters: React.FC<LorcanaFiltersProps> = ({
    filters,
    onFiltersChange,
    onReset,
    visible
}) => {
    if (!visible) return null;

    return (
        <View style={styles.filtersPanel}>
            <TextInput
                style={styles.searchInput}
                placeholder="Search cards..."
                value={filters.search}
                onChangeText={text => onFiltersChange({ ...filters, search: text })}
            />
            
            <View style={styles.filterSection}>
                <Text style={styles.filterTitle}>Collection Status</Text>
                <View style={styles.filterOptions}>
                    {(['all', 'collected', 'missing'] as const).map(status => (
                        <TouchableOpacity
                            key={status}
                            style={[
                                styles.filterChip,
                                filters.collectionStatus === status && styles.filterChipSelected
                            ]}
                            onPress={() => onFiltersChange({
                                ...filters,
                                collectionStatus: status
                            })}
                        >
                            <Text style={[
                                styles.filterChipText,
                                filters.collectionStatus === status && styles.filterChipTextSelected
                            ]}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                                {status === 'all' ? ' Cards' : ''}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.filterSection}>
                <Text style={styles.filterTitle}>Rarity</Text>
                <View style={styles.filterOptions}>
                    {rarityOptions.map(rarity => (
                        <TouchableOpacity
                            key={rarity}
                            style={[
                                styles.filterChip,
                                filters.rarities.includes(rarity) && styles.filterChipSelected
                            ]}
                            onPress={() => onFiltersChange({
                                ...filters,
                                rarities: filters.rarities.includes(rarity)
                                    ? filters.rarities.filter(r => r !== rarity)
                                    : [...filters.rarities, rarity]
                            })}
                        >
                            <Text style={[
                                styles.filterChipText,
                                filters.rarities.includes(rarity) && styles.filterChipTextSelected
                            ]}>{rarity}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.filterSection}>
                <Text style={styles.filterTitle}>Color</Text>
                <View style={styles.filterOptions}>
                    {colorOptions.map(color => (
                        <TouchableOpacity
                            key={color}
                            style={[
                                styles.filterChip,
                                filters.colors.includes(color) && styles.filterChipSelected
                            ]}
                            onPress={() => onFiltersChange({
                                ...filters,
                                colors: filters.colors.includes(color)
                                    ? filters.colors.filter(c => c !== color)
                                    : [...filters.colors, color]
                            })}
                        >
                            <Text style={[
                                styles.filterChipText,
                                filters.colors.includes(color) && styles.filterChipTextSelected
                            ]}>{color}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <TouchableOpacity
                style={styles.resetButton}
                onPress={onReset}
            >
                <Text style={styles.resetButtonText}>Reset Filters</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    filtersPanel: {
        backgroundColor: 'white',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    searchInput: {
        height: 40,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 4,
        paddingHorizontal: 8,
        marginBottom: 16,
    },
    filterSection: {
        marginBottom: 16,
    },
    filterTitle: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
    },
    filterOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        backgroundColor: 'white',
    },
    filterChipSelected: {
        backgroundColor: '#2196F3',
        borderColor: '#2196F3',
    },
    filterChipText: {
        color: '#666',
    },
    filterChipTextSelected: {
        color: 'white',
    },
    resetButton: {
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 4,
        backgroundColor: '#f44336',
    },
    resetButtonText: {
        color: 'white',
        fontWeight: '500',
    },
});

export default LorcanaFilters; 