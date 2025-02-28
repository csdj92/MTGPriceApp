import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  SafeAreaView,
  SectionList,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Image,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { ExtendedCard } from '../types/card';
import { 
  isCardLegalForFormat, 
  isDeckSizeValid, 
  getFormatRules, 
  isCardCopyCountValid,
} from '../application/legalityFilter';
import { databaseService } from '../services/DatabaseService';
import { Switch } from 'react-native';
import CardItem from './CardItem';
import CardModal from './CardModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ActivityIndicator } from 'react-native';
import DeckCharts from './DeckCharts';

const Icon = MaterialIcons as any;

// Add type definitions for our sections
type DeckSection = {
  title: string;
  data: ExtendedCard[][];
} | {
  title: string;
  data: Array<Array<{card: ExtendedCard; count: number}>>;
};

const getColorFromIdentity = (color: string): string => {
  const colorMap: { [key: string]: string } = {
    W: '#F8E7B9', // White
    U: '#B3CEEA', // Blue
    B: '#B0AFAE', // Black
    R: '#EAA7A7', // Red
    G: '#B7C4B9', // Green
  };
  return colorMap[color] || '#000000';
};

const getLegalityColor = (status: string): string => {
  const statusMap: { [key: string]: string } = {
    legal: '#90EE90',     // Light green
    restricted: '#FFD700', // Gold
    banned: '#FFB6C1',    // Light red
    not_legal: '#D3D3D3', // Light gray
  };
  return statusMap[status.toLowerCase()] || '#D3D3D3';
};

const calculateCMC = (manaCost: string | undefined): number => {
  if (!manaCost) return 0;
  // Remove curly braces and split hybrid mana
  const manaSymbols = manaCost.replace(/[{}]/g, '').split('/');
  let cmc = 0;
  
  for (const symbol of manaSymbols) {
    // Check if it's a number
    const numericValue = parseInt(symbol);
    if (!isNaN(numericValue)) {
      cmc += numericValue;
    } else if (symbol.length > 0 && symbol !== '') {
      // Each mana symbol counts as 1
      cmc += 1;
    }
  }
  return cmc;
};

const DeckBuilder: React.FC = () => {
  const formats = ['standard', 'modern', 'legacy', 'commander'];
  const [selectedFormat, setSelectedFormat] = useState<string>('standard');
  const [deck, setDeck] = useState<ExtendedCard[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
  const [collectedCards, setCollectedCards] = useState<ExtendedCard[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deckName, setDeckName] = useState('New Deck');
  const [isEditingName, setIsEditingName] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const insets = useSafeAreaInsets();
  
  useEffect(() => {
    const loadCollectedCards = async () => {
      setIsLoading(true);
      try {
        console.log('Loading collected cards');
        const { cards, uuids } = await databaseService.getAllCollectedCards();
        const getCards = await databaseService.mapCollectionUUID(uuids);
        
        if (getCards && Array.isArray(getCards) && getCards.length > 0) {
          const firstCard = getCards[0];
          console.log('First collected card:', {
            name: firstCard.name,
            setCode: firstCard.setCode,
            imageUrl: firstCard.imageUrl,
            prices: getCards[0].prices
          });
        }
        setCollectedCards(cards);
      } catch (error) {
        console.error('Error loading cards:', error);
        Alert.alert('Error', 'Failed to load your card collection.');
      } finally {
        setIsLoading(false);
      }
    };
    loadCollectedCards();
  }, []);

  const availableCards = useMemo(() => {
    return collectedCards.filter((card) =>
      isCardLegalForFormat(card, selectedFormat)
    );
  }, [selectedFormat, collectedCards]);

  // Further filter by search query, keywords, and colors
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return availableCards;
    
    const query = searchQuery.toLowerCase();
    const searchTerms = query.split(' ');
    
    return availableCards.filter((card) => {
      return searchTerms.every(term => {
        if (term.startsWith('c:')) {
          const colorsPart = term.slice(2);
          const normalizeColor = (color: string) => {
            return color.length === 1 ? color.toUpperCase() : color[0].toUpperCase();
          };
          if (colorsPart.length > 1) {
            // Multi-color search: e.g., 'c:wu' for white-blue
            const searchColors = colorsPart.toUpperCase().split('');
            return searchColors.every(color =>
              (card.colorIdentity && card.colorIdentity.some(c => normalizeColor(c) === color)) ||
              (card.colors && card.colors.some(c => normalizeColor(c) === color))
            );
          } else {
            // Single color search: e.g., 'c:r' for red
            const searchColor = colorsPart.toUpperCase();
            if (searchColor === 'C') {
              return !(card.colorIdentity && card.colorIdentity.length) && !(card.colors && card.colors.length);
            }
            return (card.colorIdentity && card.colorIdentity.some(c => normalizeColor(c) === searchColor)) ||
                   (card.colors && card.colors.some(c => normalizeColor(c) === searchColor));
          }
        }
        if (term.startsWith('k:')) {
          const searchKeyword = term.slice(2).toLowerCase();
          return card.keywords && card.keywords.some(keyword => keyword.toLowerCase().includes(searchKeyword));
        }
        return (
          card.name.toLowerCase().includes(term) ||
          card.type.toLowerCase().includes(term) ||
          (card.text && card.text.toLowerCase().includes(term)) ||
          (card.keywords && card.keywords.some(keyword => keyword.toLowerCase().includes(term)))
        );
      });
    });
  }, [searchQuery, availableCards]);

  // Group deck cards by UUID and count how many copies are in the deck
  const groupedDeck = useMemo(() => {
    const map: Record<string, { card: ExtendedCard; count: number }> = {};
    deck.forEach((card) => {
      const uuid = card.uuid || 'unknown';
      if (map[uuid]) {
        map[uuid].count += 1;
      } else {
        map[uuid] = { card, count: 1 };
      }
    });
    return Object.values(map);
  }, [deck]);

  const addCardToDeck = useCallback(
    (card: ExtendedCard) => {
      const copyCount = deck.filter((c) => c.uuid === card.uuid).length;
      if (!isCardCopyCountValid(selectedFormat, copyCount + 1)) {
        Alert.alert(
          'Copy Limit Exceeded',
          `You cannot add more copies of ${card.name} in ${selectedFormat} format.`
        );
        return;
      }
      setDeck((prevDeck) => [...prevDeck, card]);
      // Show feedback toast or animation here
    },
    [deck, selectedFormat]
  );

  const removeCardFromDeck = useCallback(
    (card: ExtendedCard) => {
      const index = deck.findIndex((c) => c.uuid === card.uuid);
      if (index !== -1) {
        const updatedDeck = [...deck];
        updatedDeck.splice(index, 1);
        setDeck(updatedDeck);
      }
    },
    [deck]
  );

  const saveDeck = () => {
    const rules = getFormatRules(selectedFormat);
    if (!isDeckSizeValid(selectedFormat, deck.length)) {
      Alert.alert(
        'Invalid Deck Size', 
        `Your deck must have at least ${rules?.minDeckSize} cards for ${selectedFormat} format.`
      );
      return;
    }
    Alert.alert(
      'Deck Saved',
      `Your deck "${deckName}" with ${deck.length} cards has been saved for the ${selectedFormat} format.`
    );
  };

  // Add view mode toggle buttons
  const renderViewModeToggle = () => (
    <View style={styles.viewModeContainer}>
      <TouchableOpacity
        style={[styles.viewModeButton, viewMode === 'grid' && styles.activeViewMode]}
        onPress={() => setViewMode('grid')}
      >
        <Icon name="grid-view" size={18} color={viewMode === 'grid' ? '#fff' : '#333'} />
        <Text style={[styles.viewModeText, viewMode === 'grid' && styles.activeViewModeText]}>Grid</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.viewModeButton, viewMode === 'list' && styles.activeViewMode]}
        onPress={() => setViewMode('list')}
      >
        <Icon name="view-list" size={18} color={viewMode === 'list' ? '#fff' : '#333'} />
        <Text style={[styles.viewModeText, viewMode === 'list' && styles.activeViewModeText]}>List</Text>
      </TouchableOpacity>
    </View>
  );

  // Add multi-select toggle function
  const toggleCardSelection = useCallback((uuid: string) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });
  }, []);

  // Add bulk add function
  const addSelectedToDeck = useCallback(() => {
    const cardsToAdd = collectedCards.filter(card => {
      if (!card.uuid) return false;
      return selectedCards.has(card.uuid) &&
        isCardLegalForFormat(card, selectedFormat);
    });

    const newDeck = [...deck];
    let addedCount = 0;
    let limitExceeded = false;

    cardsToAdd.forEach(card => {
      const currentCount = newDeck.filter(c => c.uuid === card.uuid).length;
      if (isCardCopyCountValid(selectedFormat, currentCount + 1)) {
        newDeck.push(card);
        addedCount++;
      } else {
        limitExceeded = true;
      }
    });

    setDeck(newDeck);
    setSelectedCards(new Set());
    
    if (limitExceeded) {
      Alert.alert(
        'Some cards exceeded format copy limits',
        'Not all selected cards were added to the deck'
      );
    } else if (addedCount > 0) {
      Alert.alert('Cards Added', `${addedCount} cards were added to your deck.`);
    }
  }, [selectedCards, deck, selectedFormat, collectedCards]);

  // Add selectAll function
  const selectAll = useCallback(() => {
    setIsSelectAll(!isSelectAll);
    if (!isSelectAll) {
      // Select all legal cards
      const legalCardUuids = new Set(
        filteredCards
          .filter(card => card.uuid && isCardLegalForFormat(card, selectedFormat))
          .map(card => card.uuid!)
      );
      setSelectedCards(legalCardUuids);
    } else {
      // Deselect all
      setSelectedCards(new Set());
    }
  }, [isSelectAll, filteredCards, selectedFormat]);

  // Modify renderAvailableCard to include selection
  const renderAvailableCard = ({ item }: { item: ExtendedCard }) => (
    <CardItem
      card={item}
      viewMode={viewMode}
      isSelected={!!(item.uuid && selectedCards.has(item.uuid))}
      onSelect={(card) => {
        console.log('Selected Card:', JSON.stringify(card, null, 2));
        setSelectedCard(card);
      }}
      onLongPress={(card) => {
        if (card.uuid) toggleCardSelection(card.uuid);
      }}
    />
  );

  // Render a deck item that shows the card name and quantity, with a remove option
  const renderDeckItem = ({
    item,
  }: {
    item: { card: ExtendedCard; count: number };
  }) => (
    <TouchableOpacity 
      style={styles.deckCard}
      onPress={() => setSelectedCard(item.card)}
    >
      <View style={styles.deckCardContent}>
        {item.card.imageUrl && (
          <Image
            source={{ uri: item.card.imageUrl }}
            style={styles.deckCardImage}
            resizeMode="contain"
          />
        )}
        <View style={styles.deckCardDetails}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.card.name}</Text>
          <Text style={styles.cardType} numberOfLines={1}>{item.card.type}</Text>
          <View style={styles.countContainer}>
            <Text style={styles.cardCount}>x{item.count}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeIcon}
        onPress={() => removeCardFromDeck(item.card)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Icon name="remove-circle" size={20} color="#ff5252" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // Add search instructions text
  const renderSearchInstructions = () => (
    <TouchableOpacity 
      style={styles.searchInstructions}
      onPress={() => {
        Alert.alert(
          'Search Help',
          'Search by name, type, or text.\n\n' +
          'Color searches:\n' +
          '• c:w (white), c:u (blue), c:b (black), c:r (red), c:g (green), c:c (colorless)\n' +
          '• Multiple colors: c:wu (white-blue), c:rg (red-green), etc.\n\n' +
          'Keyword searches:\n' +
          '• k:flying, k:vigilance, etc.'
        );
      }}
    >
      <Icon name="help-outline" size={16} color="#666" />
      <Text style={styles.searchInstructionsText}>Search help</Text>
    </TouchableOpacity>
  );

  const renderDeckHeader = () => (
    <View style={styles.deckHeader}>
      {isEditingName ? (
        <TextInput
          style={styles.deckNameInput}
          value={deckName}
          onChangeText={setDeckName}
          autoFocus
          onBlur={() => setIsEditingName(false)}
          onSubmitEditing={() => setIsEditingName(false)}
        />
      ) : (
        <TouchableOpacity 
          style={styles.deckNameContainer}
          onPress={() => setIsEditingName(true)}
        >
          <Text style={styles.deckNameText}>{deckName}</Text>
          <Icon name="edit" size={16} color="#666" />
        </TouchableOpacity>
      )}
      <View style={styles.deckControls}>
        <Text style={styles.deckStatsText}>{deck.length} cards</Text>
        <TouchableOpacity
          onPress={() => setShowCharts(!showCharts)}
          style={styles.chartToggle}
        >
          <Icon name={showCharts ? "bar-chart" : "analytics"} size={18} color="#555" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Deck Builder</Text>
        {renderViewModeToggle()}
        <View style={styles.formatSelector}>
          <Text style={styles.formatLabel}>Format:</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedFormat}
              style={styles.picker}
              onValueChange={(itemValue: React.SetStateAction<string>) => setSelectedFormat(itemValue)}
            >
              {formats.map((format) => (
                <Picker.Item
                  key={format}
                  label={format.charAt(0).toUpperCase() + format.slice(1)}
                  value={format}
                />
              ))}
            </Picker>
          </View>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Icon name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search cards by name, type, color (c:r), or keyword (k:flying)"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="clear" size={20} color="#666" />
            </TouchableOpacity>
          ) : null}
        </View>
        {renderSearchInstructions()}
      </View>

      {selectedCards.size > 0 && (
        <View style={styles.multiSelectBar}>
          <View style={styles.selectionActions}>
            <Text style={styles.selectionCount}>
              {selectedCards.size} selected
            </Text>
            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={selectAll}
            >
              <Text style={styles.selectAllText}>
                {isSelectAll ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.addSelectedButton}
            onPress={addSelectedToDeck}
          >
            <Icon name="add" size={16} color="#1e88e5" />
            <Text style={styles.addSelectedText}>Add to Deck</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e88e5" />
          <Text style={styles.loadingText}>Loading your cards...</Text>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          <View style={styles.cardsSection}>
            <Text style={styles.sectionTitle}>Available Cards ({filteredCards.length})</Text>
            <FlatList
              data={filteredCards}
              keyExtractor={(item) => item.uuid ?? ''}
              renderItem={renderAvailableCard}
              numColumns={viewMode === 'grid' ? 2 : 1}
              contentContainerStyle={styles.cardsList}
              columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={20}
              windowSize={5}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Icon name="search-off" size={40} color="#ccc" />
                  <Text style={styles.emptyStateText}>
                    {searchQuery ? 'No cards match your search' : 'No cards in your collection'}
                  </Text>
                </View>
              }
            />
          </View>

          <View style={styles.deckSection}>
            {renderDeckHeader()}
            
            {showCharts && deck.length > 0 ? (
              <DeckCharts deck={deck} />
            ) : (
              <FlatList
                data={groupedDeck}
                keyExtractor={(item) => item.card.uuid ?? ''}
                renderItem={renderDeckItem}
                contentContainerStyle={styles.deckList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Icon name="style" size={40} color="#ccc" />
                    <Text style={styles.emptyStateText}>
                      Your deck is empty. Tap on a card to add it.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      )}

      <TouchableOpacity 
        style={[styles.saveButton, { bottom: insets.bottom + 20 }]} 
        onPress={saveDeck}
        activeOpacity={0.8}
      >
        <Icon name="save" size={20} color="#fff" />
        <Text style={styles.saveButtonText}>Save Deck</Text>
      </TouchableOpacity>

      {selectedCard && (
        <CardModal
          card={selectedCard}
          onAdd={() => {
            addCardToDeck(selectedCard);
            setSelectedCard(null);
          }}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eaeaea',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  formatSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    justifyContent: 'center',
  },
  formatLabel: {
    fontSize: 16,
    color: '#555',
    marginRight: 8,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    width: '60%',
  },
  picker: {
    height: 40,
    backgroundColor: '#f9f9f9',
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eaeaea',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
  },
  searchInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  searchInstructionsText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  cardsSection: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#eaeaea',
    padding: 8,
  },
  deckSection: {
    flex: 1,
    padding: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginVertical: 8,
  },
  cardsList: {
    paddingVertical: 8,
  },
  deckList: {
    paddingVertical: 8,
    paddingBottom: 100, // Space for save button
  },
  deckHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  deckNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckNameText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  deckNameInput: {
    flex: 1,
    height: 30,
    backgroundColor: '#fff',
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#333',
  },
  deckControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckStatsText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
    marginRight: 8,
    backgroundColor: '#e5e5e5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  chartToggle: {
    padding: 6,
    backgroundColor: '#e5e5e5',
    borderRadius: 16,
  },
  deckCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckCardImage: {
    width: 40,
    height: 56,
    marginRight: 8,
    borderRadius: 4,
  },
  deckCardDetails: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  cardType: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  countContainer: {
    marginTop: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  cardCount: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  removeIcon: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  viewModeContainer: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
    marginVertical: 8,
  },
  viewModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
  },
  activeViewMode: {
    backgroundColor: '#1e88e5',
  },
  viewModeText: {
    marginLeft: 4,
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  activeViewModeText: {
    color: '#fff',
  },
  multiSelectBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderBottomWidth: 1,
    borderBottomColor: '#bbdefb',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionCount: {
    fontSize: 14,
    color: '#1e88e5',
    fontWeight: '600',
    marginRight: 8,
  },
  selectAllButton: {
    backgroundColor: '#bbdefb',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  selectAllText: {
    color: '#1565c0',
    fontWeight: '500',
    fontSize: 13,
  },
  addSelectedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e88e5',
  },
  addSelectedText: {
    color: '#1e88e5',
    fontWeight: '500',
    fontSize: 13,
    marginLeft: 4,
  },
  saveButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#1e88e5',
    borderRadius: 28,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#555',
  },
});

export default DeckBuilder;