import React from 'react';
import { View, FlatList, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { ScannedCard, LorcanaScannedCard, ScannedItem } from '../../types/card';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import NewToCollectionLabel from './NewToCollectionLabel';

const Icon = MaterialCommunityIcons as any;

type UnifiedScannedListProps = {
  scannedCards: ScannedCard[];
  lorcanaScannedCards: LorcanaScannedCard[];
  onRemoveCard: (id: string, type: 'MTG' | 'Lorcana') => void;
  onSelectCard: (card: ScannedItem) => void;
  isPriceLoading: boolean;
  newToCollectionCards?: Set<string>;
  onToggleFoil?: (id: string) => void;
};

const UnifiedScannedList: React.FC<UnifiedScannedListProps> = ({
  scannedCards,
  lorcanaScannedCards,
  onRemoveCard,
  onSelectCard,
  isPriceLoading,
  newToCollectionCards = new Set(),
  onToggleFoil,
}) => {
  const combinedList: ScannedItem[] = [...lorcanaScannedCards, ...scannedCards].sort((a, b) => {
    const timeA = a.type === 'MTG' ? a.scannedAt : undefined;
    const timeB = b.type === 'MTG' ? b.scannedAt : undefined;
    if (timeA && timeB) {
      return timeB - timeA;
    }
    return 0;
  });

  const renderItem = ({ item }: { item: ScannedItem }) => {
    const isLorcana = item.type === 'Lorcana';
    const cardId = isLorcana ? item.id : item.uuid;
    const isNew = newToCollectionCards.has(cardId || '');

    return (
      <TouchableOpacity style={styles.cardItem} onPress={() => onSelectCard(item)}>
        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
        {isNew && <NewToCollectionLabel setCode={item.setCode} />}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.cardDetails}>
            {isLorcana ? item.setCode : `${item.setName} • ${item.rarity}`}
          </Text>
          <Text style={styles.cardPrice}>
            {isLorcana ? '' : `$${item.prices?.usd || '0.00'}`}
          </Text>
        </View>
        <TouchableOpacity style={styles.removeButton} onPress={() => onRemoveCard(cardId || '', item.type)}>
          <Icon name="close-circle" size={24} color="#C0C0C0" />
        </TouchableOpacity>
        {isLorcana && (
          <TouchableOpacity style={styles.foilToggle} onPress={() => onToggleFoil && cardId && onToggleFoil(cardId)}>
            <Icon name={item.isFoil ? 'star' : 'star-outline'} size={20} color={item.isFoil ? '#fdd835' : '#999'} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (isPriceLoading) {
    return <ActivityIndicator size="large" color="#0000ff" />;
  }

  return (
    <FlatList
      data={combinedList}
      renderItem={renderItem}
      keyExtractor={item => (item.type === 'Lorcana' ? item.id : item.uuid) || Math.random().toString()}
      contentContainerStyle={styles.listContent}
    />
  );
};

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: 100,
      },
      cardItem: {
        flexDirection: 'row',
        padding: 10,
        marginBottom: 10,
        backgroundColor: '#fff',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        alignItems: 'center',
      },
      cardImage: {
        width: 60,
        height: 84,
        borderRadius: 4,
        marginRight: 10,
      },
      cardInfo: {
        flex: 1,
        justifyContent: 'center',
      },
      cardName: {
        fontSize: 16,
        fontWeight: 'bold',
      },
      cardDetails: {
        fontSize: 12,
        color: '#666',
      },
      cardPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2E8B57',
        marginTop: 4,
      },
      removeButton: {
        padding: 5,
      },
      foilToggle: {
        marginRight: 6,
      },
});

export default UnifiedScannedList; 