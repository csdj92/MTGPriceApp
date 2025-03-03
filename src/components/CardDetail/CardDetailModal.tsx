import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { NavigationIndependentTree } from '@react-navigation/native';
import FastImage from "@d11/react-native-fast-image";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { ExtendedCard } from '../../types/card';

// Import tab components
import DetailsTab from './DetailsTab';
import RulingsTab from './RulingsTab';
import VariationsTab from './VariationsTab';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;
const Tab = createMaterialTopTabNavigator();

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

interface ModalState {
    showFoil: boolean;
    setShowFoil: (value: boolean) => void;
    selectedCard: ExtendedCard | null;
}

interface CardDetailModalProps {
    state: ModalState;
    onClose: () => void;
    onVersionChange: (newVersion: ExtendedCard) => void;
    onAddToCollection: (card: ExtendedCard) => void;
    onDeleteCard: (card: ExtendedCard) => void;
}

const CardDetailModal: React.FC<CardDetailModalProps> = ({ 
    state, 
    onClose, 
    onVersionChange, 
    onAddToCollection, 
    onDeleteCard 
}) => {
    const normalPrice = useMemo(() => getBestPrice(state.selectedCard?.prices, false).toFixed(2), [state.selectedCard?.prices]);
    const foilPrice = useMemo(() => getBestPrice(state.selectedCard?.prices, true).toFixed(2), [state.selectedCard?.prices]);
    const { theme, isDark } = useTheme();

    return (
        <Modal
            visible={state.selectedCard !== null}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                    {state.selectedCard && (
                        <>
                            <View style={styles.modalImageSection}>
                                <View style={styles.modalImageWrapper}>
                                    <FastImage
                                        source={{ 
                                            uri: `${state.selectedCard.imageUris?.normal || state.selectedCard.imageUrl}${state.showFoil ? '&version=foil' : ''}`,
                                            priority: FastImage.priority.high,
                                            cache: FastImage.cacheControl.immutable
                                        }}
                                        style={styles.modalImage}
                                        resizeMode={FastImage.resizeMode.contain}
                                    />
                                    {state.showFoil && (
                                        <View style={styles.foilOverlay} />
                                    )}
                                </View>
                                <TouchableOpacity
                                    style={[styles.modalCloseButton, { backgroundColor: isDark ? 'rgba(40, 40, 40, 0.8)' : 'rgba(240, 240, 240, 0.9)' }]}
                                    onPress={onClose}
                                >
                                    <Icon name="close" size={24} color={theme.iconSecondary} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.cardInfoHeader}>
                                <View style={styles.cardTitleSection}>
                                    <Text style={[styles.cardName, { color: theme.text }]}>{state.selectedCard.name}</Text>
                                    <Text style={[styles.setInfo, { color: theme.textSecondary }]}>
                                        {state.selectedCard.setName} · #{state.selectedCard.collectorNumber}
                                    </Text>
                                </View>
                                
                                <View style={styles.priceWrapper}>
                                    {state.selectedCard.hasFoil && (
                                        <TouchableOpacity 
                                            style={[
                                                styles.foilToggle, 
                                                { backgroundColor: state.showFoil ? 'rgba(255, 215, 0, 0.2)' : 'rgba(120, 120, 120, 0.1)' }
                                            ]}
                                            onPress={() => state.setShowFoil(!state.showFoil)}
                                        >
                                            <Icon 
                                                name={state.showFoil ? "checkbox-marked" : "checkbox-blank-outline"} 
                                                size={20} 
                                                color={state.showFoil ? "#FFD700" : theme.iconSecondary} 
                                            />
                                            <Text style={[
                                                styles.foilToggleText, 
                                                { color: state.showFoil ? "#FFD700" : theme.text }
                                            ]}>
                                                Foil
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                            
                            <NavigationIndependentTree>
                                <Tab.Navigator
                                    screenOptions={{
                                        tabBarStyle: { 
                                            backgroundColor: theme.surface,
                                            elevation: 0,
                                            shadowOpacity: 0,
                                            borderBottomWidth: 1,
                                            borderBottomColor: theme.border,
                                        },
                                        tabBarActiveTintColor: theme.primary,
                                        tabBarInactiveTintColor: theme.textSecondary,
                                        tabBarIndicatorStyle: { 
                                            backgroundColor: theme.primary,
                                            height: 3,
                                            borderRadius: 3,
                                        },
                                        tabBarLabelStyle: {
                                            fontSize: 14,
                                            fontWeight: '600',
                                            textTransform: 'none',
                                        }
                                    }}
                                >
                                    <Tab.Screen name="Details">
                                        {() => <DetailsTab 
                                            card={state.selectedCard!} 
                                            normalPrice={normalPrice} 
                                            foilPrice={foilPrice} 
                                        />}
                                    </Tab.Screen>
                                    <Tab.Screen name="Rulings">
                                        {() => <RulingsTab card={state.selectedCard!} />}
                                    </Tab.Screen>
                                    <Tab.Screen name="Versions">
                                        {() => <VariationsTab 
                                            card={state.selectedCard!} 
                                            onVersionChange={onVersionChange}
                                        />}
                                    </Tab.Screen>
                                </Tab.Navigator>
                            </NavigationIndependentTree>
                            
                            <View style={[styles.modalActions, { borderTopColor: theme.border }]}>
                                {state.selectedCard &&
                                    (!state.selectedCard.quantity || state.selectedCard.quantity === 0) ? (
                                    <TouchableOpacity
                                        style={[
                                        styles.modalButton,
                                        { 
                                            backgroundColor: theme.primary,
                                            shadowColor: theme.primary,
                                            shadowOffset: { width: 0, height: 2 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 3.84,
                                            elevation: 5,
                                        }
                                        ]}
                                        onPress={() => state.selectedCard && onAddToCollection(state.selectedCard)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon name="plus" size={20} color="#fff" />
                                        <Text style={styles.modalButtonText}>Add to Collection</Text>
                                        </View>
                                    </TouchableOpacity>
                                    ) : null}
                                
                                {state.selectedCard &&
                                    state.selectedCard.quantity &&
                                    state.selectedCard.quantity > 0 ? (
                                    <TouchableOpacity
                                        style={styles.modalButtonOutline}
                                        onPress={() => state.selectedCard && onDeleteCard(state.selectedCard)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon name="delete-outline" size={20} color={theme.error} />
                                        <Text style={[styles.modalButtonOutlineText, { color: theme.error }]}>
                                            Mark as Missing
                                        </Text>
                                        </View>
                                    </TouchableOpacity>
                                    ) : null}
                                </View>

                        </>
                    )}
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
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    modalContent: {
        width: '92%',
        maxHeight: '92%',
        borderRadius: 16,
        overflow: 'hidden',
        flex: 1,
        flexDirection: 'column',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 5,
        },
        shadowOpacity: 0.34,
        shadowRadius: 6.27,
        elevation: 10,
    },
    modalImageSection: {
        position: 'relative',
        width: '100%',
        height: 320,
        overflow: 'hidden',
        backgroundColor: '#000',
    },
    modalImageWrapper: {
        width: '100%',
        height: '100%',
        position: 'relative',
    },
    modalImage: {
        width: '100%',
        height: '100%',
    },
    foilOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        opacity: 0.5,
    },
    modalCloseButton: {
        position: 'absolute',
        top: 12,
        right: 12,
        borderRadius: 24,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    cardInfoHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    cardTitleSection: {
        flex: 1,
    },
    cardName: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    setInfo: {
        fontSize: 14,
        marginTop: 2,
    },
    priceWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    foilToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    foilToggleText: {
        marginLeft: 4,
        fontSize: 14,
        fontWeight: '600',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        borderTopWidth: 1,
        paddingBottom: 24,
    },
    modalButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        flex: 1,
        marginHorizontal: 6,
    },
    modalButtonOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        flex: 1,
        marginHorizontal: 6,
        borderWidth: 1,
        borderColor: 'rgba(204, 0, 0, 0.3)',
        backgroundColor: 'rgba(204, 0, 0, 0.05)', 
    },
    modalButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        marginLeft: 8,
        fontSize: 16,
    },
    modalButtonOutlineText: {
        fontWeight: 'bold',
        marginLeft: 8,
        fontSize: 16,
    },
});

export default CardDetailModal; 