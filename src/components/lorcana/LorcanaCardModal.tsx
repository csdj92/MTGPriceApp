import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils';
import { useTheme } from '../../context/ThemeContext';
import { LorcanaPriceDetails } from './LorcanaPriceDetails';
import {
    formatLorcanaRarity,
    getLorcanaRarityColor,
} from '../../utils/formatters';
import {
    updateLorcanaCardQuantity,
    getLorcanaCardQuantity,
    resolveMissingCardColor,
} from '../../services/LorcanaService';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;

const LORCANA_BADGE_COLOR_MAP: Record<string, string> = {
    amber: '#FFA500',
    amethyst: '#9966CC',
    emerald: '#50C878',
    ruby: '#E0115F',
    sapphire: '#0F52BA',
    steel: '#71797E',
};

const tokenizeColorString = (color: string | undefined): string[] => {
    if (typeof color !== 'string' || !color.trim()) return [];

    const normalized = color.toLowerCase();

    // First pass: extract known Lorcana inks from any string format
    const keywordMatches = normalized.match(/\b(amber|amethyst|emerald|ruby|sapphire|steel)\b/g);
    if (keywordMatches && keywordMatches.length > 0) {
        return keywordMatches;
    }

    // Fallback for unusual delimiters/legacy formats
    return normalized
        .replace(/[\/|&+]/g, ',')
        .split(',')
        .map(token => token.trim())
        .filter(Boolean);
};

const getBadgeGradientColors = (color: string | undefined): string[] => {
    const resolvedColors: string[] = [];

    for (const token of tokenizeColorString(color)) {
        const mapped = LORCANA_BADGE_COLOR_MAP[token];
        if (!mapped) continue;

        if (!resolvedColors.includes(mapped)) {
            resolvedColors.push(mapped);
        }

        if (resolvedColors.length === 2) break;
    }

    return resolvedColors;
};

// Helper functions for color coding
const getColorForBadge = (color: string | undefined): string => {
    const gradientColors = getBadgeGradientColors(color);
    return gradientColors[0] || '#999999';
};

const getRarityColor = (rarity: string | undefined): string =>
    getLorcanaRarityColor(rarity, '#999999');

interface LorcanaCardModalProps {
    card: LorcanaCardWithPrice | null;
    visible: boolean;
    onClose: () => void;
    onDelete: () => void;
    onAddToCollection?: () => void;
    onRemoveFromCollection?: () => void;
    priceData?: any;
    isPriceLoading?: boolean;
    collectionId?: string;
    onQuantityChange?: () => void;
}

interface CardHeaderDisplayProps {
    card: LorcanaCardWithPrice;
    theme: ReturnType<typeof useTheme>['theme'];
    handleImageLoad: () => void;
    handleImageError: () => void;
}

const CardHeaderDisplay: React.FC<CardHeaderDisplayProps> = React.memo(({
    card,
    theme,
    handleImageLoad,
    handleImageError,
}) => {
    const colorLabel = card.Color?.trim() || 'Unknown';
    const colorBadgeGradient = getBadgeGradientColors(card.Color);

    return (
        <View style={styles.cardHeader}>
            <View style={styles.cardImageContainer}>
                <FastImage
                    source={getImageSource(card.Image) || { uri: card.Image }}
                    style={[styles.cardImage, { backgroundColor: theme.card || theme.surface }]}
                    resizeMode={FastImage.resizeMode.contain}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                />
            </View>
            
            <View style={styles.cardBasicInfo}>
                <Text style={[styles.cardName, { color: theme.text }]}>{card.Name}</Text>
                
                <View style={styles.badgeContainer}>
                    {colorBadgeGradient.length >= 2 ? (
                        <LinearGradient
                            colors={[colorBadgeGradient[0], colorBadgeGradient[1]]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={styles.badge}
                        >
                            <Text style={styles.badgeText}>{colorLabel}</Text>
                        </LinearGradient>
                    ) : (
                        <View style={[styles.badge, { backgroundColor: getColorForBadge(card.Color) }]}>
                            <Text style={styles.badgeText}>{colorLabel}</Text>
                        </View>
                    )}
                    <View style={[styles.badge, { backgroundColor: getRarityColor(card.Rarity) }]}>
                        <Text style={styles.badgeText}>{formatLorcanaRarity(card.Rarity)}</Text>
                    </View>
                </View>
                
                <View style={styles.cardStats}>
                    {card.Cost !== undefined && (
                        <View style={styles.statItem}>
                            <Icon name="circle-multiple" size={18} color={theme.icon || theme.text} />
                            <Text style={[styles.statText, { color: theme.text }]}>Cost: {card.Cost}</Text>
                        </View>
                    )}
                    {card.Strength !== undefined && (
                        <View style={styles.statItem}>
                            <Icon name="sword" size={18} color={theme.icon || theme.text} />
                            <Text style={[styles.statText, { color: theme.text }]}>Strength: {card.Strength}</Text>
                        </View>
                    )}
                    {card.Willpower !== undefined && (
                        <View style={styles.statItem}>
                            <Icon name="shield" size={18} color={theme.icon || theme.text} />
                            <Text style={[styles.statText, { color: theme.text }]}>Willpower: {card.Willpower}</Text>
                        </View>
                    )}
                    {card.Lore !== undefined && (
                        <View style={styles.statItem}>
                            <Icon name="book-open-variant" size={18} color={theme.icon || theme.text} />
                            <Text style={[styles.statText, { color: theme.text }]}>Lore: {card.Lore}</Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
});

interface CardPropertiesDisplayProps {
    card: LorcanaCardWithPrice;
    theme: ReturnType<typeof useTheme>['theme'];
}

const CardPropertiesDisplay: React.FC<CardPropertiesDisplayProps> = React.memo(({
    card,
    theme,
}) => {
    return (
        <View style={[styles.cardSection, { backgroundColor: theme.card || theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Card Details</Text>
            
            <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.text }]}>Type:</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>{card.Type || 'N/A'}</Text>
            </View>
            
            {card.Classifications && (
                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.text }]}>Classifications:</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>{card.Classifications}</Text>
                </View>
            )}
            
            <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.text }]}>Franchise:</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>{card.Franchise || 'N/A'}</Text>
            </View>
            
            <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.text }]}>Set:</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                    {card.Set_Name} ({card.Set_ID} {card.Set_Num ? `/ ${card.Set_Num}` : ''})
                </Text>
            </View>
            
            <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.text }]}>Card Number:</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                    {card.Card_Num} 
                </Text>
            </View>
        </View>
    );
});

interface CardTextDisplayProps {
    text: string | null | undefined;
    title: string;
    style: any; // Consider more specific style prop type if possible
    theme: ReturnType<typeof useTheme>['theme'];
    isFlavor?: boolean;
}

const CardTextDisplay: React.FC<CardTextDisplayProps> = React.memo(({
    text,
    title,
    style,
    theme,
    isFlavor = false,
}) => {
    if (!text) return null;

    return (
        <View style={[styles.cardSection, { backgroundColor: theme.card || theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
            <Text style={[style, { color: isFlavor ? (theme.textSecondary || theme.text) : theme.text }]}>
                {isFlavor ? `"${text}"` : text}
            </Text>
        </View>
    );
});

interface CurrentPriceDisplayProps {
    card: LorcanaCardWithPrice;
    theme: ReturnType<typeof useTheme>['theme'];
}

const CurrentPriceDisplay: React.FC<CurrentPriceDisplayProps> = React.memo(({
    card,
    theme,
}) => {
    return (
        <View style={styles.priceContainer}>
            <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: theme.text }]}>Regular:</Text>
                <Text style={[styles.priceValue, { color: theme.success || theme.primary }]}>
                    ${card.price_usd ? parseFloat(card.price_usd).toFixed(2) : '0.00'}
                </Text>
            </View>
            
            <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: theme.text }]}>Foil:</Text>
                <Text style={[styles.priceValue, { color: theme.success || theme.primary }]}>
                    ${card.price_usd_foil ? parseFloat(card.price_usd_foil).toFixed(2) : '0.00'}
                </Text>
            </View>
            
            {card.last_updated && (
                <Text style={[styles.priceUpdated, { color: theme.textSecondary || theme.text }]}>
                    Updated: {new Date(card.last_updated).toLocaleDateString()}
                </Text>
            )}
        </View>
    );
});

interface QuantityControlsProps {
    card: LorcanaCardWithPrice;
    theme: ReturnType<typeof useTheme>['theme'];
    collectionId?: string;
    onQuantityChange?: () => void;
}

const QuantityControls: React.FC<QuantityControlsProps> = React.memo(({
    card,
    theme,
    collectionId,
    onQuantityChange,
}) => {
    const [quantityNormal, setQuantityNormal] = useState(card.quantity_normal || 0);
    const [quantityFoil, setQuantityFoil] = useState(card.quantity_foil || 0);
    const [updating, setUpdating] = useState(false);

    // Update quantities when card changes
    useEffect(() => {
        console.log('[LorcanaCardModal] Loading quantities for card:', card.Name, {
            normal: card.quantity_normal,
            foil: card.quantity_foil
        });
        setQuantityNormal(card.quantity_normal || 0);
        setQuantityFoil(card.quantity_foil || 0);
    }, [card.quantity_normal, card.quantity_foil, card.Name]);

    const handleQuantityChange = async (type: 'normal' | 'foil', delta: number) => {
        if (!collectionId || updating) return;

        setUpdating(true);
        try {
            const newNormal = type === 'normal' ? Math.max(0, quantityNormal + delta) : quantityNormal;
            const newFoil = type === 'foil' ? Math.max(0, quantityFoil + delta) : quantityFoil;

            // Update database
            await updateLorcanaCardQuantity(card.Unique_ID, collectionId, newNormal, newFoil);

            // Update local state for immediate UI feedback
            setQuantityNormal(newNormal);
            setQuantityFoil(newFoil);

            // Notify parent to refresh card list from database
            if (onQuantityChange) {
                await onQuantityChange();
            }

            console.log('[LorcanaCardModal] Updated quantities:', { normal: newNormal, foil: newFoil });
        } catch (error) {
            console.error('Error updating quantity:', error);
        } finally {
            setUpdating(false);
        }
    };

    if (!card.collected || !collectionId) return null;

    const normalPrice = parseFloat(card.price_usd || card.prices?.usd || '0');
    const foilPrice = parseFloat(card.price_usd_foil || card.prices?.usd_foil || '0');
    const normalValue = normalPrice * quantityNormal;
    const foilValue = foilPrice * quantityFoil;
    const totalValue = normalValue + foilValue;

    return (
        <View style={[styles.cardSection, { backgroundColor: theme.card || theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Quantity in Collection</Text>

            {/* Normal Cards */}
            <View style={styles.quantityRow}>
                <View style={styles.quantityLabel}>
                    <Icon name="cards" size={18} color={theme.icon || theme.text} />
                    <Text style={[styles.quantityLabelText, { color: theme.text }]}>Normal:</Text>
                </View>
                <View style={styles.quantityControls}>
                    <TouchableOpacity
                        style={[styles.quantityButton, { backgroundColor: theme.error || '#dc3545' }]}
                        onPress={() => handleQuantityChange('normal', -1)}
                        disabled={quantityNormal === 0 || updating}
                    >
                        <Icon name="minus" size={18} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={[styles.quantityValue, { color: theme.text }]}>{quantityNormal}</Text>
                    <TouchableOpacity
                        style={[styles.quantityButton, { backgroundColor: theme.success || '#28a745' }]}
                        onPress={() => handleQuantityChange('normal', 1)}
                        disabled={updating}
                    >
                        <Icon name="plus" size={18} color="#ffffff" />
                    </TouchableOpacity>
                </View>
                <Text style={[styles.quantityPrice, { color: theme.success || theme.primary }]}>
                    ${normalValue.toFixed(2)}
                </Text>
            </View>

            {/* Foil Cards */}
            <View style={styles.quantityRow}>
                <View style={styles.quantityLabel}>
                    <Icon name="cards-diamond" size={18} color={theme.icon || theme.text} />
                    <Text style={[styles.quantityLabelText, { color: theme.text }]}>Foil:</Text>
                </View>
                <View style={styles.quantityControls}>
                    <TouchableOpacity
                        style={[styles.quantityButton, { backgroundColor: theme.error || '#dc3545' }]}
                        onPress={() => handleQuantityChange('foil', -1)}
                        disabled={quantityFoil === 0 || updating}
                    >
                        <Icon name="minus" size={18} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={[styles.quantityValue, { color: theme.text }]}>{quantityFoil}</Text>
                    <TouchableOpacity
                        style={[styles.quantityButton, { backgroundColor: theme.success || '#28a745' }]}
                        onPress={() => handleQuantityChange('foil', 1)}
                        disabled={updating}
                    >
                        <Icon name="plus" size={18} color="#ffffff" />
                    </TouchableOpacity>
                </View>
                <Text style={[styles.quantityPrice, { color: theme.success || theme.primary }]}>
                    ${foilValue.toFixed(2)}
                </Text>
            </View>

            {/* Total Value */}
            <View style={[styles.totalValueRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.totalValueLabel, { color: theme.text }]}>Total Value:</Text>
                <Text style={[styles.totalValueAmount, { color: theme.success || theme.primary }]}>
                    ${totalValue.toFixed(2)}
                </Text>
            </View>
        </View>
    );
});

interface CollectionActionButtonsProps {
    card: LorcanaCardWithPrice;
    theme: ReturnType<typeof useTheme>['theme'];
    onAddToCollection?: () => void;
    onRemoveFromCollection?: () => void;
}

const CollectionActionButtons: React.FC<CollectionActionButtonsProps> = React.memo(({
    card,
    theme,
    onAddToCollection,
    onRemoveFromCollection,
}) => {
    return (
        <View style={styles.buttonContainer}>
            {!card.collected && onAddToCollection && (
                <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: theme.success || '#28a745' }]}
                    onPress={onAddToCollection}
                >
                    <Icon name="plus-circle" size={18} color="#ffffff" />
                    <Text style={[styles.buttonText, { color: '#ffffff' }]}>Add to Collection</Text>
                </TouchableOpacity>
            )}

            {card.collected && onRemoveFromCollection && (
                <TouchableOpacity
                    style={[styles.removeButton, { backgroundColor: theme.error || '#dc3545' }]}
                    onPress={onRemoveFromCollection}
                >
                    <Icon name="minus-circle" size={18} color="#ffffff" />
                    <Text style={[styles.buttonText, { color: '#ffffff' }]}>Remove from Collection</Text>
                </TouchableOpacity>
            )}
        </View>
    );
});

const LorcanaCardModal: React.FC<LorcanaCardModalProps> = React.memo(({
    card,
    visible,
    onClose,
    onDelete,
    onAddToCollection,
    onRemoveFromCollection,
    priceData,
    isPriceLoading,
    collectionId,
    onQuantityChange
}) => {
    const { theme } = useTheme();
    const [resolvedColor, setResolvedColor] = useState<string | null>(null);
    if (!card) return null;

    const handleImageLoad = useCallback(() => {
        handleImageLoadSuccess(card.Image, { 
            name: card.Name, 
            id: card.Unique_ID,
            context: 'modal'
        });
    }, [card.Image, card.Name, card.Unique_ID]);

    const handleImageError = useCallback(() => {
        handleImageLoadError(card.Image, card.Name);
    }, [card.Image, card.Name]);

    useEffect(() => {
        let isActive = true;

        const currentColor = typeof card.Color === 'string' ? card.Color.trim() : '';
        if (currentColor.length > 0) {
            setResolvedColor(currentColor);
            return () => {
                isActive = false;
            };
        }

        setResolvedColor(null);

        resolveMissingCardColor({
            Unique_ID: card.Unique_ID,
            Set_ID: card.Set_ID,
            Set_Num: card.Set_Num,
            Card_Num: card.Card_Num,
            Color: card.Color,
        })
            .then(color => {
                if (!isActive) return;
                if (color) {
                    console.log('[LorcanaCardModal] Resolved missing card color from API:', {
                        uniqueId: card.Unique_ID,
                        name: card.Name,
                        color,
                    });
                    setResolvedColor(color);
                }
            })
            .catch(error => {
                console.log('[LorcanaCardModal] Failed to resolve missing card color:', error);
            });

        return () => {
            isActive = false;
        };
    }, [card.Unique_ID, card.Set_ID, card.Set_Num, card.Card_Num, card.Color, card.Name]);

    const displayCard = resolvedColor ? { ...card, Color: resolvedColor } : card;

    // Use priceData if present, otherwise fallback to card.prices
    const price = priceData?.usd ?? card.price_usd ?? card.prices?.usd;
    const foilPrice = priceData?.usd_foil ?? card.price_usd_foil ?? card.prices?.usd_foil;
    const lastUpdated = priceData?.last_updated ?? card.last_updated;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={[styles.modalContainer, { backgroundColor: 'rgba(0, 0, 0, 0.7)' }]}>
                <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                    <TouchableOpacity
                        style={[styles.modalCloseButton, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}
                        onPress={onClose}
                    >
                        <Icon name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    
                    <ScrollView style={styles.modalScrollView}>
                        {/* Card Header with Image and Basic Info */}
                        <CardHeaderDisplay 
                            card={displayCard} 
                            theme={theme} 
                            handleImageLoad={handleImageLoad} 
                            handleImageError={handleImageError} 
                        />
                        
                        {/* Card Details Section */}
                        <CardPropertiesDisplay card={card} theme={theme} />
                        
                        {/* Card Text Section */}
                        <CardTextDisplay 
                            text={card.Body_Text} 
                            title="Card Text" 
                            style={styles.cardBodyText}
                            theme={theme} 
                        />
                        
                        {/* Flavor Text Section */}
                        <CardTextDisplay 
                            text={card.Flavor_Text} 
                            title="Flavor Text" 
                            style={styles.cardFlavorText}
                            theme={theme} 
                            isFlavor 
                        />
                        
                        {/* Quantity Controls Section */}
                        <QuantityControls
                            card={card}
                            theme={theme}
                            collectionId={collectionId}
                            onQuantityChange={onQuantityChange}
                        />

                        {/* Price Information Section */}
                        <View style={[styles.cardSection, { backgroundColor: theme.card || theme.surface }]}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Price Information</Text>

                            {isPriceLoading ? (
                                <Text style={[styles.priceValue, { color: theme.textSecondary }]}>Loading...</Text>
                            ) : (
                                <>
                                    <View style={styles.priceRow}>
                                        <Text style={[styles.priceLabel, { color: theme.text }]}>Regular:</Text>
                                        <Text style={[styles.priceValue, { color: theme.success || theme.primary }]}>${price ? parseFloat(price).toFixed(2) : '0.00'}</Text>
                                    </View>
                                    <View style={styles.priceRow}>
                                        <Text style={[styles.priceLabel, { color: theme.text }]}>Foil:</Text>
                                        <Text style={[styles.priceValue, { color: theme.success || theme.primary }]}>${foilPrice ? parseFloat(foilPrice).toFixed(2) : '0.00'}</Text>
                                    </View>
                                    {lastUpdated && (
                                        <Text style={[styles.priceUpdated, { color: theme.textSecondary || theme.text }]}>Updated: {new Date(lastUpdated).toLocaleDateString()}</Text>
                                    )}
                                </>
                            )}

                            {/* Price History Section */}
                            {card.Unique_ID && (
                                <View
                                    key={`price-history-${card.Unique_ID}`}
                                    style={styles.priceHistoryContainer}
                                >
                                    <LorcanaPriceDetails
                                        cardId={card.Unique_ID}
                                        cardName={card.Name}
                                        currentPrice={price}
                                        currentFoilPrice={foilPrice}
                                    />
                                </View>
                            )}
                        </View>
                    </ScrollView>

                    {/* Collection management buttons */}
                    <CollectionActionButtons
                        card={card}
                        theme={theme}
                        onAddToCollection={onAddToCollection}
                        onRemoveFromCollection={onRemoveFromCollection}
                    />
                </View>
            </View>
        </Modal>
    );
});

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContent: {
        width: '100%',
        maxHeight: '90%',
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    modalScrollView: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    modalCloseButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    cardHeader: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    cardImageContainer: {
        width: '45%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        borderRadius: 8,
        overflow: 'hidden',
    },
    cardImage: {
        width: '100%',
        aspectRatio: 0.72,
        borderRadius: 8,
    },
    cardBasicInfo: {
        flex: 1,
        paddingLeft: 16,
        justifyContent: 'flex-start',
    },
    cardName: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    badgeContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 12,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        marginRight: 8,
        marginBottom: 8,
    },
    badgeText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    cardStats: {
        marginBottom: 8,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    statText: {
        fontSize: 14,
        marginLeft: 8,
    },
    cardSection: {
        paddingTop: 0,
        paddingBottom: 12,
        paddingLeft: 16,
        paddingRight: 16,
        borderRadius: 8,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    detailLabel: {
        width: 120,
        fontWeight: 'bold',
        fontSize: 14,
    },
    detailValue: {
        flex: 1,
        fontSize: 14,
    },
    cardBodyText: {
        fontSize: 14,
        lineHeight: 20,
    },
    cardFlavorText: {
        fontSize: 14,
        fontStyle: 'italic',
        lineHeight: 20,
    },
    priceContainer: {
        marginTop: 4,
    },
    priceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    priceLabel: {
        fontWeight: 'bold',
        fontSize: 14,
    },
    priceValue: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    priceUpdated: {
        fontSize: 12,
        marginTop: 8,
        textAlign: 'right',
    },
    buttonContainer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.1)',
    },
    addButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    removeButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    buttonText: {
        fontWeight: 'bold',
        marginLeft: 8,
    },
    priceHistoryContainer: {
        marginTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.1)',
        paddingTop: 16,
    },
    quantityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    quantityLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    quantityLabelText: {
        marginLeft: 8,
        fontSize: 14,
        fontWeight: '600',
    },
    quantityControls: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
    },
    quantityButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quantityValue: {
        fontSize: 18,
        fontWeight: 'bold',
        marginHorizontal: 16,
        minWidth: 30,
        textAlign: 'center',
    },
    quantityPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        minWidth: 60,
        textAlign: 'right',
    },
    totalValueRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    totalValueLabel: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    totalValueAmount: {
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default LorcanaCardModal; 
