import React, { useState, useCallback } from 'react';
import {
    View,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Text,
    ActivityIndicator,
    Keyboard,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { scryfallService, ExtendedCard } from '../../services/ScryfallService';
import CardList from '../../components/CardList';
import debounce from 'lodash/debounce';

type SearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SearchScreen = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<ExtendedCard[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filters, setFilters] = useState({
        set: '',
        rarity: '',
        type: '',
        colors: [] as string[],
    });
    const navigation = useNavigation<SearchScreenNavigationProp>();

    const debouncedSearch = useCallback(
        debounce(async (query: string) => {
            if (query.length >= 2) {
                try {
                    const suggestions = await scryfallService.autocompleteCardName(query);
                    setSuggestions(suggestions);
                    setShowSuggestions(true);
                } catch (error) {
                    console.error('Error getting suggestions:', error);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300),
        []
    );

    const handleSearch = async (query: string = searchQuery) => {
        if (!query.trim()) return;
        setIsLoading(true);
        setShowSuggestions(false);
        Keyboard.dismiss();

        try {
            console.log(`[SearchScreen] Searching for cards with query: ${query}`);
            const results = await scryfallService.searchCards(query);
            console.log(`[SearchScreen] Found ${results.length} results`);
            setSearchResults(results);
            if (results.length === 0) {
                Alert.alert('No Results', 'No cards found matching your search.');
            }
        } catch (error) {
            console.error('[SearchScreen] Search error:', error);
            Alert.alert('Error', 'Failed to search cards. Please try again.');
            setSearchResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQueryChange = (text: string) => {
        setSearchQuery(text);
        debouncedSearch(text);
    };

    const handleSuggestionPress = (suggestion: string) => {
        setSearchQuery(suggestion);
        setShowSuggestions(false);
        handleSearch(suggestion);
    };

    const handleFilter = () => {
        // TODO: Implement filter modal
        Alert.alert('Coming Soon', 'Advanced filtering will be available in a future update.');
    };

    const handleCardPress = async (card: ExtendedCard) => {
        try {
            console.log(`[SearchScreen] Loading details for card: ${card.name}`);
            const extendedCard = await scryfallService.getCardByName(card.name);
            if (extendedCard) {
                navigation.navigate('CardDetails', { card: extendedCard });
            } else {
                console.error(`[SearchScreen] Could not find card details for: ${card.name}`);
            }
        } catch (error) {
            console.error('[SearchScreen] Error loading card:', error);
        }
    };

    const renderSearchBar = () => (
        <View style={styles.searchBarContainer}>
            <View style={styles.searchBar}>
                <Icon name="magnify" size={24} color="#666" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search cards..."
                    value={searchQuery}
                    onChangeText={handleQueryChange}
                    onSubmitEditing={() => handleSearch()}
                    returnKeyType="search"
                    autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity
                        onPress={() => {
                            setSearchQuery('');
                            setSuggestions([]);
                            setShowSuggestions(false);
                        }}
                        style={styles.clearButton}
                    >
                        <Icon name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
                )}
            </View>
            <TouchableOpacity
                style={styles.filterButton}
                onPress={handleFilter}
            >
                <Icon name="filter-variant" size={24} color="#2196F3" />
            </TouchableOpacity>
        </View>
    );

    const renderSuggestions = () => {
        if (!showSuggestions || suggestions.length === 0) return null;

        return (
            <View style={styles.suggestionsContainer}>
                {suggestions.map((suggestion) => (
                    <TouchableOpacity
                        key={suggestion}
                        style={styles.suggestionItem}
                        onPress={() => handleSuggestionPress(suggestion)}
                    >
                        <Icon name="card-search" size={20} color="#666" style={styles.suggestionIcon} />
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {renderSearchBar()}
            {renderSuggestions()}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2196F3" />
                    <Text style={styles.loadingText}>Searching cards...</Text>
                </View>
            ) : searchResults.length > 0 ? (
                <CardList
                    cards={searchResults}
                    isLoading={false}
                    onCardPress={handleCardPress}
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Icon name="card-search-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>
                        {searchQuery
                            ? 'No cards found'
                            : 'Search for Magic: The Gathering cards'}
                    </Text>
                    <Text style={styles.emptySubtext}>
                        Try searching by card name, set, or type
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        zIndex: 1,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        paddingHorizontal: 12,
        marginRight: 12,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        height: 40,
        fontSize: 16,
        color: '#333',
    },
    clearButton: {
        padding: 4,
    },
    filterButton: {
        padding: 8,
    },
    suggestionsContainer: {
        position: 'absolute',
        top: 72,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        maxHeight: 200,
        zIndex: 2,
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyText: {
        fontSize: 18,
        color: '#666',
        marginTop: 16,
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 14,
        color: '#999',
        marginTop: 8,
        textAlign: 'center',
    },
});

export default SearchScreen; 