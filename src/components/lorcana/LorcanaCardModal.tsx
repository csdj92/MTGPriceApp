import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils';
import { useTheme } from '../../context/ThemeContext';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;

// Helper functions for color coding
const getColorForBadge = (color: string | undefined): string => {
    if (!color) return '#999999';
    
    switch(color.toLowerCase()) {
        case 'amber': return '#FFA500';
        case 'amethyst': return '#9966CC';
        case 'emerald': return '#50C878';
        case 'ruby': return '#E0115F';
        case 'sapphire': return '#0F52BA';
        case 'steel': return '#71797E';
        default: return '#999999';
    }
};

const getRarityColor = (rarity: string | undefined): string => {
    if (!rarity) return '#999999';
    
    switch(rarity.toLowerCase()) {
        case 'common': return '#CCCCCC';
        case 'uncommon': return '#7FFFD4';
        case 'rare': return '#FFD700';
        case 'super rare': return '#FF5733';
        case 'legendary': return '#FF00FF';
        case 'enchanted': return '#00BFFF';
        default: return '#999999';
    }
};

interface LorcanaCardModalProps {
    card: LorcanaCardWithPrice | null;
    visible: boolean;
    onClose: () => void;
    onDelete: () => void;
    onAddToCollection?: () => void;
    onRemoveFromCollection?: () => void;
}

const LorcanaCardModal: React.FC<LorcanaCardModalProps> = ({
    card,
    visible,
    onClose,
    onDelete,
    onAddToCollection,
    onRemoveFromCollection
}) => {
    const { theme } = useTheme();
    if (!card) return null;

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
                        <View style={styles.cardHeader}>
                            <View style={styles.cardImageContainer}>
                                <FastImage
                                    source={getImageSource(card.Image) || { uri: card.Image }}
                                    style={[styles.cardImage, { backgroundColor: theme.card || theme.surface }]}
                                    resizeMode={FastImage.resizeMode.contain}
                                    onLoad={() => {
                                        handleImageLoadSuccess(card.Image, { 
                                            name: card.Name, 
                                            id: card.Unique_ID,
                                            context: 'modal'
                                        });
                                    }}
                                    onError={() => {
                                        handleImageLoadError(card.Image, card.Name);
                                    }}
                                />
                            </View>
                            
                            <View style={styles.cardBasicInfo}>
                                <Text style={[styles.cardName, { color: theme.text }]}>{card.Name}</Text>
                                
                                <View style={styles.badgeContainer}>
                                    <View style={[styles.badge, { backgroundColor: getColorForBadge(card.Color) }]}>
                                        <Text style={styles.badgeText}>{card.Color}</Text>
                                    </View>
                                    <View style={[styles.badge, { backgroundColor: getRarityColor(card.Rarity) }]}>
                                        <Text style={styles.badgeText}>{card.Rarity}</Text>
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
                                    {card.Inkable !== undefined && (
                                        <View style={styles.statItem}>
                                            <Icon name="water" size={18} color={theme.icon || theme.text} />
                                            <Text style={[styles.statText, { color: theme.text }]}>
                                                Inkable: {card.Inkable ? 'No' : 'Yes'}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </View>
                        
                        {/* Card Details Section */}
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
                        
                        {/* Card Text Section */}
                        {card.Body_Text && (
                            <View style={[styles.cardSection, { backgroundColor: theme.card || theme.surface }]}>
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Card Text</Text>
                                <Text style={[styles.cardBodyText, { color: theme.text }]}>{card.Body_Text}</Text>
                            </View>
                        )}
                        
                        {/* Flavor Text Section */}
                        {card.Flavor_Text && (
                            <View style={[styles.cardSection, { backgroundColor: theme.card || theme.surface }]}>
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Flavor Text</Text>
                                <Text style={[styles.cardFlavorText, { color: theme.textSecondary || theme.text }]}>
                                    "{card.Flavor_Text}"
                                </Text>
                            </View>
                        )}
                        
                        {/* Price Information Section */}
                        <View style={[styles.cardSection, { backgroundColor: theme.card || theme.surface }]}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Price Information</Text>
                            
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
                        </View>
                    </ScrollView>

                    {/* Collection management buttons */}
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
                </View>
            </View>
        </Modal>
    );
};

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
});

export default LorcanaCardModal; 