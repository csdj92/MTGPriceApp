import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    Modal,
    ScrollView,
    Dimensions,
    ActivityIndicator,
    Alert,
    Image
} from 'react-native';
import FastImage from 'react-native-fast-image';
import type { LorcanaCardWithPrice } from '../types/lorcana';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
// Fix the Icon type with a proper type assertion to avoid type errors
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;
import { getLorcanaCardPrice, getDB, addCardToLorcanaCollection } from '../services/LorcanaService';

interface LorcanaGridViewProps {
    cards: LorcanaCardWithPrice[];
    isLoading: boolean;
    onCardPress: (card: LorcanaCardWithPrice) => void;
    onDeleteCard: (card: LorcanaCardWithPrice) => void;
    onCardsUpdate?: (updatedCards: LorcanaCardWithPrice[]) => void;
}

type SortOption = 'name' | 'price' | 'number';
type SortDirection = 'asc' | 'desc';

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

const ITEMS_PER_PAGE = 12;

const LorcanaGridView: React.FC<LorcanaGridViewProps> = ({
    cards,
    isLoading,
    onCardPress,
    onDeleteCard,
    onCardsUpdate
}) => {
    // State
    const [filters, setFilters] = useState<Filters>({
        search: '',
        rarities: [],
        colors: [],
        collectionStatus: 'all',
        priceRange: { min: null, max: null }
    });
    const [showFilters, setShowFilters] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>('number');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [selectedCard, setSelectedCard] = useState<LorcanaCardWithPrice | null>(null);
    const [updatingPrices, setUpdatingPrices] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [showVersionModal, setShowVersionModal] = useState(false);
    const [availableVersions, setAvailableVersions] = useState<LorcanaCardWithPrice[]>([]);
    // Add a ref to track cards that failed price lookup
    const failedPriceLookups = React.useRef<Set<string>>(new Set());

    // Filter options
    const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Enchanted'];
    const colorOptions = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];

    // Filter and sort cards
    const filteredCards = useCallback(() => {
        return cards.filter(card => {
            // Text search
            if (filters.search && !card.Name?.toLowerCase().includes(filters.search.toLowerCase()) &&
                !card.Body_Text?.toLowerCase().includes(filters.search.toLowerCase())) {
                return false;
            }

            // Collection status filter
            if (filters.collectionStatus === 'collected' && !card.collected) {
                return false;
            }
            if (filters.collectionStatus === 'missing' && card.collected) {
                return false;
            }

            // Rarity filter
            if (filters.rarities.length > 0 && !filters.rarities.includes(card.Rarity || '')) {
                return false;
            }

            // Color filter
            if (filters.colors.length > 0 && !filters.colors.includes(card.Color || '')) {
                return false;
            }

            // Price range filter
            const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
            if (filters.priceRange.min !== null && price < filters.priceRange.min) {
                return false;
            }
            if (filters.priceRange.max !== null && price > filters.priceRange.max) {
                return false;
            }

            return true;
        }).sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return sortDirection === 'asc' 
                        ? (a.Name || '').localeCompare(b.Name || '')
                        : (b.Name || '').localeCompare(a.Name || '');
                case 'price':
                    const priceA = a.prices?.usd ? parseFloat(a.prices.usd) : 0;
                    const priceB = b.prices?.usd ? parseFloat(b.prices.usd) : 0;
                    return sortDirection === 'asc' ? priceA - priceB : priceB - priceA;
                case 'number':
                default:
                    const numA = a.Card_Num || 0;
                    const numB = b.Card_Num || 0;
                    return sortDirection === 'asc' ? numA - numB : numB - numA;
            }
        });
    }, [cards, filters, sortBy, sortDirection]);

    // Move price update logic to a separate function
    const updatePrices = useCallback(async () => {
        if (updatingPrices) return;
        setUpdatingPrices(true);

        try {
            // Calculate timestamp for 24 hours ago
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            
            // Filter out cards that already failed price lookup or have recent prices
            const cardsNeedingPrices = filteredCards().filter(card => 
                (!card.prices?.usd || !card.last_updated || card.last_updated < twentyFourHoursAgo) && 
                !failedPriceLookups.current.has(card.Unique_ID)
            );
            
            if (cardsNeedingPrices.length === 0) {
                setUpdatingPrices(false);
                return;
            }

            const updatePromises = cardsNeedingPrices.map(async (card) => {
                if (card.Name && card.Set_Num && card.Rarity) {
                    try {
                        const prices = await getLorcanaCardPrice({
                            Name: card.Name,
                            Set_Num: card.Set_Num,
                            Rarity: card.Rarity
                        });
                        
                        if (!prices) {
                            // Add to failed lookups if no price was found
                            failedPriceLookups.current.add(card.Unique_ID);
                            return card;
                        }

                        // Update prices in database
                        const db = await getDB();
                        await db.executeSql(
                            `UPDATE lorcana_cards 
                             SET price_usd = ?, 
                                 price_usd_foil = ?, 
                                 last_updated = ? 
                             WHERE Unique_ID = ?`,
                            [
                                prices.usd,
                                prices.usd_foil,
                                new Date().toISOString(),
                                card.Unique_ID
                            ]
                        );
                        
                        return {
                            ...card,
                            prices,
                            last_updated: new Date().toISOString()
                        };
                    } catch (error) {
                        // Add to failed lookups on error
                        failedPriceLookups.current.add(card.Unique_ID);
                        return card;
                    }
                }
                return card;
            });

            const updatedCards = await Promise.all(updatePromises);
            
            // Merge updated cards with existing cards
            const newCards = cards.map(card => {
                const updatedCard = updatedCards.find(uc => uc.Unique_ID === card.Unique_ID);
                return updatedCard || card;
            });

            // Update the parent component with the new card data
            if (onCardsUpdate) {
                onCardsUpdate(newCards);
            }
        } catch (error) {
            console.error('Error updating card prices:', error);
        } finally {
            setUpdatingPrices(false);
        }
    }, [cards, filteredCards, updatingPrices, onCardsUpdate]);

    // Call updatePrices when cards change or on initial mount
    useEffect(() => {
        updatePrices();
    }, [updatePrices]);  // Add dependencies to trigger on card changes

    // Add a useEffect to refresh the card data when cards state changes
    useEffect(() => {
        // Check if any cards have been changed but not properly reflected in the UI
        const refreshCollectionStatus = async () => {
            if (cards.length === 0) return;
            
            try {
                const db = await getDB();
                // Get the unique IDs of all cards
                const cardIds = cards.map(card => card.Unique_ID).filter(Boolean);
                
                if (cardIds.length === 0) return;
                
                // Use a more comprehensive query that checks both the lorcana_cards.collected flag
                // and also checks if the card exists in any collection
                const [results] = await db.executeSql(
                    `SELECT lc.Unique_ID, 
                            lc.collected, 
                            CASE WHEN lcc.card_id IS NOT NULL THEN 1 ELSE 0 END as in_collection
                     FROM lorcana_cards lc
                     LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                     WHERE lc.Unique_ID IN (${cardIds.map(() => '?').join(',')})`,
                    cardIds
                );
                
                // Create a map of card ID to collection status
                const collectionStatusMap = new Map();
                for (let i = 0; i < results.rows.length; i++) {
                    const row = results.rows.item(i);
                    // A card is collected if either the collected flag is set OR it exists in a collection
                    const isCollected = Boolean(row.collected) || Boolean(row.in_collection);
                    collectionStatusMap.set(row.Unique_ID, isCollected);
                }
                
                // Check if any cards have inconsistent collection status
                let hasInconsistencies = false;
                const updatedCards = cards.map(card => {
                    if (!card.Unique_ID) return card;
                    
                    const databaseCollected = collectionStatusMap.get(card.Unique_ID);
                    if (databaseCollected !== undefined && databaseCollected !== !!card.collected) {
                        hasInconsistencies = true;
                        console.log(`[LorcanaGridView] Fixing inconsistency for card: ${card.Name}, UI: ${!!card.collected}, DB: ${databaseCollected}`);
                        return { ...card, collected: databaseCollected };
                    }
                    return card;
                });
                
                // If inconsistencies found, update the UI
                if (hasInconsistencies && onCardsUpdate) {
                    console.log('[LorcanaGridView] Fixing collection status inconsistencies');
                    onCardsUpdate(updatedCards);
                }
            } catch (error) {
                console.error('[LorcanaGridView] Error refreshing collection status:', error);
            }
        };
        
        // Run the refresh
        refreshCollectionStatus();
    }, [cards]);

    const loadMoreCards = async () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);

        try {
            
        } catch (error) {
            console.error('Error loading more cards:', error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleLongPress = (card: LorcanaCardWithPrice) => {
        setSelectedCard(null); // Close the card details modal first
        // Fetch available versions for the card
        fetchAvailableVersions(card);
        setSelectedCard(card);
        setShowVersionModal(true);
    };

    const fetchAvailableVersions = async (card: LorcanaCardWithPrice) => {
        try {
            const db = await getDB();
            const [results] = await db.executeSql(
                'SELECT * FROM lorcana_cards WHERE Name = ?',
                [card.Name]
            );
            const versions = [];
            for (let i = 0; i < results.rows.length; i++) {
                versions.push(results.rows.item(i));
            }
            setAvailableVersions(versions);
        } catch (error) {
            console.error('Error fetching card versions:', error);
        }
    };

    const handleVersionChange = async (newVersion: LorcanaCardWithPrice) => {
        try {
            // Close the modal first
            setShowVersionModal(false);
            
            // If the original card was collected, transfer that status to the new version
            const wasCollected = selectedCard?.collected || false;
            
            // Always ensure we're working with the newest data
            const latestCardData = {
                ...newVersion,
                collected: wasCollected
            };
            
            // Update the card version in the state
            if (onCardsUpdate) {
                const updatedCards = cards.map(card =>
                    card.Unique_ID === selectedCard?.Unique_ID ? latestCardData : card
                );
                onCardsUpdate(updatedCards);
                console.log('[LorcanaGridView] Updated card version:', latestCardData.Name);
            }
        } catch (error) {
            console.error('[LorcanaGridView] Error changing card version:', error);
            Alert.alert(
                'Error',
                'Failed to change card version. Please try again.',
                [{ text: 'OK' }]
            );
        }
    };

    const renderCard = ({ item }: { item: LorcanaCardWithPrice }) => {
        // Force boolean evaluation to ensure consistent behavior
        const isCollected = !!item.collected;
        
        return (
            <TouchableOpacity 
                style={styles.cardContainer}
                onPress={() => setSelectedCard(item)}
                onLongPress={() => handleLongPress(item)}
            >
                <View style={styles.cardImageContainer}>
                    {item.Image ? (
                        <FastImage
                            source={{ 
                                uri: item.Image,
                                priority: FastImage.priority.low,
                                cache: FastImage.cacheControl.immutable,
                                headers: {
                                    'User-Agent': 'MTGPriceApp/1.0',
                                    'Accept': 'image/*'
                                }
                            }}
                            style={[
                                styles.cardImage,
                                !isCollected && styles.cardImageUncollected
                            ]}
                            resizeMode={FastImage.resizeMode.contain}
                            onError={() => {
                                console.log('[LorcanaGridView] Failed to load image:', {
                                    url: item.Image,
                                    name: item.Name
                                });
                            }}
                        />
                    ) : (
                        <View style={[styles.cardImage, styles.placeholderImage]}>
                            <Icon name="image-off" size={24} color="#666" />
                        </View>
                    )}
                    {!isCollected && (
                        <View style={styles.missingOverlay}>
                            <Icon name="plus-circle" size={24} color="white" />
                            <Text style={styles.missingText}>Missing</Text>
                        </View>
                    )}
                </View>
                <View style={[styles.cardInfo, !isCollected && styles.cardInfoUncollected]}>
                    <Text style={styles.cardNumber}>#{item.Card_Num || '0'}</Text>
                    <Text style={[styles.cardName, !isCollected && styles.cardNameUncollected]} numberOfLines={1}>
                        {item.Name}
                    </Text>
                    <Text style={[styles.cardPrice, !isCollected && styles.cardPriceUncollected]}>
                        ${item.prices?.usd ? Number(item.prices.usd).toFixed(2) : '0.00'}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderCardModal = () => (
        <Modal
            visible={selectedCard !== null && !showVersionModal}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setSelectedCard(null)}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    {selectedCard && (
                        <ScrollView>
                            <View style={styles.modalImageContainer}>
                                <FastImage
                                    source={{ uri: selectedCard.Image }}
                                    style={styles.modalImage}
                                    resizeMode={FastImage.resizeMode.contain}
                                />
                                <TouchableOpacity
                                    style={styles.modalCloseButton}
                                    onPress={() => setSelectedCard(null)}
                                >
                                    <Icon name="close" size={28} color="#666" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.modalInfo}>
                                <Text style={styles.modalTitle}>{selectedCard.Name}</Text>
                                <Text style={styles.modalText}>Set: {selectedCard.Set_Name}</Text>
                                <Text style={styles.modalText}>Number: {selectedCard.Card_Num}</Text>
                                <Text style={styles.modalText}>Rarity: {selectedCard.Rarity}</Text>
                                <Text style={styles.modalText}>Color: {selectedCard.Color}</Text>
                                <Text style={styles.modalText}>Franchise: {selectedCard.Franchise ? selectedCard.Franchise : ''}</Text>
                                <View style={styles.modalPrices}>
                                    <Text style={styles.modalPriceTitle}>Price:</Text>
                                    <Text style={styles.modalPrice}>
                                        ${selectedCard.prices?.usd ? Number(selectedCard.prices.usd).toFixed(2) : '0.00'}
                                    </Text>
                                </View>
                            </View>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );

    const renderVersionModal = () => (
        <Modal
            visible={showVersionModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowVersionModal(false)}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Select Card Version</Text>
                    <ScrollView>
                        {availableVersions.map(version => (
                            <TouchableOpacity
                                key={version.Unique_ID}
                                style={styles.versionOption}
                                onPress={() => handleVersionChange(version)}
                            >
                                <Text style={styles.versionText}>{version.Name}</Text>
                                <FastImage
                                    source={{ 
                                        uri: version.Image,
                                        priority: FastImage.priority.normal,
                                        cache: FastImage.cacheControl.immutable,
                                        headers: {
                                            'User-Agent': 'MTGPriceApp/1.0',
                                            'Accept': 'image/*'
                                        }
                                    }}
                                    style={styles.versionImage}
                                    resizeMode={FastImage.resizeMode.contain}
                                    onError={() => {
                                        console.log('[LorcanaGridView] Failed to load version image:', {
                                            url: version.Image,
                                            name: version.Name
                                        });
                                    }}
                                />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {/* Only show the Add to Collection button if the card is not collected */}
                    {selectedCard && !selectedCard.collected && (
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={async () => {
                                try {
                                    // Keep a reference to the card we're adding
                                    const cardToAdd = selectedCard!;
                                    
                                    // Close the modal first
                                    setShowVersionModal(false);
                                    
                                    // Add to collection - this will update the database
                                    await addToCollection(cardToAdd);
                                    
                                    // Update selectedCard to reflect that it's now collected
                                    setSelectedCard(prev => prev ? {...prev, collected: true} : null);
                                    
                                    // Force a refresh of all cards to ensure consistent UI state
                                    if (onCardsUpdate) {
                                        const updatedCards = cards.map(c =>
                                            c.Unique_ID === cardToAdd.Unique_ID ? { ...c, collected: true } : c
                                        );
                                        onCardsUpdate(updatedCards);
                                    }
                                } catch (error) {
                                    // Error is handled in the addToCollection function
                                    console.error('[LorcanaGridView] Failed to add to collection:', error);
                                }
                            }}
                        >
                            <Text style={styles.addButtonText}>Add to Collection</Text>
                        </TouchableOpacity>
                    )}
                    {/* Show a Remove from Collection button if the card is already collected */}
                    {selectedCard && selectedCard.collected && (
                        <TouchableOpacity
                            style={styles.removeButton}
                            onPress={async () => {
                                try {
                                    // Keep a reference to the card
                                    const cardToRemove = selectedCard!;
                                    
                                    // Close the modal first
                                    setShowVersionModal(false);
                                    
                                    // Remove from collection by calling the onDeleteCard prop
                                    onDeleteCard(cardToRemove);
                                } catch (error) {
                                    console.error('[LorcanaGridView] Failed to remove from collection:', error);
                                }
                            }}
                        >
                            <Text style={styles.removeButtonText}>Remove from Collection</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => {
                            onDeleteCard(selectedCard!);
                            setShowVersionModal(false);
                        }}
                    >
                        <Text style={styles.deleteButtonText}>Delete Card</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.modalCloseButton}
                        onPress={() => setShowVersionModal(false)}
                    >
                        <Icon name="close" size={24} color="#000" />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    const renderFilters = () => (
        <View style={[styles.filtersPanel, !showFilters && styles.filtersPanelHidden]}>
            <TextInput
                style={styles.searchInput}
                placeholder="Search cards..."
                value={filters.search}
                onChangeText={text => setFilters(prev => ({ ...prev, search: text }))}
            />
            
            <View style={styles.filterSection}>
                <Text style={styles.filterTitle}>Collection Status</Text>
                <View style={styles.filterOptions}>
                    <TouchableOpacity
                        style={[
                            styles.filterChip,
                            filters.collectionStatus === 'all' && styles.filterChipSelected
                        ]}
                        onPress={() => setFilters(prev => ({
                            ...prev,
                            collectionStatus: 'all'
                        }))}
                    >
                        <Text style={[
                            styles.filterChipText,
                            filters.collectionStatus === 'all' && styles.filterChipTextSelected
                        ]}>All Cards</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.filterChip,
                            filters.collectionStatus === 'collected' && styles.filterChipSelected
                        ]}
                        onPress={() => setFilters(prev => ({
                            ...prev,
                            collectionStatus: 'collected'
                        }))}
                    >
                        <Text style={[
                            styles.filterChipText,
                            filters.collectionStatus === 'collected' && styles.filterChipTextSelected
                        ]}>Collected</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.filterChip,
                            filters.collectionStatus === 'missing' && styles.filterChipSelected
                        ]}
                        onPress={() => setFilters(prev => ({
                            ...prev,
                            collectionStatus: 'missing'
                        }))}
                    >
                        <Text style={[
                            styles.filterChipText,
                            filters.collectionStatus === 'missing' && styles.filterChipTextSelected
                        ]}>Missing</Text>
                    </TouchableOpacity>
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
                            onPress={() => setFilters(prev => ({
                                ...prev,
                                rarities: prev.rarities.includes(rarity)
                                    ? prev.rarities.filter(r => r !== rarity)
                                    : [...prev.rarities, rarity]
                            }))}
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
                            onPress={() => setFilters(prev => ({
                                ...prev,
                                colors: prev.colors.includes(color)
                                    ? prev.colors.filter(c => c !== color)
                                    : [...prev.colors, color]
                            }))}
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
                onPress={() => setFilters({
                    search: '',
                    rarities: [],
                    colors: [],
                    collectionStatus: 'all',
                    priceRange: { min: null, max: null }
                })}
            >
                <Text style={styles.resetButtonText}>Reset Filters</Text>
            </TouchableOpacity>
        </View>
    );

    // Function to add a card to the collection
    const addToCollection = async (card: LorcanaCardWithPrice) => {
        try {
            // First, check if the card has a Set_ID to find the appropriate collection
            if (!card.Set_ID) {
                console.error('[LorcanaGridView] Card has no Set_ID, cannot find collection', card);
                throw new Error('Card has no Set_ID');
            }
            
            // Immediately update the UI state for better UX, then verify in database
            if (onCardsUpdate) {
                console.log('[LorcanaGridView] Updating UI immediately for card:', card.Name);
                const updatedCards = cards.map(c =>
                    c.Unique_ID === card.Unique_ID ? { ...c, collected: true } : c
                );
                onCardsUpdate(updatedCards);
            }
            
            // Get database connection
            const database = await getDB();
            
            // Find the collection for this set
            const [collections] = await database.executeSql(
                `SELECT id FROM lorcana_collections 
                 WHERE description LIKE '%(' || ? || ')%'`,
                [card.Set_ID]
            );
            
            let collectionId = null;
            
            if (collections.rows.length > 0) {
                // Use existing collection
                collectionId = collections.rows.item(0).id;
                console.log(`[LorcanaGridView] Found collection ${collectionId} for set ${card.Set_ID}`);
            } else {
                // If no collection exists, create one
                const setName = card.Set_Name || `Set ${card.Set_ID}`;
                console.log(`[LorcanaGridView] No collection found for set ${card.Set_ID}, creating one`);
                
                // Generate a unique ID for the collection
                collectionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
                const now = new Date().toISOString();
                const collectionName = `Set: ${setName}`;
                const description = `Collection for ${setName} (${card.Set_ID})`;
                
                // Create the collection
                await database.executeSql(
                    `INSERT INTO lorcana_collections (id, name, description, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [collectionId, collectionName, description, now, now]
                );
            }
            
            if (!collectionId) {
                throw new Error('Failed to find or create collection');
            }
            
            // Use a transaction to ensure all database updates happen atomically
            await database.transaction(async (tx) => {
                // 1. Use the addCardToLorcanaCollection function which handles most updates
                await addCardToLorcanaCollection(card.Unique_ID, collectionId);
                
                // 2. Explicitly ensure the collected flag is set to 1 in the database
                await tx.executeSql(
                    'UPDATE lorcana_cards SET collected = 1 WHERE Unique_ID = ?',
                    [card.Unique_ID]
                );
                
                // 3. Ensure the card exists in the lorcana_collection_cards table
                const now = new Date().toISOString();
                await tx.executeSql(
                    'INSERT OR REPLACE INTO lorcana_collection_cards (collection_id, card_id, added_at) VALUES (?, ?, ?)',
                    [collectionId, card.Unique_ID, now]
                );
            });
            
            // Verify the card is now marked as collected in the database
            const [verification] = await database.executeSql(
                `SELECT 
                    lc.collected,
                    CASE WHEN lcc.card_id IS NOT NULL THEN 1 ELSE 0 END as in_collection
                 FROM lorcana_cards lc
                 LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                 WHERE lc.Unique_ID = ?`,
                [card.Unique_ID]
            );
            
            if (verification.rows.length > 0) {
                const verifiedCard = verification.rows.item(0);
                const isCollected = Boolean(verifiedCard.collected) || Boolean(verifiedCard.in_collection);
                console.log(`[LorcanaGridView] Verified card collection status: ${isCollected}`);
                
                // Double-check - if somehow the database didn't update correctly, try to fix it
                if (!isCollected) {
                    console.warn('[LorcanaGridView] Card not properly marked as collected, fixing...');
                    await database.executeSql(
                        'UPDATE lorcana_cards SET collected = 1 WHERE Unique_ID = ?',
                        [card.Unique_ID]
                    );
                    
                    // Also ensure it's in the collection_cards table
                    await database.executeSql(
                        'INSERT OR REPLACE INTO lorcana_collection_cards (collection_id, card_id, added_at) VALUES (?, ?, ?)',
                        [collectionId, card.Unique_ID, new Date().toISOString()]
                    );
                    
                    // Force another refresh of the UI after verification
                    if (onCardsUpdate) {
                        const finalUpdatedCards = cards.map(c =>
                            c.Unique_ID === card.Unique_ID ? { ...c, collected: true } : c
                        );
                        onCardsUpdate(finalUpdatedCards);
                    }
                }
            }
            
            // Trigger the collection status refresh to ensure consistency across all components
            refreshCollectionStatus();
            
            // Success feedback
            console.log('[LorcanaGridView] Card added to collection:', card.Name);
            
            // Show feedback toast to the user
            Alert.alert(
                'Success',
                `Added ${card.Name} to your collection`,
                [{ text: 'OK' }]
            );
        } catch (error) {
            console.error('[LorcanaGridView] Error updating card collection status:', error);
            
            // Try to recover UI state if there was an error
            if (onCardsUpdate) {
                // Force a refresh to get the current status from database
                refreshCollectionStatus();
            }
            
            // Show an error alert to the user
            Alert.alert(
                'Error',
                'Failed to add card to collection. Please try again.',
                [{ text: 'OK' }]
            );
        }
    };
    
    // Extract refreshCollectionStatus as a standalone function to be called when needed
    const refreshCollectionStatus = async () => {
        if (cards.length === 0) return;
        
        try {
            const db = await getDB();
            // Get the unique IDs of all cards
            const cardIds = cards.map(card => card.Unique_ID).filter(Boolean);
            
            if (cardIds.length === 0) return;
            
            // Use a more comprehensive query that checks both the lorcana_cards.collected flag
            // and also checks if the card exists in any collection
            const [results] = await db.executeSql(
                `SELECT lc.Unique_ID, 
                        lc.collected, 
                        CASE WHEN lcc.card_id IS NOT NULL THEN 1 ELSE 0 END as in_collection
                 FROM lorcana_cards lc
                 LEFT JOIN lorcana_collection_cards lcc ON lc.Unique_ID = lcc.card_id
                 WHERE lc.Unique_ID IN (${cardIds.map(() => '?').join(',')})`,
                cardIds
            );
            
            // Create a map of card ID to collection status
            const collectionStatusMap = new Map();
            for (let i = 0; i < results.rows.length; i++) {
                const row = results.rows.item(i);
                // A card is collected if either the collected flag is set OR it exists in a collection
                const isCollected = Boolean(row.collected) || Boolean(row.in_collection);
                collectionStatusMap.set(row.Unique_ID, isCollected);
            }
            
            // Check if any cards have inconsistent collection status
            let hasInconsistencies = false;
            const updatedCards = cards.map(card => {
                if (!card.Unique_ID) return card;
                
                const databaseCollected = collectionStatusMap.get(card.Unique_ID);
                if (databaseCollected !== undefined && databaseCollected !== !!card.collected) {
                    hasInconsistencies = true;
                    console.log(`[LorcanaGridView] Fixing inconsistency for card: ${card.Name}, UI: ${!!card.collected}, DB: ${databaseCollected}`);
                    return { ...card, collected: databaseCollected };
                }
                return card;
            });
            
            // If inconsistencies found, update the UI
            if (hasInconsistencies && onCardsUpdate) {
                console.log('[LorcanaGridView] Fixing collection status inconsistencies');
                onCardsUpdate(updatedCards);
            }
        } catch (error) {
            console.error('[LorcanaGridView] Error refreshing collection status:', error);
        }
    };

    // Add the useEffect that calls refreshCollectionStatus when cards change
    useEffect(() => {
        refreshCollectionStatus();
    }, [cards]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.filterButtonContainer}>
                    <TouchableOpacity
                        style={styles.filterButton}
                        onPress={() => setShowFilters(!showFilters)}
                    >
                        <Icon name="filter-variant" size={24} color="#2196F3" />
                        <Text style={styles.buttonText}>
                            Filter
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.sortContainer}>
                    <View style={styles.sortButtonContainer}>
                        <TouchableOpacity
                            style={[styles.sortButton, sortBy === 'name' && styles.sortButtonActive]}
                            onPress={() => setSortBy('name')}
                        >
                            <Icon
                                name="order-alphabetical-ascending"
                                size={24}
                                color={sortBy === 'name' ? '#2196F3' : '#666'}
                            />
                            <Text style={[styles.sortButtonText, sortBy === 'name' && styles.sortButtonTextActive]}>
                                Name
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.sortButtonContainer}>
                        <TouchableOpacity
                            style={[styles.sortButton, sortBy === 'price' && styles.sortButtonActive]}
                            onPress={() => setSortBy('price')}
                        >
                            <Icon
                                name="currency-usd"
                                size={24}
                                color={sortBy === 'price' ? '#2196F3' : '#666'}
                            />
                            <Text style={[styles.sortButtonText, sortBy === 'price' && styles.sortButtonTextActive]}>
                                Price
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.sortButtonContainer}>
                        <TouchableOpacity
                            style={[styles.sortButton, sortBy === 'number' && styles.sortButtonActive]}
                            onPress={() => setSortBy('number')}
                        >
                            <Icon
                                name="order-numeric-ascending"
                                size={24}
                                color={sortBy === 'number' ? '#2196F3' : '#666'}
                            />
                            <Text style={[styles.sortButtonText, sortBy === 'number' && styles.sortButtonTextActive]}>
                                Number
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.sortButtonContainer}>
                        <TouchableOpacity
                            style={styles.sortButton}
                            onPress={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                        >
                            <Icon
                                name={sortDirection === 'asc' ? 'sort-ascending' : 'sort-descending'}
                                size={24}
                                color="#2196F3"
                            />
                            <Text style={styles.sortButtonText}>
                                {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {renderFilters()}

            <FlatList
                data={filteredCards()}
                renderItem={renderCard}
                keyExtractor={item => item.Unique_ID || ''}
                numColumns={3}
                contentContainerStyle={styles.grid}
                onEndReached={loadMoreCards}
                onEndReachedThreshold={0.5}
                ListFooterComponent={isLoadingMore ? <ActivityIndicator size="large" color="#2196F3" /> : null}
            />

            {renderCardModal()}
            {renderVersionModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
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
    filtersPanel: {
        backgroundColor: 'white',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    filtersPanelHidden: {
        display: 'none',
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
    grid: {
        padding: 4,
    },
    cardContainer: {
        flex: 1/3,
        padding: 4,
    },
    cardImageContainer: {
        position: 'relative',
        width: '100%',
        aspectRatio: 0.72,
    },
    cardImage: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
    },
    cardImageUncollected: {
        opacity: 0.5,
    },
    placeholderImage: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    missingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    missingText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 4,
    },
    cardInfoUncollected: {
        opacity: 0.7,
    },
    cardNameUncollected: {
        color: '#999',
    },
    cardPriceUncollected: {
        color: '#999',
    },
    cardInfo: {
        padding: 4,
    },
    cardNumber: {
        fontSize: 10,
        color: '#666',
        marginBottom: 2,
    },
    cardName: {
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 2,
    },
    cardPrice: {
        fontSize: 12,
        color: '#666',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxHeight: '90%',
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 16,
    },
    modalImageContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    modalImage: {
        width: '100%',
        aspectRatio: 0.72,
        borderRadius: 8,
    },
    modalInfo: {
        padding: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    modalText: {
        fontSize: 16,
        marginBottom: 8,
    },
    modalPrices: {
        marginTop: 16,
    },
    modalPriceTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    modalPrice: {
        fontSize: 16,
        marginBottom: 4,
    },
    versionOption: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        alignItems: 'center',
    },
    versionText: {
        fontSize: 16,
    },
    modalCloseButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    deleteButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#f44336',
        borderRadius: 8,
        alignItems: 'center',
    },
    deleteButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    addButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        alignItems: 'center',
    },
    addButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    versionImage: {
        width: '100%',
        height: 200,
        resizeMode: 'contain',
        borderRadius: 8,
        marginTop: 8,
    },
    removeButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#f44336',
        borderRadius: 8,
        alignItems: 'center',
    },
    removeButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
});

export default LorcanaGridView; 