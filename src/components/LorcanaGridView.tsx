import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    Image,
    Modal,
    ScrollView,
    Dimensions
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../types/lorcana';

interface LorcanaGridViewProps {
    cards: LorcanaCardWithPrice[];
    isLoading: boolean;
    onCardPress: (card: LorcanaCardWithPrice) => void;
    onDeleteCard: (card: LorcanaCardWithPrice) => void;
}

type SortOption = 'name' | 'price' | 'number';
type SortDirection = 'asc' | 'desc';

interface Filters {
    search: string;
    rarities: string[];
    colors: string[];
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
    onDeleteCard
}) => {
    // State
    const [filters, setFilters] = useState<Filters>({
        search: '',
        rarities: [],
        colors: [],
        priceRange: { min: null, max: null }
    });
    const [showFilters, setShowFilters] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>('number');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedCard, setSelectedCard] = useState<LorcanaCardWithPrice | null>(null);

    // Filter options
    const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary'];
    const colorOptions = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];

    // Filter and sort cards
    const filteredCards = useCallback(() => {
        return cards.filter(card => {
            // Text search
            if (filters.search && !card.Name?.toLowerCase().includes(filters.search.toLowerCase()) &&
                !card.Body_Text?.toLowerCase().includes(filters.search.toLowerCase())) {
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

    // Pagination
    const totalPages = Math.ceil(filteredCards().length / ITEMS_PER_PAGE);
    const paginatedCards = filteredCards().slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const renderCard = ({ item }: { item: LorcanaCardWithPrice }) => (
        <TouchableOpacity 
            style={styles.cardContainer}
            onPress={() => setSelectedCard(item)}
        >
            <Image
                source={{ uri: item.Image }}
                style={styles.cardImage}
                resizeMode="contain"
            />
            <View style={styles.cardInfo}>
                <Text style={styles.cardName} numberOfLines={1}>{item.Name}</Text>
                <Text style={styles.cardPrice}>
                    ${item.prices?.usd || '0.00'}
                </Text>
            </View>
        </TouchableOpacity>
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
                                <Image
                                    source={{ uri: selectedCard.Image }}
                                    style={styles.modalImage}
                                    resizeMode="contain"
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
                data={paginatedCards}
                renderItem={renderCard}
                keyExtractor={item => item.Unique_ID || ''}
                numColumns={3}
                contentContainerStyle={styles.grid}
            />

            <View style={styles.pagination}>
                <TouchableOpacity
                    style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                    onPress={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                >
                    <Icon name="page-first" size={24} color={currentPage === 1 ? '#ccc' : '#2196F3'} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                    onPress={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                >
                    <Icon name="chevron-left" size={24} color={currentPage === 1 ? '#ccc' : '#2196F3'} />
                </TouchableOpacity>
                <Text style={styles.pageText}>
                    Page {currentPage} of {totalPages}
                </Text>
                <TouchableOpacity
                    style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                    onPress={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                >
                    <Icon name="chevron-right" size={24} color={currentPage === totalPages ? '#ccc' : '#2196F3'} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                    onPress={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                >
                    <Icon name="page-last" size={24} color={currentPage === totalPages ? '#ccc' : '#2196F3'} />
                </TouchableOpacity>
            </View>

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
    cardImage: {
        width: '100%',
        aspectRatio: 0.72,
        borderRadius: 8,
    },
    cardInfo: {
        padding: 4,
    },
    cardName: {
        fontSize: 12,
        fontWeight: '500',
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
});

export default LorcanaGridView; 