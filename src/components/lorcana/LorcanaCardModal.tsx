import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils';

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
    if (!card) return null;

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
                            <FastImage
                                source={getImageSource(card.Image) || { uri: card.Image }}
                                style={styles.modalImage}
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
                                style={styles.modalCloseButton}
                                onPress={onClose}
                            >
                                <Icon name="close" size={28} color="#666" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.modalInfo}>
                            <Text style={styles.modalTitle}>{card.Name}</Text>
                            <Text style={styles.modalText}>Set: {card.Set_Name}</Text>
                            <Text style={styles.modalText}>Number: {card.Card_Num}</Text>
                            <Text style={styles.modalText}>Rarity: {card.Rarity}</Text>
                            <Text style={styles.modalText}>Color: {card.Color}</Text>
                            <Text style={styles.modalText}>Franchise: {card.Franchise || ''}</Text>
                            <View style={styles.modalPrices}>
                                <Text style={styles.modalPriceTitle}>Price:</Text>
                                <Text style={styles.modalPrice}>
                                    ${card.prices?.usd ? Number(card.prices.usd).toFixed(2) : '0.00'}
                                </Text>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Collection management buttons */}
                    {!card.collected && onAddToCollection && (
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={onAddToCollection}
                        >
                            <Text style={styles.addButtonText}>Add to Collection</Text>
                        </TouchableOpacity>
                    )}

                    {card.collected && onRemoveFromCollection && (
                        <TouchableOpacity
                            style={styles.removeButton}
                            onPress={onRemoveFromCollection}
                        >
                            <Text style={styles.removeButtonText}>Remove from Collection</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={onDelete}
                    >
                        <Text style={styles.deleteButtonText}>Delete Card</Text>
                    </TouchableOpacity>
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
    addButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        alignItems: 'center',
    },
    addButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    removeButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#f44336',
        borderRadius: 8,
        alignItems: 'center',
    },
    removeButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    deleteButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#f44336',
        borderRadius: 8,
        alignItems: 'center',
    },
    deleteButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
});

export default LorcanaCardModal; 