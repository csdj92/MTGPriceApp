import React, { useState, useCallback } from 'react';
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
    Alert,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { ExtendedCard } from '../types/card';
import { databaseService } from '../services/DatabaseService';
import { getDB } from '../services/DatabaseService';

interface MTGGridViewProps {
    cards: ExtendedCard[];
    isLoading: boolean;
    onCardPress: (card: ExtendedCard) => void;
    onDeleteCard: (card: ExtendedCard) => void;
    onCardsUpdate?: (updatedCards: ExtendedCard[]) => void;
    collectionId: string;
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

interface CardRow {
    uuid: string;
    name: string;
    setCode: string;
    number: string;
    rarity: string;
    type: string;
    setName: string;
    normal_price: number;
    foil_price: number;
    tcg_normal_price: number;
    tcg_foil_price: number;
    cardmarket_normal_price: number;
    cardmarket_foil_price: number;
}

const getBestPrice = (prices: any, isFoil: boolean = false) => {
    if (!prices) return 0;
    
    // First try USD price
    if (isFoil && prices.usdFoil) {
        return parseFloat(prices.usdFoil);
    }
    if (!isFoil) {
        if (prices.usd) {
            return parseFloat(prices.usd);
        }
        // If no normal price, try using foil price as fallback
        if (prices.usdFoil) {
            return parseFloat(prices.usdFoil);
        }
    }
    
    // Then try normal/foil direct price
    if (isFoil && prices.foil) {
        return parseFloat(prices.foil);
    }
    if (!isFoil) {
        if (prices.normal) {
            return parseFloat(prices.normal);
        }
        // If no normal price, try using foil price as fallback
        if (prices.foil) {
            return parseFloat(prices.foil);
        }
    }
    
    // Try TCGPlayer
    if (prices.tcgplayer?.retail) {
        const tcgPrices = prices.tcgplayer.retail;
        if (isFoil && tcgPrices.foil) {
            const dates = Object.keys(tcgPrices.foil);
            if (dates.length > 0) {
                const latestDate = dates.sort().pop()!;
                return tcgPrices.foil[latestDate];
            }
        }
        if (!isFoil) {
            if (tcgPrices.normal) {
                const dates = Object.keys(tcgPrices.normal);
                if (dates.length > 0) {
                    const latestDate = dates.sort().pop()!;
                    return tcgPrices.normal[latestDate];
                }
            }
            // If no normal price, try using foil price as fallback
            if (tcgPrices.foil) {
                const dates = Object.keys(tcgPrices.foil);
                if (dates.length > 0) {
                    const latestDate = dates.sort().pop()!;
                    return tcgPrices.foil[latestDate];
                }
            }
        }
    }
    
    // Try CardKingdom
    if (prices.cardkingdom?.retail) {
        const ckPrices = prices.cardkingdom.retail;
        if (isFoil && ckPrices.foil) {
            const dates = Object.keys(ckPrices.foil);
            if (dates.length > 0) {
                const latestDate = dates.sort().pop()!;
                return ckPrices.foil[latestDate];
            }
        }
        if (!isFoil) {
            if (ckPrices.normal) {
                const dates = Object.keys(ckPrices.normal);
                if (dates.length > 0) {
                    const latestDate = dates.sort().pop()!;
                    return ckPrices.normal[latestDate];
                }
            }
            // If no normal price, try using foil price as fallback
            if (ckPrices.foil) {
                const dates = Object.keys(ckPrices.foil);
                if (dates.length > 0) {
                    const latestDate = dates.sort().pop()!;
                    return ckPrices.foil[latestDate];
                }
            }
        }
    }
    
    return 0;
};

const MTGGridView: React.FC<MTGGridViewProps> = ({
    cards,
    isLoading,
    onCardPress,
    onDeleteCard,
    onCardsUpdate,
    collectionId
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
    const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
    const [showFoil, setShowFoil] = useState(false);
    const [showVersionModal, setShowVersionModal] = useState(false);
    const [availableVersions, setAvailableVersions] = useState<ExtendedCard[]>([]);

    // Filter options
    const rarityOptions = ['common', 'uncommon', 'rare', 'mythic'];
    const colorOptions = ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless', 'Multicolor'];

    // Filter and sort cards
    const filteredCards = useCallback(() => {
        return cards.filter(card => {
            // Text search
            if (filters.search && !card.name?.toLowerCase().includes(filters.search.toLowerCase()) &&
                !card.text?.toLowerCase().includes(filters.search.toLowerCase())) {
                return false;
            }

            // Collection status filter
            if (filters.collectionStatus === 'collected' && !card.quantity) {
                return false;
            }
            if (filters.collectionStatus === 'missing' && card.quantity) {
                return false;
            }

            // Rarity filter
            if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity?.toLowerCase() || '')) {
                return false;
            }

            // Price range filter
            const price = getBestPrice(card.prices);
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
                        ? (a.name || '').localeCompare(b.name || '')
                        : (b.name || '').localeCompare(a.name || '');
                case 'price':
                    const priceA = getBestPrice(a.prices);
                    const priceB = getBestPrice(b.prices);
                    return sortDirection === 'asc' ? priceA - priceB : priceB - priceA;
                case 'number':
                default:
                    const numA = parseInt(a.collectorNumber || '0');
                    const numB = parseInt(b.collectorNumber || '0');
                    return sortDirection === 'asc' ? numA - numB : numB - numA;
            }
        });
    }, [cards, filters, sortBy, sortDirection]);

    const handleLongPress = async (card: ExtendedCard) => {
        try {
            // Fetch all variants including foils and alternate arts from the MTGJson database
            const db = await getDB();
            const [results] = await db!.executeSql(`
                SELECT 
                    c.uuid,
                    c.name,
                    c.setCode,
                    c.number,
                    c.rarity,
                    c.type,
                    s.name as setName,
                    COALESCE(p.normal_price, 0) as normal_price,
                    COALESCE(p.foil_price, 0) as foil_price,
                    COALESCE(p.tcg_normal_price, 0) as tcg_normal_price,
                    COALESCE(p.tcg_foil_price, 0) as tcg_foil_price,
                    COALESCE(p.cardmarket_normal_price, 0) as cardmarket_normal_price,
                    COALESCE(p.cardmarket_foil_price, 0) as cardmarket_foil_price
                FROM cards c
                LEFT JOIN prices p ON c.uuid = p.uuid
                LEFT JOIN sets s ON c.setCode = s.code
                WHERE c.name = ?
                ORDER BY s.releaseDate DESC`,
                [card.name]
            );

            const variants = results.rows.raw().map((row: CardRow) => ({
                ...card,
                id: row.uuid,
                uuid: row.uuid,
                setCode: row.setCode,
                setName: row.setName,
                collectorNumber: row.number,
                type: row.type,
                rarity: row.rarity,
                imageUris: {
                    small: `https://api.scryfall.com/cards/${row.setCode.toLowerCase()}/${row.number}?format=image&version=small`,
                    normal: `https://api.scryfall.com/cards/${row.setCode.toLowerCase()}/${row.number}?format=image&version=normal`,
                    large: `https://api.scryfall.com/cards/${row.setCode.toLowerCase()}/${row.number}?format=image&version=large`,
                    art_crop: `https://api.scryfall.com/cards/${row.setCode.toLowerCase()}/${row.number}?format=image&version=art_crop`
                },
                hasNonFoil: Boolean(row.normal_price || row.tcg_normal_price || row.cardmarket_normal_price),
                hasFoil: Boolean(row.foil_price || row.tcg_foil_price || row.cardmarket_foil_price)
            }));
            
            setAvailableVersions(variants);
            setSelectedCard(card);
            setShowVersionModal(true);
        } catch (error) {
            console.error('Error fetching card variants:', error);
            Alert.alert('Error', 'Failed to load card variants');
        }
    };

    const handleVersionChange = (newVersion: ExtendedCard) => {
        if (onCardsUpdate) {
            const updatedCards = cards.map(card =>
                card.id === selectedCard?.id ? newVersion : card
            );
            onCardsUpdate(updatedCards);
        }
        setShowVersionModal(false);
    };

    const addToCollection = async (card: ExtendedCard) => {
        try {
            // Add card to collection using DatabaseService
            await databaseService.addCardToCollection(String(card.id), collectionId);
            
            // Update the UI state
            if (onCardsUpdate) {
                const updatedCards = cards.map(c =>
                    c.id === card.id ? { ...c, quantity: 1 } : c
                );
                onCardsUpdate(updatedCards);
            }
            
            // Update the selected card's state
            setSelectedCard(prev => prev ? { ...prev, quantity: 1 } : null);
            
            setShowVersionModal(false);
        } catch (error) {
            console.error('Error adding card to collection:', error);
            Alert.alert('Error', 'Failed to add card to collection');
        }
    };

    const renderCard = ({ item }: { item: ExtendedCard }) => {
        const imageUrl = item.imageUris?.normal || item.imageUrl;
        return (
            <TouchableOpacity 
                style={styles.cardContainer}
                onPress={() => setSelectedCard(item)}
                onLongPress={() => handleLongPress(item)}
            >
                <View style={styles.cardImageContainer}>
                    <FastImage
                        source={{ 
                            uri: imageUrl,
                            priority: FastImage.priority.normal,
                            cache: FastImage.cacheControl.immutable
                        }}
                        style={[
                            styles.cardImage,
                            !item.quantity && styles.cardImageUncollected
                        ]}
                        resizeMode={FastImage.resizeMode.contain}
                    />
                    {!item.quantity && (
                        <View style={styles.missingOverlay}>
                            <Icon name="plus-circle" size={24} color="white" />
                            <Text style={styles.missingText}>Missing</Text>
                        </View>
                    )}
                    {item.hasFoil && (
                        <View style={styles.foilIndicator}>
                            <Icon name="star" size={16} color="#FFD700" />
                        </View>
                    )}
                </View>
                <View style={[styles.cardInfo, !item.quantity && styles.cardInfoUncollected]}>
                    <Text style={styles.cardNumber}>#{item.collectorNumber || '0'}</Text>
                    <Text style={[styles.cardName, !item.quantity && styles.cardNameUncollected]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <View style={styles.priceContainer}>
                        {item.hasNonFoil && (
                            <Text style={[styles.cardPrice, !item.quantity && styles.cardPriceUncollected]}>
                                ${getBestPrice(item.prices, false).toFixed(2)}
                            </Text>
                        )}
                        {item.hasFoil && (
                            <Text style={[styles.foilPrice, !item.quantity && styles.cardPriceUncollected]}>
                                ${getBestPrice(item.prices, true).toFixed(2)} ✨
                            </Text>
                        )}
                    </View>
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
            onRequestClose={() => {
                setSelectedCard(null);
                setShowFoil(false);
            }}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    {selectedCard && (
                        <ScrollView>
                            <View style={styles.modalImageContainer}>
                                <FastImage
                                    source={{ 
                                        uri: `${selectedCard.imageUris?.normal || selectedCard.imageUrl}${showFoil ? '&version=foil' : ''}`,
                                        priority: FastImage.priority.high,
                                        cache: FastImage.cacheControl.immutable
                                    }}
                                    style={styles.modalImage}
                                    resizeMode={FastImage.resizeMode.contain}
                                />
                                <TouchableOpacity
                                    style={styles.modalCloseButton}
                                    onPress={() => {
                                        setSelectedCard(null);
                                        setShowFoil(false);
                                    }}
                                >
                                    <Icon name="close" size={28} color="#666" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.modalInfo}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>{selectedCard.name}</Text>
                                    {selectedCard.hasFoil && (
                                        <TouchableOpacity 
                                            style={[styles.foilToggle, showFoil && styles.foilToggleActive]}
                                            onPress={() => setShowFoil(!showFoil)}
                                        >
                                            <Icon 
                                                name={showFoil ? "checkbox-marked" : "checkbox-blank-outline"} 
                                                size={24} 
                                                color={showFoil ? "#FFD700" : "#666"} 
                                            />
                                            <Text style={[styles.foilToggleText, showFoil && styles.foilToggleTextActive]}>
                                                Foil
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <Text style={styles.modalText}>Set: {selectedCard.setName}</Text>
                                <Text style={styles.modalText}>Card Number: {selectedCard.collectorNumber}</Text>
                                <Text style={styles.modalText}>Rarity: {selectedCard.rarity}</Text>
                                <Text style={styles.modalText}>Type: {selectedCard.type}</Text>
                                {selectedCard.manaCost && (
                                    <Text style={styles.modalText}>Mana Cost: {selectedCard.manaCost}</Text>
                                )}
                                {selectedCard.text && (
                                    <Text style={styles.modalText}>Card Text: {selectedCard.text}</Text>
                                )}
                                <View style={styles.modalPrices}>
                                    <Text style={styles.modalPriceTitle}>Prices:</Text>
                                    {selectedCard.hasNonFoil && (
                                        <Text style={styles.modalPrice}>Normal: ${getBestPrice(selectedCard.prices, false).toFixed(2)}</Text>
                                    )}
                                    {selectedCard.hasFoil && (
                                        <Text style={styles.modalPrice}>Foil: ${getBestPrice(selectedCard.prices, true).toFixed(2)}</Text>
                                    )}
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
                                key={version.id}
                                style={styles.versionOption}
                                onPress={() => handleVersionChange(version)}
                            >
                                <View style={styles.versionRow}>
                                    <FastImage
                                        source={{ 
                                            uri: version.imageUris?.normal || version.imageUrl,
                                            priority: FastImage.priority.normal,
                                            cache: FastImage.cacheControl.immutable
                                        }}
                                        style={styles.versionImage}
                                        resizeMode={FastImage.resizeMode.contain}
                                    />
                                    <View style={styles.versionInfo}>
                                        <Text style={styles.versionText}>{version.name}</Text>
                                        <Text style={styles.versionSetText}>{version.setName}</Text>
                                        <Text style={styles.versionText}>Set Number: {version.collectorNumber}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {!selectedCard?.quantity && (
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => {
                                addToCollection(selectedCard!);
                            }}
                        >
                            <Text style={styles.addButtonText}>Add to Collection</Text>
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
                keyExtractor={item => item.id}
                numColumns={3}
                contentContainerStyle={styles.grid}
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
    cardInfo: {
        padding: 4,
    },
    cardInfoUncollected: {
        opacity: 0.7,
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
    cardNameUncollected: {
        color: '#999',
    },
    cardPrice: {
        fontSize: 12,
        color: '#666',
    },
    cardPriceUncollected: {
        color: '#999',
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
    foilIndicator: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 12,
        padding: 4,
    },
    priceContainer: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
    },
    foilPrice: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    foilToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 4,
        backgroundColor: '#f5f5f5',
        gap: 4,
    },
    foilToggleActive: {
        backgroundColor: '#2196F3',
    },
    foilToggleText: {
        fontSize: 14,
        color: '#666',
    },
    foilToggleTextActive: {
        color: 'white',
    },
    versionOption: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    versionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    versionImage: {
        width: 60,
        height: 84,
        borderRadius: 4,
        marginRight: 12,
    },
    versionInfo: {
        flex: 1,
    },
    versionText: {
        fontSize: 16,
        marginBottom: 4,
    },
    versionSetText: {
        fontSize: 14,
        color: '#666',
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
});

export default MTGGridView; 