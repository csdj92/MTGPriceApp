import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FastImage from 'react-native-fast-image';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils';

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
}

const LorcanaCard: React.FC<LorcanaCardProps> = ({ card, onPress, onLongPress }) => {
    const isCollected = !!card.collected;
    // Create a stable image source with immutable caching
    const imageSource = card.Image ? {
        uri: card.Image,
        cache: FastImage.cacheControl.immutable
    } : null;

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
                        // Use a stable key based on unique ID
                        key={`card-${card.Unique_ID}`}
                        onLoad={() => {
                            handleImageLoadSuccess(card.Image, { 
                                name: card.Name, 
                                id: card.Unique_ID 
                            });
                        }}
                        onError={() => {
                            handleImageLoadError(card.Image, card.Name);
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
                <Text style={styles.cardNumber}>#{card.Card_Num || '0'}</Text>
                <Text style={[styles.cardName, !isCollected && styles.cardNameUncollected]} numberOfLines={1}>
                    {card.Name}
                </Text>
                <Text style={[styles.cardPrice, !isCollected && styles.cardPriceUncollected]}>
                    ${card.prices?.usd ? Number(card.prices.usd).toFixed(2) : '0.00'}
                </Text>
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
});

export default memo(LorcanaCard); 