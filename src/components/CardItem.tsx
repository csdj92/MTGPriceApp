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
    onDeleteCard?: (card: ExtendedCard) => void;
}

const CardItem: React.FC<CardItemProps> = ({ 
    card, 
    viewMode = 'list', 
    isSelected = false, 
    onPress, 
    onLongPress,
    onAddToCollection,
    onDeleteCard
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

    // Determine if card should be displayed in expanded view
    const shouldShowExpanded = card.isExpanded === true;

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
                style={[
                    viewMode === 'grid' ? styles.gridCard : styles.listCard,
                    isSelected && styles.selectedCard,
                    styles.cardShadow,
                    shouldShowExpanded && styles.expandedCard
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
                
                <View style={shouldShowExpanded ? styles.expandedContent : (viewMode === 'grid' ? styles.gridContent : styles.listContent)}>
                    {(card.imageUris?.normal || card.imageUris?.small || card.imageUrl) ? (
                        <Image 
                            source={{ uri: card.imageUris?.normal || card.imageUris?.small || card.imageUrl }} 
                            style={shouldShowExpanded ? styles.expandedImage : (viewMode === 'grid' ? styles.gridImage : styles.listImage)}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={[
                            shouldShowExpanded ? styles.noImageExpanded : (viewMode === 'grid' ? styles.noImageGrid : styles.noImageList),
                            { backgroundColor: '#e0e0e0' }
                        ]}>
                            <Icon name="image-off" size={shouldShowExpanded ? 60 : (viewMode === 'grid' ? 40 : 24)} color="#999" />
                        </View>
                    )}
                    
                    <View style={shouldShowExpanded ? styles.expandedDetails : (viewMode === 'list' ? styles.listDetails : styles.gridDetails)}>
                        <Text 
                            style={styles.cardName} 
                            numberOfLines={shouldShowExpanded ? 0 : (viewMode === 'grid' ? 2 : 1)}
                        >
                            {card.name}
                        </Text>
                        
                        {(viewMode === 'list' || shouldShowExpanded) && card.type && (
                            <Text style={styles.cardType} numberOfLines={shouldShowExpanded ? 0 : 1}>
                                {card.type}
                            </Text>
                        )}
                        
                        {(viewMode === 'list' || shouldShowExpanded) && showCardMana && (
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
                        
                        {((viewMode === 'grid' && !shouldShowExpanded) || shouldShowExpanded) && card.rarity && (
                            <View style={[styles.rarityBadge, getRarityStyle(card.rarity)]}>
                                <Text style={styles.rarityText}>
                                    {shouldShowExpanded ? card.rarity : card.rarity.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}

                        {shouldShowExpanded && (
                            <View style={styles.expandedCardInfo}>
                                {card.text && (
                                    <View style={styles.textSection}>
                                        <Text style={styles.sectionTitle}>Card Text:</Text>
                                        <Text style={styles.cardText}>{card.text}</Text>
                                    </View>
                                )}
                                
                                {card.flavorText && (
                                    <View style={styles.textSection}>
                                        <Text style={styles.sectionTitle}>Flavor Text:</Text>
                                        <Text style={styles.flavorText}>"{card.flavorText}"</Text>
                                    </View>
                                )}
                                
                                <View style={styles.cardMetaSection}>
                                    {card.setName && (
                                        <Text style={styles.setInfo}>Set: {card.setName} ({card.setCode})</Text>
                                    )}
                                    
                                    {card.collectorNumber && (
                                        <Text style={styles.collectorInfo}>Card #: {card.collectorNumber}</Text>
                                    )}
                                    
                                    {card.prices && (
                                        <View style={styles.priceContainer}>
                                            <Text style={styles.sectionTitle}>Prices:</Text>
                                            {card.prices.usd && (
                                                <Text style={styles.priceInfo}>Normal: ${card.prices.usd}</Text>
                                            )}
                                            {card.prices.usdFoil && (
                                                <Text style={styles.priceInfo}>Foil: ${card.prices.usdFoil}</Text>
                                            )}
                                            {card.prices.normal !== undefined && (
                                                <Text style={styles.priceInfo}>Normal: ${card.prices.normal}</Text>
                                            )}
                                            {card.prices.foil !== undefined && (
                                                <Text style={styles.priceInfo}>Foil: ${card.prices.foil}</Text>
                                            )}
                                        </View>
                                    )}
                                    
                                    {onAddToCollection && (!card.quantity || card.quantity === 0) && (
                                        <TouchableOpacity 
                                            style={styles.addToCollectionButton}
                                            onPress={() => onAddToCollection(card)}
                                        >
                                            <Icon name="plus-circle" size={20} color="#fff" />
                                            <Text style={styles.addToCollectionText}>Add to Collection</Text>
                                        </TouchableOpacity>
                                    )}
                                    
                                    {onDeleteCard && card.quantity && card.quantity > 0 && (
                                        <TouchableOpacity 
                                            style={styles.removeFromCollectionButton}
                                            onPress={() => onDeleteCard(card)}
                                        >
                                            <Icon name="minus-circle" size={20} color="#fff" />
                                            <Text style={styles.removeFromCollectionText}>Mark as Missing</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        )}
                    </View>
                </View>
                
                {/* Badge for missing cards (quantity = 0) */}
                {card.quantity === 0 && (
                    <View style={styles.missingBadge}>
                        <Text style={styles.missingText}>Missing</Text>
                    </View>
                )}
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
    expandedCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 16,
        marginHorizontal: 0,
        overflow: 'hidden',
        width: '100%',
        minHeight: 200,
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.23,
        shadowRadius: 2.62,
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
    expandedContent: {
        flexDirection: 'column',
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
    expandedImage: {
        width: '100%',
        height: 300,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
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
    noImageExpanded: {
        width: '100%',
        height: 300,
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
    expandedDetails: {
        padding: 16,
    },
    cardName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    cardType: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    colorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    colorDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 4,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    moreColors: {
        fontSize: 12,
        color: '#666',
        marginLeft: 2,
    },
    rarityBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    rarityText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    selectionCheckbox: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 2,
        backgroundColor: 'white',
        borderRadius: 12,
    },
    checkIcon: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.5,
    },
    expandedCardInfo: {
        marginTop: 12,
    },
    textSection: {
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#555',
        marginBottom: 4,
    },
    cardText: {
        fontSize: 14,
        color: '#333',
        lineHeight: 20,
    },
    flavorText: {
        fontSize: 14,
        color: '#666',
        fontStyle: 'italic',
        lineHeight: 20,
    },
    cardMetaSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    setInfo: {
        fontSize: 14,
        color: '#555',
        marginBottom: 4,
    },
    collectorInfo: {
        fontSize: 14,
        color: '#555',
        marginBottom: 8,
    },
    priceContainer: {
        marginTop: 8,
        marginBottom: 12,
    },
    priceInfo: {
        fontSize: 14,
        color: '#333',
        marginBottom: 2,
    },
    addToCollectionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2196F3',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginTop: 8,
        alignSelf: 'flex-start',
    },
    addToCollectionText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 6,
    },
    removeFromCollectionButton: {
        backgroundColor: '#e53935',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginTop: 12,
    },
    removeFromCollectionText: {
        color: '#fff',
        fontWeight: '600',
        marginLeft: 8,
    },
    missingBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: 'rgba(244, 67, 54, 0.8)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        zIndex: 10,
    },
    missingText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
});

export default CardItem; 