import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    Alert,
    Modal,
    SafeAreaView,
    TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import type { ExtendedCard } from '../../types/card';
import type { LorcanaCard } from '../../types/lorcana';
import CardSearch from '../../components/CardSearch';
import CardList from '../../components/CardList';
import LorcanaCardList from '../../components/LorcanaCardList';
import CollectionSelectionModal from '../../components/CollectionSelectionModal';
import { databaseService } from '../../services/DatabaseService';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type SearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type SelectedCard = ExtendedCard | LorcanaCard;

const SearchScreen = () => {
    const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
    const [isCollectionModalVisible, setIsCollectionModalVisible] = useState(false);
    const [isCardDetailsVisible, setIsCardDetailsVisible] = useState(false);
    const navigation = useNavigation<SearchScreenNavigationProp>();

    const handleCardSelect = (card: SelectedCard) => {
        setSelectedCard(card);
        setIsCardDetailsVisible(true);
    };

    const handleAddToCollection = (card: SelectedCard) => {
        setIsCardDetailsVisible(false);
        setSelectedCard(card);
        setIsCollectionModalVisible(true);
    };

    const handleCollectionSelect = async (collectionId: string) => {
        if (!selectedCard) return;

        try {
            // Handle MTG card
            if ('name' in selectedCard) {
                const cardWithUuid = await databaseService.addToCache(selectedCard);
                if (!cardWithUuid.uuid) {
                    throw new Error('Failed to generate UUID for card');
                }
                await databaseService.addCardToCollection(cardWithUuid.uuid, collectionId);
                Alert.alert(
                    'Success',
                    `Added ${selectedCard.name} to collection`,
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                setIsCollectionModalVisible(false);
                                setSelectedCard(null);
                            }
                        }
                    ]
                );
            } 
            // Handle Lorcana card
            else {
                // TODO: Implement Lorcana card collection handling
                Alert.alert(
                    'Success',
                    `Added ${selectedCard.Name} to collection`,
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                setIsCollectionModalVisible(false);
                                setSelectedCard(null);
                            }
                        }
                    ]
                );
            }
        } catch (error) {
            console.error('Error adding card to collection:', error);
            Alert.alert(
                'Error',
                'Failed to add card to collection'
            );
        } finally {
            setIsCollectionModalVisible(false);
            setSelectedCard(null);
        }
    };

    const renderCardDetailsModal = () => (
        <Modal
            visible={isCardDetailsVisible}
            animationType="slide"
            onRequestClose={() => setIsCardDetailsVisible(false)}
        >
            <SafeAreaView style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity
                        onPress={() => setIsCardDetailsVisible(false)}
                        style={styles.closeButton}
                    >
                        <Icon name="close" size={24} color="#666" />
                    </TouchableOpacity>
                </View>
                {selectedCard && (
                    'Name' in selectedCard ? (
                        <LorcanaCardList
                            cards={[selectedCard]}
                            isLoading={false}
                            onCardPress={() => {}}
                            onAddToCollection={(card) => handleAddToCollection(card)}
                        />
                    ) : (
                        <CardList
                            cards={[{ ...selectedCard, isExpanded: true }]}
                            isLoading={false}
                            onAddToCollection={(card) => handleAddToCollection(card)}
                        />
                    )
                )}
            </SafeAreaView>
        </Modal>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.searchContainer}>
                    <CardSearch
                        onCardSelect={handleCardSelect}
                        onAddToCollection={handleAddToCollection}
                        placeholder="Search for cards..."
                        autoFocus={true}
                        showResults={true}
                    />
                </View>

                <CollectionSelectionModal
                    visible={isCollectionModalVisible}
                    onClose={() => setIsCollectionModalVisible(false)}
                    onSelect={handleCollectionSelect}
                />

                {renderCardDetailsModal()}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    searchContainer: {
        flex: 1,
        position: 'relative',
        zIndex: 1,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    closeButton: {
        padding: 8,
    },
});

export default SearchScreen; 