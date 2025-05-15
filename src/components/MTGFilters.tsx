import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext'; // Ensure Theme type is imported
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<any>; // Type assertion for Icon

interface Filters {
    search: string;
    rarities: string[];
    colors: string[];
    collectionStatus: 'all' | 'collected' | 'missing';
    priceRange: {
        min: number | null;
        max: number | null;
    };
}

interface MTGFiltersProps {
    filters: Filters;
    onFiltersChange: (filters: Filters) => void;
    onReset: () => void;
    visible: boolean;
}

const rarityOptions = ['common', 'uncommon', 'rare', 'mythic'];
const colorOptions = ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless', 'Multicolor'];
const collectionStatusOptions: { label: string; value: 'all' | 'collected' | 'missing' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Collected', value: 'collected' },
    { label: 'Missing', value: 'missing' },
];


const MTGFilters: React.FC<MTGFiltersProps> = ({ filters, onFiltersChange, onReset, visible }) => {
    const { theme } = useTheme();
    const styles = useStyles(theme);

    if (!visible) {
        return null;
    }

    const handleSearchChange = (text: string) => {
        onFiltersChange({ ...filters, search: text });
    };

    const toggleRarity = (rarity: string) => {
        const newRarities = filters.rarities.includes(rarity)
            ? filters.rarities.filter(r => r !== rarity)
            : [...filters.rarities, rarity];
        onFiltersChange({ ...filters, rarities: newRarities });
    };

    const toggleColor = (color: string) => {
        const newColors = filters.colors.includes(color)
            ? filters.colors.filter(c => c !== color)
            : [...filters.colors, color];
        onFiltersChange({ ...filters, colors: newColors });
    };

    const handleCollectionStatusChange = (status: 'all' | 'collected' | 'missing') => {
        onFiltersChange({ ...filters, collectionStatus: status });
    };
    
    const handlePriceRangeChange = (type: 'min' | 'max', value: string) => {
        const numericValue = value === '' ? null : parseFloat(value);
        if (numericValue !== null && isNaN(numericValue)) return; // Prevent NaN

        onFiltersChange({
            ...filters,
            priceRange: {
                ...filters.priceRange,
                [type]: numericValue,
            },
        });
    };


    return (
        <View style={styles.container}>
            <TextInput
                style={styles.searchInput}
                placeholder="Search cards..."
                placeholderTextColor={theme.muted || theme.textSecondary}
                value={filters.search}
                onChangeText={handleSearchChange}
            />

            <Text style={styles.label}>Rarity:</Text>
            <View style={styles.optionsContainer}>
                {rarityOptions.map(rarity => (
                    <TouchableOpacity
                        key={rarity}
                        style={[
                            styles.optionButton,
                            filters.rarities.includes(rarity) && styles.optionButtonSelected,
                        ]}
                        onPress={() => toggleRarity(rarity)}
                    >
                        <Text style={[styles.optionText, filters.rarities.includes(rarity) && styles.optionTextSelected]}>{rarity}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>Color:</Text>
            <View style={styles.optionsContainer}>
                {colorOptions.map(color => (
                    <TouchableOpacity
                        key={color}
                        style={[
                            styles.optionButton,
                            filters.colors.includes(color) && styles.optionButtonSelected,
                        ]}
                        onPress={() => toggleColor(color)}
                    >
                        <Text style={[styles.optionText, filters.colors.includes(color) && styles.optionTextSelected]}>{color}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>Collection Status:</Text>
            <View style={styles.optionsContainer}>
                {collectionStatusOptions.map(option => (
                    <TouchableOpacity
                        key={option.value}
                        style={[
                            styles.optionButton,
                            filters.collectionStatus === option.value && styles.optionButtonSelected,
                        ]}
                        onPress={() => handleCollectionStatusChange(option.value)}
                    >
                        <Text style={[styles.optionText, filters.collectionStatus === option.value && styles.optionTextSelected]}>{option.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            
            <Text style={styles.label}>Price Range:</Text>
            <View style={styles.priceRangeContainer}>
                <TextInput
                    style={styles.priceInput}
                    placeholder="Min"
                    placeholderTextColor={theme.muted || theme.textSecondary}
                    value={filters.priceRange.min === null ? '' : String(filters.priceRange.min)}
                    onChangeText={value => handlePriceRangeChange('min', value)}
                    keyboardType="numeric"
                />
                <Text style={styles.priceSeparator}>-</Text>
                <TextInput
                    style={styles.priceInput}
                    placeholder="Max"
                    placeholderTextColor={theme.muted || theme.textSecondary}
                    value={filters.priceRange.max === null ? '' : String(filters.priceRange.max)}
                    onChangeText={value => handlePriceRangeChange('max', value)}
                    keyboardType="numeric"
                />
            </View>


            <TouchableOpacity style={styles.resetButton} onPress={onReset}>
                <Text style={styles.resetButtonText}>Reset Filters</Text>
            </TouchableOpacity>
        </View>
    );
};

const useStyles = (theme: Theme) => StyleSheet.create({
    container: {
        padding: 10,
        backgroundColor: theme.card,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    searchInput: {
        height: 40,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 5,
        paddingHorizontal: 10,
        marginBottom: 10,
        color: theme.text,
        backgroundColor: theme.input || theme.surface,
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.text,
        marginTop: 10,
        marginBottom: 5,
    },
    optionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10,
    },
    optionButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.border,
        marginRight: 8,
        marginBottom: 8,
    },
    optionButtonSelected: {
        backgroundColor: theme.primary,
        borderColor: theme.primary,
    },
    optionText: {
        color: theme.text,
    },
    optionTextSelected: {
        color: theme.card, // Or a contrasting color for selected text
    },
    resetButton: {
        backgroundColor: theme.error,
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
        marginTop: 10,
    },
    resetButtonText: {
        color: '#fff', // Ensure contrast with error background
        fontWeight: 'bold',
    },
    priceRangeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    priceInput: {
        flex: 1,
        height: 40,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 5,
        paddingHorizontal: 10,
        color: theme.text,
        backgroundColor: theme.input || theme.surface,
    },
    priceSeparator: {
        marginHorizontal: 10,
        fontSize: 16,
        color: theme.text,
    },
});

export default MTGFilters; 