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
            <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
                <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                    <ScrollView>
                        <View style={styles.modalImageContainer}>
                            <FastImage
                                source={getImageSource(card.Image) || { uri: card.Image }}
                                style={[styles.modalImage, { backgroundColor: theme.surface }]}
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
                            <TouchableOpacity
                                style={[styles.modalCloseButton, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}
                                onPress={onClose}
                            >
                                <Icon name="close" size={28} color={theme.text} />
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.modalInfo, { backgroundColor: theme.surface }]}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>{card.Name}</Text>
                            <Text style={[styles.modalText, { color: theme.text }]}>Set: {card.Set_Name}</Text>
                            <Text style={[styles.modalText, { color: theme.text }]}>Number: {card.Card_Num}</Text>
                            <Text style={[styles.modalText, { color: theme.text }]}>Rarity: {card.Rarity}</Text>
                            <Text style={[styles.modalText, { color: theme.text }]}>Color: {card.Color}</Text>
                            <Text style={[styles.modalText, { color: theme.text }]}>Franchise: {card.Franchise || ''}</Text>
                            <View style={[styles.modalPrices, { backgroundColor: theme.surface }]}>
                                <Text style={[styles.modalPriceTitle, { color: theme.text }]}>Price:</Text>
                                <Text style={[styles.modalPrice, { color: theme.success || theme.primary }]}>
                                    ${card.prices?.usd ? Number(card.prices.usd).toFixed(2) : '0.00'}
                                </Text>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Collection management buttons */}
                    {!card.collected && onAddToCollection && (
                        <TouchableOpacity
                            style={[styles.addButton, { backgroundColor: theme.success || '#28a745' }]}
                            onPress={onAddToCollection}
                        >
                            <Text style={[styles.addButtonText, { color: '#ffffff' }]}>Add to Collection</Text>
                        </TouchableOpacity>
                    )}

                    {card.collected && onRemoveFromCollection && (
                        <TouchableOpacity
                            style={[styles.removeButton, { backgroundColor: theme.error || '#dc3545' }]}
                            onPress={onRemoveFromCollection}
                        >
                            <Text style={[styles.removeButtonText, { color: '#ffffff' }]}>Remove from Collection</Text>
                        </TouchableOpacity>
                    )}                   

                    
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxHeight: '90%',
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
    modalInfo: {
        padding: 16,
        borderRadius: 8,
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
        borderRadius: 8,
        padding: 8,
    },
    modalPriceTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    modalPrice: {
        fontSize: 16,
        marginBottom: 4,
        fontWeight: 'bold',
    },
    modalCloseButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        padding: 8,
        borderRadius: 20,
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    addButton: {
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    addButtonText: {
        fontWeight: 'bold',
    },
    removeButton: {
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    removeButtonText: {
        fontWeight: 'bold',
    },
    deleteButton: {
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    deleteButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
});

export default LorcanaCardModal; 