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
import { scryfallService } from '../../services/ScryfallService';
import type { ExtendedCard } from '../../types/card';
import CardList from '../../components/CardList';
import debounce from 'lodash/debounce';
import CollectionSelectionModal from '../../components/CollectionSelectionModal';
import { databaseService } from '../../services/DatabaseService';

type SearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SearchScreen = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ExtendedCard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
    const [isCollectionModalVisible, setIsCollectionModalVisible] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const navigation = useNavigation<SearchScreenNavigationProp>();

    const performSearch = async (query: string, pageNum: number = 1) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const { data, hasMore } = await scryfallService.searchCards(query, pageNum);
            if (pageNum === 1) {
                setSearchResults(data);
            } else {
                setSearchResults(prev => [...prev, ...data]);
            }
            setHasMore(hasMore);
        } catch (error) {
            console.error('Error searching cards:', error);
            setHasMore(false);
        } finally {
            setIsLoading(false);
        }
    };

    const debouncedSearch = debounce(performSearch, 500);

    const handleSearch = (text: string) => {
        setSearchQuery(text);
        if (text.trim()) {
            debouncedSearch(text);
        } else {
            setSearchResults([]);
        }
    };

    const handleQueryChange = (text: string) => {
        setSearchQuery(text);
        if (text.length >= 2) {
            debouncedGetSuggestions(text);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const debouncedGetSuggestions = debounce(async (query: string) => {
        try {
            const results = await scryfallService.autocompleteCardName(query);
            setSuggestions(results);
            setShowSuggestions(true);
        } catch (error) {
            console.error('Error getting suggestions:', error);
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, 300);

    const handleSuggestionSelect = (suggestion: string) => {
        setSearchQuery(suggestion);
        setSuggestions([]);
        setShowSuggestions(false);
        performSearch(suggestion, 1);
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
                setSearchResults(prevResults =>
                    prevResults.map(c => c.id === card.id ? extendedCard : c)
                );
            } else {
                console.error(`[SearchScreen] Could not find card details for: ${card.name}`);
            }
        } catch (error) {
            console.error('[SearchScreen] Error loading card:', error);
        }
    };

    const handleAddToCollection = async (card: ExtendedCard) => {
        setSelectedCard(card);
        setIsCollectionModalVisible(true);
    };

    const handleCollectionSelect = async (collectionId: string) => {
        if (!selectedCard) return;

        try {
            const cardWithUuid = await databaseService.addToCache(selectedCard);
            if (!cardWithUuid.uuid) {
                throw new Error('Failed to generate UUID for card');
            }
            await databaseService.addCardToCollection(cardWithUuid.uuid, collectionId);
            Alert.alert(
                'Success',
                `Added ${selectedCard.name} to collection`,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            navigation.goBack();
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('Error adding card to collection:', error);
            Alert.alert(
                'Error',
                'Failed to add card to collection'
            );
        } finally {
            setIsCollectionModalVisible(false);
            setSelectedCard(null);
        }
    };

    const handleLoadMore = () => {
        if (!isLoading && hasMore) {
            setPage(prev => prev + 1);
            performSearch(searchQuery, page + 1);
        }
    };

    const renderFooter = () => {
        if (!isLoading) return null;
        return (
            <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#2196F3" />
            </View>
        );
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
                    onSubmitEditing={() => handleSearch(searchQuery)}
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
                        onPress={() => handleSuggestionSelect(suggestion)}
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
                    isLoading={isLoading}
                    onCardPress={handleCardPress}
                    onAddToCollection={handleAddToCollection}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={renderFooter}
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

            <CollectionSelectionModal
                visible={isCollectionModalVisible}
                onClose={() => setIsCollectionModalVisible(false)}
                onSelect={handleCollectionSelect}
            />
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
    loadingFooter: {
        paddingVertical: 16,
        alignItems: 'center',
    },
});

export default SearchScreen; 