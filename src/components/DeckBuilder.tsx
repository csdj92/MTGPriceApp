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
  
  useEffect(() => {
    const loadCollectedCards = async () => {
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
      `Your deck of ${deck.length} cards has been saved for the ${selectedFormat} format.`
    );
  };

  // Add view mode toggle buttons
  const renderViewModeToggle = () => (
    <View style={styles.viewModeContainer}>
      <TouchableOpacity
        style={[styles.viewModeButton, viewMode === 'grid' && styles.activeViewMode]}
        onPress={() => setViewMode('grid')}
      >
        <Text style={styles.viewModeText}>Grid</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.viewModeButton, viewMode === 'list' && styles.activeViewMode]}
        onPress={() => setViewMode('list')}
      >
        <Text style={styles.viewModeText}>List</Text>
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
    <TouchableOpacity
      style={[
        viewMode === 'grid' ? styles.gridCard : styles.listCard,
        item.uuid && selectedCards.has(item.uuid) && styles.selectedCard
      ]}
      onPress={() => {
        console.log('Selected Card:', JSON.stringify(item, null, 2));
        setSelectedCard(item);
      }}
      onLongPress={() => item.uuid && toggleCardSelection(item.uuid)}
    >
      {item.uuid && selectedCards.has(item.uuid) && (
        <View style={styles.selectionCheckbox}>
          <Switch
            value={true}
            trackColor={{ true: "#1e88e5" }}
            style={styles.checkboxContainer}
          />
        </View>
      )}
      {item.imageUrl && (
        <Image 
          source={{ uri: item.imageUrl }} 
          style={viewMode === 'grid' ? styles.gridImage : styles.listImage}
          resizeMode="contain"
        />
      )}
      <Text style={styles.cardTitle}>{item.name}</Text>
      {item.edhrec_rank && (
        <Text style={styles.edhrecRank}>EDHREC Rank: {item.edhrec_rank}</Text>
      )}
      {viewMode === 'list' && (
        <Text style={styles.cardDetail}>{item.type}</Text>
      )}
    </TouchableOpacity>
  );

  // Render a deck item that shows the card name and quantity, with a remove option
  const renderDeckItem = ({
    item,
  }: {
    item: { card: ExtendedCard; count: number };
  }) => (
    <View style={styles.deckCard}>
      <Text style={styles.cardTitle}>{item.card.name}</Text>
      <Text style={styles.cardCount}>x{item.count}</Text>
      <TouchableOpacity
        style={styles.removeIcon}
        onPress={() => removeCardFromDeck(item.card)}
      >
        <Text style={styles.removeText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );

  // Add search instructions text
  const renderSearchInstructions = () => (
    <View style={styles.searchInstructions}>
      <Text style={styles.searchInstructionsText}>
        Search by name, type, or text. Special searches:{'\n'}
        • Color: c:w (white), c:u (blue), c:b (black), c:r (red), c:g (green), c:c (colorless){'\n'}
        • Multiple colors: c:wu (white-blue), c:rg (red-green), etc.{'\n'}
        • Keywords: k:flying, k:vigilance, etc.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
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
            <Text style={styles.addSelectedText}>Add Selected to Deck</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>Deck Builder</Text>
        {renderViewModeToggle()}
      <View style={styles.formatSelector}>
          <Text style={styles.formatLabel}>Format:</Text>
        <Picker
          selectedValue={selectedFormat}
          style={styles.picker}
            onValueChange={(itemValue: React.SetStateAction<string>) =>
              setSelectedFormat(itemValue)
            }
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

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search cards (try 'c:w' for white cards or 'k:flying' for flying)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {renderSearchInstructions()}
      </View>

      <FlatList
        ListHeaderComponent={
          <>
            <Text style={styles.sectionTitle}>Available Cards</Text>
            <FlatList
              data={filteredCards}
              keyExtractor={(item) => item.uuid ?? ''}
        renderItem={renderAvailableCard}
              numColumns={viewMode === 'grid' ? 2 : 1}
              contentContainerStyle={styles.cardsList}
              columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
              scrollEnabled={false}
            />
            <Text style={styles.sectionTitle}>Your Deck ({deck.length} cards)</Text>
          </>
        }
        data={groupedDeck}
        keyExtractor={(item) => item.card.uuid ?? ''}
        renderItem={renderDeckItem}
        numColumns={2}
        contentContainerStyle={styles.content}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        ListEmptyComponent={
          <Text style={styles.emptyDeckText}>
            Your deck is empty. Tap on a card to add it.
          </Text>
        }
      />

      <TouchableOpacity style={styles.saveButton} onPress={saveDeck}>
        <Text style={styles.saveButtonText}>Save Deck</Text>
      </TouchableOpacity>

      {selectedCard && (
        <Modal
          transparent={true}
          animationType="fade"
          visible={true}
          onRequestClose={() => setSelectedCard(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <ScrollView style={styles.modalScroll}>
                {/* Header Section */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedCard.name}</Text>
                  {selectedCard.manaCost && (
                    <Text style={styles.manaCost}>{selectedCard.manaCost}</Text>
                  )}
                </View>

                {/* Image Section */}
                {selectedCard.imageUrl && (
                  <Image
                    source={{ uri: selectedCard.imageUrl }}
                    style={styles.modalImage}
                    resizeMode="contain"
                  />
                )}

                {/* Type Line Section */}
                <View style={styles.modalSection}>
                  <Text style={styles.typeText}>
                    {selectedCard.type}
                    {selectedCard.rarity && ` • ${selectedCard.rarity}`}
                  </Text>
                </View>

                {/* Card Text Section */}
                {selectedCard.text && (
                  <View style={styles.modalSection}>
                    <Text style={styles.sectionTitle}>Rules Text</Text>
                    <Text style={styles.rulesText}>{selectedCard.text}</Text>
                  </View>
                )}

                {/* Stats Section */}
                {(selectedCard.power || selectedCard.toughness) && (
                  <View style={styles.modalSection}>
                    <Text style={styles.statsText}>
                      Power/Toughness: {selectedCard.power}/{selectedCard.toughness}
                    </Text>
                  </View>
                )}

                {/* Color Identity Section */}
                {selectedCard.colorIdentity && selectedCard.colorIdentity.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.sectionTitle}>Color Identity</Text>
                    <View style={styles.colorIdentityContainer}>
                      {selectedCard.colorIdentity.map((color, index) => (
                        <View 
                          key={index} 
                          style={[
                            styles.colorDot,
                            { backgroundColor: getColorFromIdentity(color) }
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                )}

                {/* Keywords Section */}
                {selectedCard.keywords && selectedCard.keywords.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.sectionTitle}>Keywords</Text>
                    <View style={styles.keywordsContainer}>
                      {selectedCard.keywords.map((keyword, index) => (
                        <View key={index} style={styles.keywordPill}>
                          <Text style={styles.keywordText}>{keyword}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Set Information */}
                <View style={styles.modalSection}>
                  <Text style={styles.sectionTitle}>Set Information</Text>
                  <Text style={styles.setInfo}>
                    {selectedCard.setName} ({selectedCard.setCode.toUpperCase()})
                    {'\n'}Collector Number: {selectedCard.collectorNumber}
                  </Text>
                </View>

                {/* Legalities Section */}
                {selectedCard.legalities && (
                  <View style={styles.modalSection}>
                    <Text style={styles.sectionTitle}>Format Legality</Text>
                    <View style={styles.legalitiesContainer}>
                      {Object.entries(selectedCard.legalities).map(([format, status]) => (
                        <View 
                          key={format} 
                          style={[
                            styles.legalityPill,
                            { backgroundColor: getLegalityColor(status) }
                          ]}
                        >
                          <Text style={styles.legalityText}>
                            {format}: {status}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Additional Information */}
                <View style={styles.modalSection}>
                  <Text style={styles.sectionTitle}>Additional Information</Text>
                  <Text style={styles.additionalInfo}>
                    {`Mana Cost: ${selectedCard.manaCost || 'None'}\n`}
                    {`CMC: ${calculateCMC(selectedCard.manaCost)}\n`}
                    {selectedCard.power && `Power: ${selectedCard.power}\n`}
                    {selectedCard.toughness && `Toughness: ${selectedCard.toughness}\n`}
                    {selectedCard.rarity && `Rarity: ${selectedCard.rarity}\n`}
                    {selectedCard.edhrec_rank && `EDHREC Rank: ${selectedCard.edhrec_rank}\n`}
                    {selectedCard.booster && `Found in Boosters: ${selectedCard.booster}`}
                  </Text>
                </View>

                {/* Flavor Text Section */}
                {selectedCard.flavorText && (
                  <View style={styles.modalSection}>
                    <Text style={styles.flavorText}>{selectedCard.flavorText}</Text>
                  </View>
                )}
              </ScrollView>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => {
                    addCardToDeck(selectedCard);
                    setSelectedCard(null);
                  }}
                >
                  <Text style={styles.modalButtonText}>Add to Deck</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setSelectedCard(null)}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
    </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eaeaea',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  formatSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
    justifyContent: 'center',
  },
  formatLabel: {
    fontSize: 16,
    color: '#555',
    marginRight: 8,
  },
  picker: {
    height: 50,
    width: '70%',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  searchInput: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  content: {
    padding: 16,
    paddingBottom: 100, // extra space for floating button
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginVertical: 12,
  },
  cardsList: {
    paddingBottom: 16,
  },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    padding: 12,
    flex: 1,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    textAlign: 'center',
  },
  cardBody: {
    alignItems: 'center',
  },
  cardDetail: {
    fontSize: 14,
    color: '#666',
  },
  deckCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flex: 1,
    marginHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardCount: {
    fontSize: 14,
    color: '#888',
    marginVertical: 4,
  },
  removeIcon: {
    backgroundColor: '#ff5252',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  removeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  emptyDeckText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginVertical: 16,
  },
  saveButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#1e88e5',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#555',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSubText: {
    fontSize: 14,
    color: '#777',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 8,
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#1e88e5',
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#ff5252',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewModeContainer: {
    flexDirection: 'row',
    marginVertical: 8,
    
  },
  viewModeButton: {
    padding: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
  activeViewMode: {
    backgroundColor: '#1e88e5',
  },
  viewModeText: {
    color: '#333',
    fontWeight: '600',
  },
  gridCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    padding: 12,
    flex: 1,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    alignItems: 'center',
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    width: '100%',
  },
  gridImage: {
    width: 120,
    height: 170,
    marginBottom: 8,
  },
  listImage: {
    width: 60,
    height: 85,
    marginRight: 12,
  },
  selectedCard: {
    borderColor: '#1e88e5',
    borderWidth: 2,
  },
  multiSelectBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e88e5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionCount: {
    fontSize: 16,
    color: '#fff',
    marginRight: 12,
  },
  selectAllButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
  },
  selectAllText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  addSelectedButton: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  addSelectedText: {
    color: '#1e88e5',
    fontWeight: '600',
    fontSize: 14,
  },
  selectionCheckbox: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  checkboxContainer: {
    margin: 0,
    padding: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  manaCost: {
    fontSize: 16,
    color: '#666',
  },
  modalImage: {
    width: '100%',
    height: 300,
    marginBottom: 16,
  },
  modalSection: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  typeText: {
    fontSize: 16,
    color: '#444',
    fontWeight: '500',
  },
  rulesText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  statsText: {
    fontSize: 14,
    color: '#444',
    fontWeight: '500',
  },
  colorIdentityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keywordPill: {
    backgroundColor: '#e9ecef',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  keywordText: {
    fontSize: 12,
    color: '#495057',
  },
  setInfo: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
  },
  legalitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legalityPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  legalityText: {
    fontSize: 12,
    color: '#333',
  },
  additionalInfo: {
    fontSize: 14,
    color: '#495057',
    lineHeight: 20,
  },
  flavorText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  edhrecRank: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  searchInstructions: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  searchInstructionsText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});

export default DeckBuilder;