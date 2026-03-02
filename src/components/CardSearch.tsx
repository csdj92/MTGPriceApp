import React, { useState, useCallback } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import * as LorcanaService from '../services/LorcanaService';
import debounce from 'lodash/debounce';
import LorcanaCardList from './LorcanaCardList';
import { useTheme } from '../context/ThemeContext';

interface CardSearchProps {
    onCardSelect?: (card: any) => void;
    onSearchComplete?: (cards: any[]) => void;
    onAddToCollection?: (card: any) => void;
    placeholder?: string;
    autoFocus?: boolean;
    showResults?: boolean;
    debounceMs?: number;
    minSearchLength?: number;
}

const CardSearch: React.FC<CardSearchProps> = ({
    onCardSelect,
    onSearchComplete,
    onAddToCollection,
    placeholder = 'Search Lorcana cards...',
    autoFocus = false,
    showResults = true,
    debounceMs = 500,
    minSearchLength = 3,
}) => {
    const { theme } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);

    const performSearch = async (query: string) => {
        if (!query.trim() || query.length < minSearchLength) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const cards = await LorcanaService.searchLorcanaCards(query);
            setSearchResults(cards);
            onSearchComplete?.(cards);
        } catch (error) {
            console.error('Error searching Lorcana cards:', error);
            setSearchResults([]);
            onSearchComplete?.([]);
        } finally {
            setIsLoading(false);
        }
    };

    const debouncedSearch = useCallback(
        debounce(performSearch, debounceMs),
        [debounceMs]
    );

    const handleQueryChange = (text: string) => {
        setSearchQuery(text);
        if (text.length >= minSearchLength) {
            debouncedSearch(text);
        } else {
            setSearchResults([]);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Icon name="magnify" size={24} color={theme.textSecondary} style={styles.searchIcon} />
                <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder={placeholder}
                    placeholderTextColor={theme.textSecondary}
                    value={searchQuery}
                    onChangeText={handleQueryChange}
                    autoFocus={autoFocus}
                    autoCorrect={false}
                    autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                        <Icon name="close-circle" size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>

            {isLoading && (
                <ActivityIndicator style={styles.loader} size="small" color={theme.primary} />
            )}

            <View style={[styles.resultsContainer, { backgroundColor: theme.surface }]}>
                {showResults && searchResults.length > 0 && (
                    <LorcanaCardList
                        cards={searchResults}
                        isLoading={isLoading}
                        onCardPress={onCardSelect}
                        onAddToCollection={onAddToCollection}
                    />
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 8,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginBottom: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
    },
    searchIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        fontSize: 16,
        height: 44,
    },
    clearButton: {
        padding: 4,
    },
    loader: {
        marginVertical: 8,
    },
    resultsContainer: {
        flex: 1,
        borderRadius: 10,
        overflow: 'hidden',
    },
});

export default CardSearch;
