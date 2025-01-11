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
import * as LorcanaService from '../services/LorcanaService';
import type { ExtendedCard } from '../types/card';
import debounce from 'lodash/debounce';
import CardList from './CardList';
import LorcanaCardList from './LorcanaCardList';

type SearchMode = 'mtg' | 'lorcana';

interface CardSearchProps {
    onCardSelect?: (card: ExtendedCard | any) => void;  // Using any for Lorcana cards temporarily
    onSearchComplete?: (cards: (ExtendedCard | any)[]) => void;
    onAddToCollection?: (card: ExtendedCard | any) => void;
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
    const [searchMode, setSearchMode] = useState<SearchMode>('mtg');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const performSearch = async (query: string) => {
        if (!query.trim() || query.length < minSearchLength) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        try {
            if (searchMode === 'mtg') {
                const { data, hasMore } = await scryfallService.searchCards(query);
                const expandedCards = data.map(card => ({ ...card, isExpanded: true }));
                setSearchResults(expandedCards);
                onSearchComplete?.(expandedCards);
            } else {
                const cards = await LorcanaService.searchLorcanaCards(query);
                setSearchResults(cards);
                onSearchComplete?.(cards);
            }
        } catch (error) {
            console.error(`Error searching ${searchMode} cards:`, error);
            setSearchResults([]);
            onSearchComplete?.([]);
        } finally {
            setIsLoading(false);
        }
    };

    const debouncedSearch = useCallback(
        debounce(performSearch, debounceMs),
        [debounceMs, searchMode]
    );

    const handleQueryChange = (text: string) => {
        setSearchQuery(text);
        if (text.length >= minSearchLength) {
            debouncedSearch(text);
            if (searchMode === 'mtg') {
                debouncedGetSuggestions(text);
            }
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
            setSearchResults([]);
        }
    };

    const debouncedGetSuggestions = useCallback(
        debounce(async (query: string) => {
            if (searchMode !== 'mtg') return;
            
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
        [debounceMs, searchMode]
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

    const clearSearch = () => {
        setSearchQuery('');
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchResults([]);
    };

    return (
        <View style={styles.container}>
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, searchMode === 'mtg' && styles.activeTab]}
                    onPress={() => {
                        setSearchMode('mtg');
                        clearSearch();
                    }}
                >
                    <Text style={[styles.tabText, searchMode === 'mtg' && styles.activeTabText]}>MTG</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, searchMode === 'lorcana' && styles.activeTab]}
                    onPress={() => {
                        setSearchMode('lorcana');
                        clearSearch();
                    }}
                >
                    <Text style={[styles.tabText, searchMode === 'lorcana' && styles.activeTabText]}>Lorcana</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
                <Icon name="magnify" size={24} color="#666" style={styles.searchIcon} />
                <TextInput
                    style={styles.input}
                    placeholder={`Search ${searchMode === 'mtg' ? 'MTG' : 'Lorcana'} cards...`}
                    value={searchQuery}
                    onChangeText={handleQueryChange}
                    autoFocus={autoFocus}
                    autoCorrect={false}
                    autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity
                        onPress={clearSearch}
                        style={styles.clearButton}
                    >
                        <Icon name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {isLoading && (
                <ActivityIndicator style={styles.loader} size="small" color="#2196F3" />
            )}

            <View style={styles.resultsContainer}>
                {showSuggestions && suggestions.length > 0 && searchMode === 'mtg' && (
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
                    searchMode === 'mtg' ? (
                        <CardList
                            cards={searchResults}
                            isLoading={isLoading}
                            onCardPress={onCardSelect}
                            onAddToCollection={onAddToCollection}
                        />
                    ) : (
                        <LorcanaCardList
                            cards={searchResults}
                            isLoading={isLoading}
                            onCardPress={onCardSelect}
                            onAddToCollection={onAddToCollection}
                        />
                    )
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    tabContainer: {
        flexDirection: 'row',
        marginBottom: 8,
        borderRadius: 8,
        backgroundColor: '#f5f5f5',
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 6,
    },
    activeTab: {
        backgroundColor: '#2196F3',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    activeTabText: {
        color: '#fff',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 8,
        marginBottom: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.41,
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
    resultsContainer: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.41,
        overflow: 'hidden',
    },
    suggestionsList: {
        maxHeight: 200,
        backgroundColor: 'white',
        borderRadius: 8,
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