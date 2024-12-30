import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { databaseService } from '../../services/DatabaseService';
import CardList from '../../components/CardList';
import type { ExtendedCard } from '../../types/card';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'CollectionDetails'>;

const CollectionDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
    const { collectionId } = route.params;
    const [cards, setCards] = useState<ExtendedCard[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [collection, setCollection] = useState<{ name: string; totalValue: number } | null>(null);
    const [areAllExpanded, setAreAllExpanded] = useState(false);

    useEffect(() => {
        loadCollection();
    }, [collectionId]);

    const loadCollection = async () => {
        setIsLoading(true);
        try {
            const [collectionData, collectionCards] = await Promise.all([
                databaseService.getCollections().then(collections =>
                    collections.find(c => c.id === collectionId)
                ),
                databaseService.getCollectionCards(collectionId, 1)
            ]);

            if (collectionData) {
                setCollection({
                    name: collectionData.name,
                    totalValue: collectionData.totalValue
                });
                navigation.setOptions({ title: collectionData.name });
            }
            setCards(collectionCards.map(card => ({ ...card, isExpanded: false })));
        } catch (error) {
            console.error('Error loading collection:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCardPress = (card: ExtendedCard) => {
        setCards(prevCards =>
            prevCards.map(c => c.id === card.id ? { ...c, isExpanded: !c.isExpanded } : c)
        );
    };

    const toggleAllCards = () => {
        setAreAllExpanded(!areAllExpanded);
        setCards(prevCards => prevCards.map(card => ({ ...card, isExpanded: !areAllExpanded })));
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <Text style={styles.statsText}>
                        {cards.length} cards · ${collection?.totalValue.toFixed(2) || '0.00'}
                    </Text>
                    <TouchableOpacity onPress={toggleAllCards} style={styles.toggleButton}>
                        <Text style={styles.toggleText}>
                            {areAllExpanded ? 'Collapse All' : 'Expand All'}
                        </Text>
                        <Icon
                            name={areAllExpanded ? 'chevron-up' : 'chevron-down'}
                            size={24}
                            color="#2196F3"
                        />
                    </TouchableOpacity>
                </View>
            </View>
            <CardList
                cards={cards}
                isLoading={isLoading}
                onCardPress={handleCardPress}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statsText: {
        fontSize: 16,
        color: '#666',
    },
    toggleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    toggleText: {
        marginRight: 8,
        color: '#2196F3',
        fontSize: 14,
        fontWeight: '500',
    },
});

export default CollectionDetailsScreen; 