import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { useTheme } from '../../context/ThemeContext';
import { updateLorcanaCardQuantity } from '../../services/LorcanaService';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;

interface QuickQuantityModalProps {
    card: LorcanaCardWithPrice | null;
    visible: boolean;
    onClose: () => void;
    collectionId?: string;
    onQuantityChange?: () => void;
}

const QuickQuantityModal: React.FC<QuickQuantityModalProps> = ({
    card,
    visible,
    onClose,
    collectionId,
    onQuantityChange,
}) => {
    const { theme } = useTheme();
    const [quantityNormal, setQuantityNormal] = useState(0);
    const [quantityFoil, setQuantityFoil] = useState(0);
    const [updating, setUpdating] = useState(false);

    // Update quantities when card changes or when modal becomes visible
    useEffect(() => {
        if (card && visible) {
            console.log('[QuickQuantityModal] Loading quantities for card:', card.Name, {
                normal: card.quantity_normal,
                foil: card.quantity_foil
            });
            setQuantityNormal(card.quantity_normal || 0);
            setQuantityFoil(card.quantity_foil || 0);
        }
    }, [card, visible]);

    const handleQuantityChange = async (type: 'normal' | 'foil', delta: number) => {
        if (!card || !collectionId || updating) return;

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

            console.log('[QuickQuantityModal] Updated quantities:', { normal: newNormal, foil: newFoil });
        } catch (error) {
            console.error('Error updating quantity:', error);
        } finally {
            setUpdating(false);
        }
    };

    if (!card) return null;

    const normalPrice = parseFloat(card.price_usd || card.prices?.usd || '0');
    const foilPrice = parseFloat(card.price_usd_foil || card.prices?.usd_foil || '0');
    const normalValue = normalPrice * quantityNormal;
    const foilValue = foilPrice * quantityFoil;
    const totalValue = normalValue + foilValue;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View
                    style={[styles.modalContainer, { backgroundColor: theme.surface }]}
                    onStartShouldSetResponder={() => true}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerContent}>
                            <Icon name="counter" size={24} color={theme.primary} />
                            <Text style={[styles.title, { color: theme.text }]}>Adjust Quantity</Text>
                        </View>
                        <TouchableOpacity onPress={onClose}>
                            <Icon name="close" size={24} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    {/* Card Name */}
                    <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={2}>
                        {card.Name}
                    </Text>

                    {/* Normal Cards Control */}
                    <View style={[styles.quantityRow, { borderBottomColor: theme.border }]}>
                        <View style={styles.labelContainer}>
                            <Icon name="cards" size={20} color={theme.icon || theme.text} />
                            <Text style={[styles.label, { color: theme.text }]}>Normal</Text>
                        </View>
                        <View style={styles.controls}>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: theme.error || '#dc3545' }]}
                                onPress={() => handleQuantityChange('normal', -1)}
                                disabled={quantityNormal === 0 || updating}
                            >
                                <Icon name="minus" size={20} color="#ffffff" />
                            </TouchableOpacity>
                            <View style={styles.quantityDisplay}>
                                <Text style={[styles.quantity, { color: theme.text }]}>{quantityNormal}</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: theme.success || '#28a745' }]}
                                onPress={() => handleQuantityChange('normal', 1)}
                                disabled={updating}
                            >
                                <Icon name="plus" size={20} color="#ffffff" />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.price, { color: theme.success || theme.primary }]}>
                            ${normalValue.toFixed(2)}
                        </Text>
                    </View>

                    {/* Foil Cards Control */}
                    <View style={[styles.quantityRow, { borderBottomColor: theme.border }]}>
                        <View style={styles.labelContainer}>
                            <Icon name="cards-diamond" size={20} color={theme.icon || theme.text} />
                            <Text style={[styles.label, { color: theme.text }]}>Foil</Text>
                        </View>
                        <View style={styles.controls}>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: theme.error || '#dc3545' }]}
                                onPress={() => handleQuantityChange('foil', -1)}
                                disabled={quantityFoil === 0 || updating}
                            >
                                <Icon name="minus" size={20} color="#ffffff" />
                            </TouchableOpacity>
                            <View style={styles.quantityDisplay}>
                                <Text style={[styles.quantity, { color: theme.text }]}>{quantityFoil}</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: theme.success || '#28a745' }]}
                                onPress={() => handleQuantityChange('foil', 1)}
                                disabled={updating}
                            >
                                <Icon name="plus" size={20} color="#ffffff" />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.price, { color: theme.success || theme.primary }]}>
                            ${foilValue.toFixed(2)}
                        </Text>
                    </View>

                    {/* Total Value */}
                    <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                        <Text style={[styles.totalLabel, { color: theme.text }]}>Total Value:</Text>
                        <Text style={[styles.totalValue, { color: theme.success || theme.primary }]}>
                            ${totalValue.toFixed(2)}
                        </Text>
                    </View>

                    {/* Quick Actions */}
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: theme.primary }]}
                            onPress={onClose}
                        >
                            <Icon name="check" size={20} color="#ffffff" />
                            <Text style={styles.actionButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    cardName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 20,
        textAlign: 'center',
    },
    quantityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    labelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    button: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quantityDisplay: {
        minWidth: 40,
        alignItems: 'center',
    },
    quantity: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    price: {
        fontSize: 14,
        fontWeight: 'bold',
        minWidth: 70,
        textAlign: 'right',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 16,
        marginTop: 8,
        borderTopWidth: 2,
    },
    totalLabel: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    totalValue: {
        fontSize: 22,
        fontWeight: 'bold',
    },
    actionButtons: {
        marginTop: 20,
        gap: 10,
    },
    actionButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 14,
        borderRadius: 8,
        gap: 8,
    },
    actionButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default QuickQuantityModal;
