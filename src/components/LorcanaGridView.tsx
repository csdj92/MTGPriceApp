import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import FastImage from "@d11/react-native-fast-image";
import type { LorcanaCardWithPrice, PartialLorcanaCardWithPrice } from '../types/lorcana';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
// Fix the Icon type with a proper type assertion to avoid type errors
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;
import { getLorcanaCardPrice, getDB, addCardToLorcanaCollection, updateAllCardImages } from '../services/LorcanaService';
import { getImageSource, handleImageLoadError, preloadImages, handleImageLoadSuccess, getImageLoadingStats, clearImageCache } from '../utils/imageUtils';

interface LorcanaGridViewProps {
    cards: PartialLorcanaCardWithPrice[];
    isLoading: boolean;
    onCardPress: (card: PartialLorcanaCardWithPrice) => void;
    onDeleteCard: (card: PartialLorcanaCardWithPrice) => void;
    onCardsUpdate?: (updatedCards: PartialLorcanaCardWithPrice[]) => void;
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

// Create a separate CardItem component
const CardItem = React.memo(({ 
    item, 
    isCollected,
    onPress,
    onLongPress
}: { 
    item: PartialLorcanaCardWithPrice; 
    isCollected: boolean;
    onPress: () => void;
    onLongPress: () => void;
}) => {
    const [imageError, setImageError] = useState(false);
    const [fixedImageUrl, setFixedImageUrl] = useState<string | null>(null);
    
    // Debug image URLs
    useEffect(() => {
        if (!item.Image) {
            console.log(`[LorcanaGridView] Card missing image URL: ${item.Name}, Card_Num: ${item.Card_Num}, Unique_ID: ${item.Unique_ID}`);
        } else if (item.Image.includes('lorcana-api.com')) {
            console.log(`[LorcanaGridView] Card has lorcana-api URL: ${item.Name}, URL: ${item.Image}`);
            // The image URL will be fixed by the getImageSource function
        }
    }, [item]);

    // Get the image source, applying the URL fixing if needed
    const imageSource = useMemo(() => {
        return (fixedImageUrl || item.Image) ? 
            getImageSource(fixedImageUrl || item.Image) : null;
    }, [fixedImageUrl, item.Image]);
    
    return (
        <TouchableOpacity 
            style={styles.cardContainer}
            onPress={onPress}
            onLongPress={onLongPress}
        >
            <View style={styles.cardImageContainer}>
                {imageSource ? (
                    <FastImage
                        source={imageSource}
                        style={[
                            styles.cardImage,
                            !isCollected && styles.cardImageUncollected
                        ]}
                        resizeMode={FastImage.resizeMode.contain}
                        onError={() => {
                            console.log(`[LorcanaGridView] Image load error for ${item.Name}: ${item.Image}`);
                            handleImageLoadError(item.Image, item.Name);
                            setImageError(true);
                        }}
                        onLoad={() => {
                            handleImageLoadSuccess(item.Image, { name: item.Name, id: item.Unique_ID });
                            setImageError(false);
                        }}
                    />
                ) : (
                    <View style={[styles.cardImage, styles.placeholderImage]}>
                        <Icon name={imageError ? "image-broken" : "image-off"} size={24} color="#666" />
                        {imageError && (
                            <Text style={styles.imageErrorText}>Loading Error</Text>
                        )}
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
});

// Create a separate CardDetailModal component
const CardDetailModal = React.memo(({
    selectedCard, 
    visible, 
    onClose
}: {
    selectedCard: PartialLorcanaCardWithPrice | null;
    visible: boolean;
    onClose: () => void;
}) => {
    const [modalImageError, setModalImageError] = useState(false);
    
    if (!selectedCard) return null;
    
    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <ScrollView>
                        <View style={styles.modalImageContainer}>
                            {selectedCard.Image && !modalImageError ? (
                                <FastImage
                                    source={getImageSource(selectedCard.Image) || { uri: selectedCard.Image }}
                                    style={styles.modalImage}
                                    resizeMode={FastImage.resizeMode.contain}
                                    onError={() => {
                                        handleImageLoadError(selectedCard.Image, selectedCard.Name);
                                        setModalImageError(true);
                                    }}
                                    onLoad={() => {
                                        handleImageLoadSuccess(selectedCard.Image, { 
                                            name: selectedCard.Name, 
                                            id: selectedCard.Unique_ID, 
                                            context: 'modal' 
                                        });
                                        setModalImageError(false);
                                    }}
                                />
                            ) : (
                                <View style={[styles.modalImage, styles.placeholderImage]}>
                                    <Icon name={modalImageError ? "image-broken" : "image-off"} size={48} color="#666" />
                                    {modalImageError && (
                                        <TouchableOpacity 
                                            style={styles.refreshImageButton}
                                            onPress={() => {
                                                // Clear error state to retry image load
                                                setModalImageError(false);
                                            }}
                                        >
                                            <Icon name="refresh" size={24} color="#2196F3" />
                                            <Text style={styles.refreshImageText}>Retry</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={onClose}
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
                </View>
            </View>
        </Modal>
    );
});

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
    const [selectedCard, setSelectedCard] = useState<PartialLorcanaCardWithPrice | null>(null);
    const [updatingPrices, setUpdatingPrices] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [showVersionModal, setShowVersionModal] = useState(false);
    const [availableVersions, setAvailableVersions] = useState<PartialLorcanaCardWithPrice[]>([]);
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
                (card.Unique_ID ? !failedPriceLookups.current.has(card.Unique_ID) : true)
            );
            
            if (cardsNeedingPrices.length === 0) {
                setUpdatingPrices(false);
                return;
            }

            const updatePromises = cardsNeedingPrices.map(async (card) => {
                if (card.Name && card.Set_Num && card.Rarity) {
                    console.log(`[LorcanaGridView] Updating price for card: ${card.Name}, Set_Num: ${card.Set_Num}, Card_Num: ${card.Card_Num}, Rarity: ${card.Rarity}, Unique_ID: ${card.Unique_ID}`);
                    try {
                        const prices = await getLorcanaCardPrice({
                            Name: card.Name,
                            Set_Num: card.Set_Num,
                            Card_Num: card.Card_Num,
                            Rarity: card.Rarity,
                            Unique_ID: card.Unique_ID
                        });
                        
                        if (!prices) {
                            // Add to failed lookups if no price was found
                            if (card.Unique_ID) {
                                failedPriceLookups.current.add(card.Unique_ID);
                            }
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
                        if (card.Unique_ID) {
                            failedPriceLookups.current.add(card.Unique_ID);
                        }
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

    const handleLongPress = (card: PartialLorcanaCardWithPrice) => {
        setSelectedCard(null); // Close the card details modal first
        // Fetch available versions for the card
        fetchAvailableVersions(card);
        setSelectedCard(card);
        setShowVersionModal(true);
    };

    const fetchAvailableVersions = async (card: PartialLorcanaCardWithPrice) => {
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

    const handleVersionChange = async (newVersion: PartialLorcanaCardWithPrice) => {
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

    // Add a function to preload card images for better performance
    const preloadCardImages = useCallback(() => {
        if (!cards || cards.length === 0) return;
        
        // Extract all valid image URLs
        const imageUrls = cards
            .map(card => card.Image)
            .filter(Boolean) as string[];
        
        if (imageUrls.length > 0) {
            console.log(`[LorcanaGridView] Preloading ${imageUrls.length} card images`);
            // Our enhanced preloadImages will now handle cache checking
            preloadImages(imageUrls);
        }
    }, [cards]);

    // Preload images when cards change
    useEffect(() => {
        preloadCardImages();
    }, [preloadCardImages]);

    // Add a function to view image loading statistics for debugging
    const showImageLoadingStats = () => {
        const stats = getImageLoadingStats();
        console.log('[LorcanaGridView] Image Loading Statistics:', stats);
        
        Alert.alert(
            'Image Loading Stats',
            `Total successful: ${stats.totalSuccessfulImages}\n` +
            `Total failed: ${stats.totalFailedImages}\n` +
            `Cooling down: ${stats.coolingDownImages}\n` +
            `Recent successful: ${stats.recentlySuccessfulImages}`,
            [
                { 
                    text: 'Reset Cache',
                    onPress: async () => {
                        try {
                            await clearImageCache();
                            Alert.alert('Success', 'Image cache cleared');
                            // Force reload cards
                            preloadCardImages();
                        } catch (error) {
                            console.error('[LorcanaGridView] Error clearing cache:', error);
                            Alert.alert('Error', 'Failed to clear cache');
                        }
                    },
                    style: 'destructive'
                },
                { text: 'OK' }
            ]
        );
    };

    

    // Replace the renderCard function with a wrapper that uses our component
    const renderCard = ({ item }: { item: PartialLorcanaCardWithPrice }) => {
        // Force boolean evaluation to ensure consistent behavior
        const isCollected = !!item.collected;
        return (
            <CardItem
                item={item}
                isCollected={isCollected}
                onPress={() => setSelectedCard(item)}
                onLongPress={() => handleLongPress(item)}
            />
        );
    };

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
                                {version.Image ? (
                                    <FastImage
                                        source={getImageSource(version.Image) || { 
                                            uri: version.Image,
                                            priority: FastImage.priority.high,
                                            cache: FastImage.cacheControl.immutable
                                        }}
                                        style={styles.versionImage}
                                        resizeMode={FastImage.resizeMode.contain}
                                        onError={() => {
                                            console.log(`[LorcanaGridView] Version image load error for ${version.Name}: ${version.Image}`);
                                            handleImageLoadError(version.Image, version.Name);
                                        }}
                                        onLoad={() => {
                                            console.log(`[LorcanaGridView] Version image loaded successfully: ${version.Name}`);
                                            handleImageLoadSuccess(version.Image, { 
                                                name: version.Name, 
                                                id: version.Unique_ID, 
                                                context: 'version_modal'
                                            });
                                        }}
                                    />
                                ) : (
                                    <View style={[styles.versionImage, {backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center'}]}>
                                        <Icon name="image-off" size={24} color="#666" />
                                    </View>
                                )}
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
    const addToCollection = async (card: PartialLorcanaCardWithPrice) => {
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
                console.log(`[LorcanaGridView] Using existing collection for card: ${card.Name}`);
            } else {
                console.log(`[LorcanaGridView] No existing collection found for card: ${card.Name}, creating new collection`);
                // Create new collection
                await database.executeSql(
                    `INSERT INTO lorcana_collections (description) VALUES (?)`,
                    [card.Set_Name]
                );
                const [newCollection] = await database.executeSql(
                    `SELECT id FROM lorcana_collections WHERE description = ?`,
                    [card.Set_Name]
                );
                collectionId = newCollection.rows.item(0).id;
            }
            
            // Add card to collection
            await database.executeSql(
                `INSERT INTO lorcana_collection_cards (card_id, collection_id) VALUES (?, ?)`,
                [card.Unique_ID, collectionId]
            );
            
            console.log(`[LorcanaGridView] Card ${card.Name} added to collection`);
        } catch (error) {
            console.error('[LorcanaGridView] Error adding card to collection:', error);
        }
    };

    return (
        <View style={styles.container}>
            {renderFilters()}
            <FlatList
                data={filteredCards()}
                renderItem={renderCard}
                keyExtractor={(item) => (item.Unique_ID || Math.random().toString()).toString()}
                numColumns={3}
                contentContainerStyle={styles.flatListContent}
                onEndReached={loadMoreCards}
                onEndReachedThreshold={0.5}
            />
            {renderVersionModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    filtersPanel: {
        padding: 10,
    },
    filtersPanelHidden: {
        display: 'none',
    },
    searchInput: {
        height: 40,
        borderColor: 'gray',
        borderWidth: 1,
        marginBottom: 10,
        padding: 10,
    },
    filterSection: {
        marginBottom: 10,
    },
    filterTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    filterOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    filterChip: {
        padding: 5,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        marginRight: 5,
        marginBottom: 5,
    },
    filterChipSelected: {
        backgroundColor: '#007bff',
        borderColor: '#0056b3',
    },
    filterChipText: {
        fontSize: 14,
    },
    filterChipTextSelected: {
        fontWeight: 'bold',
        color: '#fff',
    },
    resetButton: {
        backgroundColor: '#dc3545',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
    },
    resetButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    flatListContent: {
        padding: 10,
    },
    cardContainer: {
        flex: 1,
        margin: 5,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        overflow: 'hidden',
    },
    cardImageContainer: {
        height: 150,
        overflow: 'hidden',
    },
    cardImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    cardImageUncollected: {
        opacity: 0.5,
    },
    cardInfo: {
        padding: 10,
    },
    cardInfoUncollected: {
        opacity: 0.5,
    },
    cardNumber: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    cardName: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    cardNameUncollected: {
        opacity: 0.5,
    },
    cardPrice: {
        fontSize: 14,
    },
    cardPriceUncollected: {
        opacity: 0.5,
    },
    missingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    missingText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 10,
        width: '80%',
        maxHeight: '80%',
    },
    modalImageContainer: {
        height: 200,
        overflow: 'hidden',
        marginBottom: 10,
    },
    modalImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    modalInfo: {
        marginBottom: 10,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    modalText: {
        fontSize: 14,
    },
    modalPrices: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    modalPriceTitle: {
        fontWeight: 'bold',
        marginRight: 10,
    },
    modalPrice: {
        fontSize: 14,
    },
    refreshImageButton: {
        padding: 10,
        backgroundColor: '#007bff',
        borderRadius: 5,
        alignItems: 'center',
    },
    refreshImageText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    modalCloseButton: {
        position: 'absolute',
        top: 10,
        right: 10,
    },
    versionOption: {
        padding: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        margin: 5,
        alignItems: 'center',
    },
    versionText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    versionImage: {
        width: 100,
        height: 100,
    },
    addButton: {
        backgroundColor: '#28a745',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
    },
    addButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    removeButton: {
        backgroundColor: '#dc3545',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
    },
    removeButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    deleteButton: {
        backgroundColor: '#dc3545',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
    },
    deleteButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    placeholderImage: {
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageErrorText: {
        color: 'red',
        fontSize: 12,
        marginTop: 5,
    },
});

export default LorcanaGridView;