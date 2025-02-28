import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Switch,
    Animated,
    Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as any;
import type { ExtendedCard } from '../types/card';

export interface CardItemProps {
    card: ExtendedCard;
    viewMode?: 'grid' | 'list';
    isSelected?: boolean;
    onPress?: (card: ExtendedCard) => void;
    onLongPress?: (card: ExtendedCard) => void;
    onAddToCollection?: (card: ExtendedCard) => void;
}

const CardItem: React.FC<CardItemProps> = ({ 
    card, 
    viewMode = 'list', 
    isSelected = false, 
    onPress, 
    onLongPress,
    onAddToCollection
}) => {
    // Creating an animated value for card press effect
    const scaleAnim = React.useRef(new Animated.Value(1)).current;
    
    const onPressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.97,
            friction: 5,
            tension: 300,
            useNativeDriver: true,
        }).start();
    };
    
    const onPressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 5,
            tension: 300,
            useNativeDriver: true,
        }).start();
    };

    const showCardMana = (card.colors && card.colors.length > 0) || card.colorIdentity;
    const colors = (card.colors || card.colorIdentity || []).slice(0, 3);

    // Safely handle onPress
    const handlePress = () => {
        if (onPress) {
            onPress(card);
        }
    };

    // Safely handle onLongPress
    const handleLongPress = () => {
        if (onLongPress) {
            onLongPress(card);
        } else if (onAddToCollection) {
            // Fallback to onAddToCollection if onLongPress isn't provided
            onAddToCollection(card);
        }
    };

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
                style={[
                    viewMode === 'grid' ? styles.gridCard : styles.listCard,
                    isSelected && styles.selectedCard,
                    styles.cardShadow,
                ]}
                onPress={handlePress}
                onLongPress={handleLongPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                activeOpacity={0.9}
                delayPressIn={50}
            >
                {isSelected && (
                    <View style={styles.selectionCheckbox}>
                        <Icon name="check-circle" size={22} color="#1e88e5" style={styles.checkIcon} />
                    </View>
                )}
                
                <View style={viewMode === 'grid' ? styles.gridContent : styles.listContent}>
                    {(card.imageUris?.normal || card.imageUris?.small || card.imageUrl) ? (
                        <Image 
                            source={{ uri: card.imageUris?.normal || card.imageUris?.small || card.imageUrl }} 
                            style={viewMode === 'grid' ? styles.gridImage : styles.listImage}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={[
                            viewMode === 'grid' ? styles.noImageGrid : styles.noImageList,
                            { backgroundColor: '#e0e0e0' }
                        ]}>
                            <Icon name="image-off" size={viewMode === 'grid' ? 40 : 24} color="#999" />
                        </View>
                    )}
                    
                    <View style={viewMode === 'list' ? styles.listDetails : styles.gridDetails}>
                        <Text 
                            style={styles.cardName} 
                            numberOfLines={viewMode === 'grid' ? 2 : 1}
                        >
                            {card.name}
                        </Text>
                        
                        {viewMode === 'list' && card.type && (
                            <Text style={styles.cardType} numberOfLines={1}>
                                {card.type}
                            </Text>
                        )}
                        
                        {viewMode === 'list' && showCardMana && (
                            <View style={styles.colorContainer}>
                                {colors.map((color, index) => (
                                    <View 
                                        key={index} 
                                        style={[
                                            styles.colorDot, 
                                            { backgroundColor: getColorFromMana(color) }
                                        ]} 
                                    />
                                ))}
                                {(card.colors?.length || card.colorIdentity?.length || 0) > 3 && (
                                    <Text style={styles.moreColors}>+{(card.colors?.length || card.colorIdentity?.length || 0) - 3}</Text>
                                )}
                            </View>
                        )}
                        
                        {viewMode === 'grid' && card.rarity && (
                            <View style={[styles.rarityBadge, getRarityStyle(card.rarity)]}>
                                <Text style={styles.rarityText}>
                                    {card.rarity.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const getColorFromMana = (color: string): string => {
    const colorMap: { [key: string]: string } = {
        W: '#F8E7B9', // White
        U: '#B3CEEA', // Blue
        B: '#B0AFAE', // Black
        R: '#EAA7A7', // Red
        G: '#B7C4B9', // Green
    };
    return colorMap[color] || '#DDDDDD';
};

const getRarityStyle = (rarity: string) => {
    switch (rarity.toLowerCase()) {
        case 'common':
            return { backgroundColor: '#B0B0B0' };
        case 'uncommon':
            return { backgroundColor: '#A1C3D1' };
        case 'rare':
            return { backgroundColor: '#F9DA5E' };
        case 'mythic':
            return { backgroundColor: '#E85B37' };
        default:
            return { backgroundColor: '#B0B0B0' };
    }
};

const styles = StyleSheet.create({
    gridCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 12,
        marginHorizontal: 6,
        flex: 0.5,
        overflow: 'hidden',
    },
    listCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
        width: '100%',
    },
    cardShadow: {
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    selectedCard: {
        borderColor: '#1e88e5',
        borderWidth: 2,
    },
    gridContent: {
        flexDirection: 'column',
    },
    listContent: {
        flexDirection: 'row',
        height: 80,
    },
    gridImage: {
        width: '100%',
        height: 140,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    listImage: {
        width: 60,
        height: 80,
    },
    noImageGrid: {
        width: '100%',
        height: 140,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noImageList: {
        width: 60,
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gridDetails: {
        padding: 8,
    },
    listDetails: {
        flex: 1,
        padding: 10,
        justifyContent: 'center',
    },
    cardName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    cardType: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    selectionCheckbox: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 12,
    },
    checkIcon: {
        textShadowColor: 'white',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    colorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    colorDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        marginRight: 4,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    moreColors: {
        fontSize: 10,
        color: '#666',
    },
    rarityBadge: {
        position: 'absolute',
        top: -150,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#B0B0B0',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
    },
    rarityText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: 'white',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
    },
});

export default CardItem; 