import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import { useTheme } from '../../context/ThemeContext';
import { ExtendedCard } from '../../types/card';
import { AllPrintingsJsonDatabase } from '../../services/database/AllPrintingsJsonDatabase';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { getImageSource, handleImageLoadSuccess, handleImageLoadError } from '../../utils/imageUtils';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<any>;

interface VariationsTabProps {
    card: ExtendedCard;
    onVersionChange: (card: ExtendedCard) => void;
    highlightOriginalScan?: boolean;
    preloadedVariations?: ExtendedCard[];
}

// Function to get best price for a card
const getBestPrice = (prices: any, isFoil: boolean = false): number => {
    if (!prices) return 0;

    if (isFoil) {
        // Try to get foil prices in order of preference
        if (prices.usdFoil && !isNaN(parseFloat(prices.usdFoil))) {
            return parseFloat(prices.usdFoil);
        } else if (prices.foil && !isNaN(parseFloat(prices.foil))) {
            return parseFloat(prices.foil);
        } else if (prices.tcgplayer?.foil && !isNaN(parseFloat(prices.tcgplayer.foil))) {
            return parseFloat(prices.tcgplayer.foil);
        } else if (prices.cardmarket?.foil && !isNaN(parseFloat(prices.cardmarket.foil))) {
            return parseFloat(prices.cardmarket.foil);
        }
    } else {
        // Try to get normal prices in order of preference
        if (prices.usd && !isNaN(parseFloat(prices.usd))) {
            return parseFloat(prices.usd);
        } else if (prices.normal && !isNaN(parseFloat(prices.normal))) {
            return parseFloat(prices.normal);
        } else if (prices.tcgplayer?.normal && !isNaN(parseFloat(prices.tcgplayer.normal))) {
            return parseFloat(prices.tcgplayer.normal);
        } else if (prices.cardmarket?.normal && !isNaN(parseFloat(prices.cardmarket.normal))) {
            return parseFloat(prices.cardmarket.normal);
        }
    }

    return 0;
};

// Function to format price nicely
const getFormattedPrice = (price: number): string => 
    new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);

const VariationsTab: React.FC<VariationsTabProps> = ({ 
    card, 
    onVersionChange,
    highlightOriginalScan = false,
    preloadedVariations
}) => {
    const [variations, setVariations] = useState<ExtendedCard[]>([]);
    const [loading, setLoading] = useState(!preloadedVariations);
    const [currentCard, setCurrentCard] = useState<ExtendedCard | null>(card);
    const { theme, isDark } = useTheme();

    // Function to load variations
    useEffect(() => {
        if (preloadedVariations) {
            // Use preloaded variations if provided
            setVariations(preloadedVariations);
            setLoading(false);
        } else {
            // Otherwise load them as before
            loadVariations();
        }
    }, [preloadedVariations]); // Only reload if preloadedVariations changes

    const loadVariations = async () => {
        try {
            setLoading(true);
            
            // Only load variations if preloadedVariations isn't provided
            if (!preloadedVariations) {
                // Original loading logic
                const variantCards = await AllPrintingsJsonDatabase.getInstance().getCardVariants(card.name);
                setVariations(variantCards);
            }
            
            setLoading(false);
        } catch (error) {
            console.error('Error loading variants:', error);
            setLoading(false);
        }
    };

    const handleVersionSelect = (variant: ExtendedCard) => {
        setCurrentCard(variant);
        onVersionChange(variant);
    };

    if (loading) {
        return (
            <View style={[styles.tabContent, styles.centerContent]}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                    Finding other versions...
                </Text>
            </View>
        );
    }

    if (variations.length === 0) {
        return (
            <View style={[styles.tabContent, styles.centerContent]}>
                <Icon name="cards-variant" size={48} color={theme.textSecondary} style={styles.emptyIcon} />
                <Text style={[styles.noContentText, { color: theme.textSecondary }]}>
                    No other versions available for this card.
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.headerContainer, { backgroundColor: theme.background }]}>
                <View style={styles.headerContent}>
                    <Icon name="cards-outline" size={18} color={theme.primary} />
                    <Text style={[styles.headerText, { color: theme.text }]}>
                        Other Versions ({variations.length})
                    </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>
            
            <ScrollView style={[styles.tabContent, { backgroundColor: theme.background }]}>
                {variations.map((variant, index) => {
                    const normalPrice = getBestPrice(variant.prices, false);
                    const foilPrice = getBestPrice(variant.prices, true);
                    // Use imageUtils for the image URL
                    const imageUri = variant.imageUris?.small || variant.imageUrl || '';
                    const imageSource = getImageSource(imageUri) || { 
                        uri: 'https://via.placeholder.com/488x680/333333/FFFFFF?text=' + encodeURIComponent(variant.name || '?'),
                        priority: FastImage.priority.high,
                        cache: FastImage.cacheControl.immutable
                    };
                    
                    const isSelected = card?.uuid === variant.uuid;
                    const isOriginalScan = highlightOriginalScan && variant.isOriginalScan;
                    
                    return (
                        <TouchableOpacity
                            key={`${variant.uuid}-${index}`}
                            style={[
                                styles.variationItem, 
                                { 
                                    backgroundColor: theme.surface,
                                    borderColor: theme.border,
                                    ...(isSelected && styles.selectedVariation),
                                    ...(isOriginalScan && styles.originalScanVariation)
                                }
                            ]}
                            onPress={() => handleVersionSelect(variant)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.cardContainer}>
                                <View style={styles.imageWrapper}>
                                    <FastImage
                                        source={imageSource}
                                        style={styles.cardImage}
                                        resizeMode={FastImage.resizeMode.contain}
                                        onLoad={() => handleImageLoadSuccess(imageUri, { cardName: variant.name })}
                                        onError={() => handleImageLoadError(imageUri, variant.name)}
                                    />
                                </View>
                                
                                <View style={styles.cardDetails}>
                                    <View style={styles.setInfo}>
                                        <Text style={[styles.setName, { color: theme.text }]}>
                                            {variant.setName || 'Unknown Set'}
                                        </Text>
                                        <View style={styles.cardMetaRow}>
                                            <View style={[styles.metaBadge, { backgroundColor: theme.border }]}>
                                                <Text style={[styles.metaText, { color: theme.text }]}>
                                                    #{variant.collectorNumber || 'N/A'}
                                                </Text>
                                            </View>
                                            
                                            <View style={[styles.metaBadge, { 
                                                backgroundColor: getRarityColor(variant.rarity, theme.border)
                                            }]}>
                                                <Text style={[styles.metaText, { 
                                                    color: isDark ? '#fff' : '#000',
                                                    opacity: 0.9
                                                }]}>
                                                    {formatRarity(variant.rarity)}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    
                                    <View style={styles.priceSection}>
                                        {variant.hasNonFoil && normalPrice > 0 && (
                                            <Text style={[styles.priceText, { color: theme.primary }]}>
                                                {getFormattedPrice(normalPrice)}
                                            </Text>
                                        )}
                                        
                                        {variant.hasFoil && foilPrice > 0 && (
                                            <Text style={[styles.priceText, { color: '#E6C200' }]}>
                                                {getFormattedPrice(foilPrice)} <Text style={styles.foilLabel}>(Foil)</Text>
                                            </Text>
                                        )}
                                        
                                        {(!variant.hasNonFoil && !variant.hasFoil) || 
                                         ((!normalPrice || normalPrice <= 0) && (!foilPrice || foilPrice <= 0)) && (
                                            <Text style={[styles.noPriceText, { color: theme.textSecondary }]}>
                                                No price data
                                            </Text>
                                        )}
                                    </View>
                                    
                                    {isOriginalScan && (
                                        <View style={styles.originalScanBadge}>
                                            <Text style={styles.originalScanText}>
                                                Original Scan
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                
                                <Icon name="chevron-right" size={24} color={theme.textSecondary} style={styles.rightIcon} />
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
};

// Helper function to format rarity
const formatRarity = (rarity?: string): string => {
    if (!rarity) return 'Unknown';
    
    // Capitalize first letter
    return rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase();
};

// Helper function to get color based on rarity
const getRarityColor = (rarity?: string, defaultColor: string = '#CCCCCC'): string => {
    if (!rarity) return defaultColor;
    
    switch(rarity.toLowerCase()) {
        case 'common':
            return 'rgba(0, 0, 0, 0.2)';
        case 'uncommon':
            return '#95A5A6';
        case 'rare':
            return '#F1C40F';
        case 'mythic':
        case 'mythic rare':
            return '#E74C3C';
        case 'special':
        case 'timeshifted':
            return '#8E44AD';
        default:
            return defaultColor;
    }
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    tabContent: {
        flex: 1,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    emptyIcon: {
        marginBottom: 12,
        opacity: 0.6,
    },
    noContentText: {
        fontSize: 16,
        textAlign: 'center',
    },
    headerContainer: {
        padding: 16,
        paddingBottom: 8,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerText: {
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    divider: {
        height: 1,
        marginTop: 12,
    },
    variationItem: {
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    cardContainer: {
        flexDirection: 'row',
        padding: 12,
    },
    imageWrapper: {
        width: 80,
        height: 112,
        borderRadius: 6,
        overflow: 'hidden',
        marginRight: 12,
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    cardDetails: {
        flex: 1,
        justifyContent: 'space-between',
    },
    setInfo: {
        flex: 1,
    },
    setName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 6,
    },
    cardMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    metaBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        marginRight: 8,
        marginBottom: 8,
    },
    metaText: {
        fontSize: 12,
        fontWeight: '500',
    },
    priceSection: {
        marginTop: 8,
    },
    priceText: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    foilLabel: {
        fontSize: 12,
        fontWeight: 'normal',
    },
    noPriceText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
    rightIcon: {
        alignSelf: 'center',
        marginLeft: 8,
    },
    selectedVariation: {
        borderColor: '#4CAF50',
        borderWidth: 2,
    },
    originalScanVariation: {
        borderColor: '#4CAF50',
        borderWidth: 2,
    },
    originalScanBadge: {
        backgroundColor: '#4CAF50',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginTop: 4,
    },
    originalScanText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
});

export default VariationsTab; 