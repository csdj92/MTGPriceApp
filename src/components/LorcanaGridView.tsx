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
    ActivityIndicator
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../types/lorcana';
import { getLorcanaCardPrice, getDB } from '../services/LorcanaService';

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

    const loadMoreCards = async () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);

        try {
            // Logic to load more cards goes here
            // For example, you might fetch more cards from an API or database
            // and then update the state with the new cards
        } catch (error) {
            console.error('Error loading more cards:', error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const renderCard = ({ item }: { item: LorcanaCardWithPrice }) => {
        return (
            <TouchableOpacity 
                style={styles.cardContainer}
                onPress={() => setSelectedCard(item)}
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
                                !item.collected && styles.cardImageUncollected
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
                    {!item.collected && (
                        <View style={styles.missingOverlay}>
                            <Icon name="plus-circle" size={24} color="white" />
                            <Text style={styles.missingText}>Missing</Text>
                        </View>
                    )}
                </View>
                <View style={[styles.cardInfo, !item.collected && styles.cardInfoUncollected]}>
                    <Text style={styles.cardNumber}>#{item.Card_Num || '0'}</Text>
                    <Text style={[styles.cardName, !item.collected && styles.cardNameUncollected]} numberOfLines={1}>
                        {item.Name}
                    </Text>
                    <Text style={[styles.cardPrice, !item.collected && styles.cardPriceUncollected]}>
                        ${item.prices?.usd ? Number(item.prices.usd).toFixed(2) : '0.00'}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

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

    const renderCardModal = () => (
        <Modal
            visible={selectedCard !== null}
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
                                    source={{ 
                                        uri: selectedCard.Image,
                                        priority: FastImage.priority.high,
                                        cache: FastImage.cacheControl.immutable
                                    }}
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
                                <Text style={styles.modalText}>Card Number: {selectedCard.Card_Num}</Text>
                                <Text style={styles.modalText}>Rarity: {selectedCard.Rarity}</Text>
                                <Text style={styles.modalText}>Color: {selectedCard.Color}</Text>
                                <Text style={styles.modalText}>Cost: {selectedCard.Cost}</Text>
                                <Text style={styles.modalText}>Strength/Willpower: {selectedCard.Strength} / {selectedCard.Willpower}</Text>
                                {selectedCard.Body_Text && (
                                    <Text style={styles.modalText}>Card Text: {selectedCard.Body_Text}</Text>
                                )}
                                {selectedCard.Flavor_Text && (
                                    <Text style={styles.modalFlavorText}>{selectedCard.Flavor_Text}</Text>
                                )}
                                <View style={styles.modalPrices}>
                                    <Text style={styles.modalPriceTitle}>Prices:</Text>
                                    <Text style={styles.modalPrice}>Normal: ${selectedCard.prices?.usd || '0.00'}</Text>
                                    <Text style={styles.modalPrice}>Foil: ${selectedCard.prices?.usd_foil || '0.00'}</Text>
                                </View>
                            </View>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );

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
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    pageButton: {
        padding: 8,
    },
    pageButtonDisabled: {
        opacity: 0.5,
    },
    pageText: {
        marginHorizontal: 16,
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
    modalFlavorText: {
        fontSize: 16,
        fontStyle: 'italic',
        color: '#666',
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
    placeholderImage: {
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%'
    },
});

export default LorcanaGridView; 