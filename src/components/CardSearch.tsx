import React, { useState, useCallback } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { scryfallService } from '../services/ScryfallService';
import type { ExtendedCard } from '../types/card';
import debounce from 'lodash/debounce';
import CardList from './CardList';

interface CardSearchProps {
    onCardSelect?: (card: ExtendedCard) => void;
    onSearchComplete?: (cards: ExtendedCard[]) => void;
    onAddToCollection?: (card: ExtendedCard) => void;
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
    placeholder = 'Search cards...',
    autoFocus = false,
    showResults = true,
    debounceMs = 500,
    minSearchLength = 3,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<ExtendedCard[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const performSearch = async (query: string) => {
        if (!query.trim() || query.length < minSearchLength) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const { data, hasMore } = await scryfallService.searchCards(query);
            const expandedCards = data.map(card => ({ ...card, isExpanded: true }));
            setSearchResults(expandedCards);
            onSearchComplete?.(expandedCards);
        } catch (error) {
            console.error('Error searching cards:', error);
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
            debouncedGetSuggestions(text);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
            setSearchResults([]);
        }
    };

    const debouncedGetSuggestions = useCallback(
        debounce(async (query: string) => {
            try {
                const results = await scryfallService.autocompleteCardName(query);
                setSuggestions(results);
                setShowSuggestions(true);
            } catch (error) {
                console.error('Error getting suggestions:', error);
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, debounceMs),
        [debounceMs]
    );

    const handleSuggestionSelect = (suggestion: string) => {
        setSearchQuery(suggestion);
        setSuggestions([]);
        setShowSuggestions(false);
        performSearch(suggestion);
    };

    const renderSuggestion = ({ item }: { item: string }) => (
        <TouchableOpacity
            style={styles.suggestionItem}
            onPress={() => handleSuggestionSelect(item)}
        >
            <Icon name="card-search" size={20} color="#666" style={styles.suggestionIcon} />
            <Text style={styles.suggestionText}>{item}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.searchBar}>
                <Icon name="magnify" size={24} color="#666" style={styles.searchIcon} />
                <TextInput
                    style={styles.input}
                    placeholder={placeholder}
                    value={searchQuery}
                    onChangeText={handleQueryChange}
                    autoFocus={autoFocus}
                    autoCorrect={false}
                    autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity
                        onPress={() => {
                            setSearchQuery('');
                            setSuggestions([]);
                            setShowSuggestions(false);
                            setSearchResults([]);
                        }}
                        style={styles.clearButton}
                    >
                        <Icon name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {isLoading && (
                <ActivityIndicator style={styles.loader} size="small" color="#2196F3" />
            )}

            {showSuggestions && suggestions.length > 0 && (
                <View style={styles.suggestionsList}>
                    {suggestions.map((suggestion) => (
                        <TouchableOpacity
                            key={suggestion}
                            style={styles.suggestionItem}
                            onPress={() => handleSuggestionSelect(suggestion)}
                        >
                            <Icon name="card-search" size={20} color="#666" style={styles.suggestionIcon} />
                            <Text style={styles.suggestionText}>{suggestion}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {showResults && searchResults.length > 0 && !showSuggestions && (
                <CardList
                    cards={searchResults}
                    isLoading={isLoading}
                    onCardPress={onCardSelect}
                    onAddToCollection={onAddToCollection}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        padding: 8,
        marginBottom: 8,
    },
    searchIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#333',
        height: 40,
    },
    clearButton: {
        padding: 4,
    },
    loader: {
        marginVertical: 8,
    },
    suggestionsList: {
        maxHeight: 200,
        backgroundColor: 'white',
        borderRadius: 8,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    suggestionIcon: {
        marginRight: 12,
    },
    suggestionText: {
        fontSize: 16,
        color: '#333',
    },
});

export default CardSearch; 