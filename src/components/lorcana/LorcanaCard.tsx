import React, { memo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils';
import { useTheme } from '../../context/ThemeContext';
import { imageCacheService } from '../../services/ImageCacheService';

// Fix the Icon type with a proper type assertion
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;

interface LorcanaCardProps {
    card: LorcanaCardWithPrice;
    onPress: () => void;
    onLongPress: () => void;
    priceData?: any;
    isPriceLoading?: boolean;
    isNew?: boolean;
    isSelected?: boolean;
    showSelectionIndicator?: boolean;
}

const LorcanaCard: React.FC<LorcanaCardProps> = ({ card, onPress, onLongPress, priceData, isPriceLoading, isNew, isSelected, showSelectionIndicator }) => {
    const { theme } = useTheme();
    const isCollected = card.collected || false;
    const cardImage = card.Image;
    
    // State for cached image
    const [imageSource, setImageSource] = useState<{ uri: string; cache?: any } | null>(null);
    const [imageLoading, setImageLoading] = useState(true);

    // Load cached image or fallback to network
    useEffect(() => {
        if (cardImage) {
            loadImage();
        }
    }, [cardImage]);

    const loadImage = async () => {
        if (!cardImage) return;
        
        try {
            // Check if image is cached
            const cachedPath = await imageCacheService.getCachedImagePath(cardImage);
            
            if (cachedPath) {
                // Use cached image
                setImageSource({ uri: cachedPath });
                setImageLoading(false);
            } else {
                // Use network image and trigger background download
                setImageSource({
                    uri: cardImage,
                    cache: FastImage.cacheControl.immutable
                });
                setImageLoading(false);
                
                // Download in background for future use
                imageCacheService.downloadImage(cardImage).catch(error => {
                    console.log('[LorcanaCard] Background download failed:', error);
                });
            }
        } catch (error) {
            // Fallback to network image
            setImageSource({
                uri: cardImage,
                cache: FastImage.cacheControl.immutable
            });
            setImageLoading(false);
        }
    };

    // Use normal price if available, otherwise use foil price
    const normalPrice = priceData?.usd ?? card.prices?.usd;
    const foilPrice = priceData?.usd_foil ?? card.prices?.usd_foil;
    const price = normalPrice || foilPrice;

    return (
        <TouchableOpacity 
            style={styles.cardContainer}
            onPress={onPress}
            onLongPress={onLongPress}
            activeOpacity={0.7}
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
                        onLoad={() => {
                            handleImageLoadSuccess(cardImage, { 
                                name: card.Name, 
                                id: card.Unique_ID,
                                context: 'card'
                            });
                        }}
                        onError={() => {
                            handleImageLoadError(cardImage, card.Name);
                        }}
                    />
                ) : (
                    <View style={[styles.cardImage, styles.placeholderImage, { backgroundColor: theme.card || theme.surface }]}>
                        <Icon name="image-off" size={24} color={theme.textSecondary} />
                    </View>
                )}
                {!isCollected && !showSelectionIndicator && (
                    <View style={styles.missingOverlay}>
                        <Icon name="plus-circle" size={24} color="white" />
                        <Text style={styles.missingText}>Missing</Text>
                    </View>
                )}
                {/* Selection indicator */}
                {showSelectionIndicator && (
                    <View style={[styles.selectionOverlay, isSelected && styles.selectionOverlayActive]}>
                        <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive]}>
                            {isSelected && <Icon name="check" size={20} color="white" />}
                        </View>
                    </View>
                )}
                {/* Quantity badge */}
                {((card.quantity_normal ?? 0) + (card.quantity_foil ?? 0)) > 1 && (
                  <View style={styles.quantityBadge}>
                    <Text style={styles.quantityText}>
                      {(card.quantity_normal ?? 0) + (card.quantity_foil ?? 0)}
                    </Text>
                  </View>
                )}
                {/* NEW ribbon */}
                {isNew && (
                  <View style={styles.newRibbon}>
                    <Text style={styles.newRibbonText}>NEW</Text>
                  </View>
                )}
            </View>
            <View style={[styles.cardInfo, !isCollected && styles.cardInfoUncollected]}>
                <Text style={[styles.cardNumber, { color: theme.textSecondary }]}>#{card.Card_Num || '0'}</Text>
                <Text 
                    style={[
                        styles.cardName, 
                        { color: theme.text }, 
                        !isCollected && [styles.cardNameUncollected, { color: theme.textTertiary }]
                    ]} 
                    numberOfLines={1}
                >
                    {card.Name}
                </Text>
                {isPriceLoading ? (
                    <Text style={[styles.cardPrice, { color: theme.textSecondary }]}>Loading...</Text>
                ) : (
                    <Text 
                        style={[
                            styles.cardPrice, 
                            { color: theme.success || theme.primary }, 
                            !isCollected && [styles.cardPriceUncollected, { color: theme.textTertiary }]
                        ]}
                    >
                        ${price ? Number(price).toFixed(2) : '0.00'}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
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
    selectionOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 8,
        padding: 8,
        alignItems: 'flex-end',
    },
    selectionOverlayActive: {
        backgroundColor: 'rgba(33, 150, 243, 0.3)',
        borderWidth: 3,
        borderColor: '#2196F3',
    },
    selectionCheckbox: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: 'white',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectionCheckboxActive: {
        backgroundColor: '#2196F3',
        borderColor: '#2196F3',
    },
    cardInfo: {
        padding: 4,
    },
    cardInfoUncollected: {
        opacity: 0.7,
    },
    cardNumber: {
        fontSize: 10,
        marginBottom: 2,
    },
    cardName: {
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 2,
    },
    cardNameUncollected: {
        opacity: 0.6,
    },
    cardPrice: {
        fontSize: 12,
    },
    cardPriceUncollected: {
        opacity: 0.6,
    },
    quantityBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 12,
        padding: 2,
    },
    quantityText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    newRibbon: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 4,
        padding: 2,
    },
    newRibbonText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
});

export default memo(LorcanaCard); 