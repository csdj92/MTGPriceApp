import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as any;
import { databaseService } from '../../services/DatabaseService';
import type { ExtendedCard } from '../../types/card';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import FastImage from "@d11/react-native-fast-image";
import RadialMenu from '../../components/RadialMenu';
import { isCardLegalForFormat, filterLegalCards } from '../../application/legalityFilter';
const CARD_ASPECT_RATIO = 0.68;

interface DeckDetailScreenProps {
  route: RouteProp<RootStackParamList, 'DeckDetailScreen'>;
}

const DeckDetailScreen: React.FC<DeckDetailScreenProps> = ({ route }) => {
  const { deckId } = route.params;
  const [cards, setCards] = useState<ExtendedCard[]>([]);
  const [collectedCards, setCollectedCards] = useState<ExtendedCard[]>([]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [showCollectedCards, setShowCollectedCards] = useState(false);
  const availableFormats = ['standard', 'modern', 'legacy'];
  const [selectedFormat, setSelectedFormat] = useState('standard');

  const radialItems = [
    { onPress: () => setShowCollectedCards(!showCollectedCards), render: () => (<Icon name="cards-outline" size={24} color="white" />) },
    { 
      onPress: () => { 
        const currentIndex = availableFormats.indexOf(selectedFormat);
        const nextIndex = (currentIndex + 1) % availableFormats.length;
        setSelectedFormat(availableFormats[nextIndex]);
        console.log('Selected format:', availableFormats[nextIndex]);
      }, 
      render: () => (
        <View style={{ alignItems: 'center' }}>
          <Icon name="gavel" size={24} color="white" />
          <Text style={{ color: 'white', fontSize: 10 }}>{selectedFormat}</Text>
        </View>
      )
    },
    { 
      onPress: () => navigation.navigate('DeckBuilder'), 
      render: () => (
        <View style={{ alignItems: 'center' }}>
          <Icon name="view-dashboard-outline" size={24} color="white" />
          <Text style={{ color: 'white', fontSize: 10 }}>Deck</Text>
        </View>
      )
    },
    { onPress: () => console.log('Action 3 not implemented'), render: () => (<Icon name="delete-outline" size={24} color="white" />) },
    { onPress: () => console.log('Action 4 not implemented'), render: () => (<Icon name="cog-outline" size={24} color="white" />) },
  ];

  useEffect(() => {
    loadDeckCards();
  }, [deckId]);

  useEffect(() => {
    const loadCollectedCards = async () => {
      console.log('Loading collected cards');
      const { cards, uuids } = await databaseService.getAllCollectedCards();
      const getCards = await databaseService.mapCollectionUUID(uuids);
      if (getCards && Array.isArray(getCards) && getCards.length > 0) {
        const firstCard = getCards[0];
        console.log('First collected card:', {
          name: firstCard.name,
          setCode: firstCard.setCode,
          imageUrl: firstCard.imageUrl,
          prices: getCards[0].prices
        });
      }
      setCollectedCards(cards);
    };
    loadCollectedCards();
  }, []);

  const addCardToDeck = async (card: ExtendedCard) => {
    if (!isCardLegalForFormat(card, selectedFormat)) {
      Alert.alert('Illegal Card', `${card.name} is not legal for ${selectedFormat} decks.`);
      return;
    }
    if (card.uuid) {
      Alert.alert(
        'Add Card to Deck',
        `Add ${card.name} to this deck?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Add',
            onPress: async () => {
              await databaseService.addCardToDeck(deckId, card.uuid!);
              loadDeckCards();
            },
          },
        ],
        { cancelable: true }
      );
    } else {
      console.error('Card UUID is undefined');
    }
  };

  const loadDeckCards = async () => {
    try {
      console.log('Loading deck cards for deckId:', deckId);
      const deckCards = await databaseService.getDeckCards(deckId);
      console.log('Deck cards received:', deckCards);
      setCards(deckCards);
    } catch (error) {
      console.error('Error loading deck cards:', error);
    }
  };

  const renderCardItem = ({ item }: { item: ExtendedCard }) => {
    const imageUri = item.imageUris?.normal || item.imageUrl || 
      `https://api.scryfall.com/cards/${item.setCode.toLowerCase()}/${item.collectorNumber}?format=image`;
    return (
      <View style={styles.cardContainer}>
        {imageUri ? (
          <FastImage
            source={{ uri: imageUri }}
            style={styles.cardImage}
            resizeMode={FastImage.resizeMode.cover}
            onError={() => {
              console.log('Failed to load image for card:', {
                name: item.name,
                uuid: item.uuid,
                uri: imageUri,
                error: 'Failed to load image'
              });
            }}
          />
        ) : (
          <View style={[styles.cardImage, { backgroundColor: '#e0e0e0' }] }>
            <Text style={styles.missingImageText}>No Image</Text>
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardDetails}>
            {item.setCode} • #{item.collectorNumber}
          </Text>
          <Text style={styles.cardDetails}>{item.type}</Text>
          <Text style={styles.cardDetails}>{item.rarity}</Text>
          <Text style={styles.cardDetails}>{item.power}</Text>
          <Text style={styles.cardDetails}>{item.toughness}</Text>
          <View style={styles.priceContainer}>
            {item.prices?.usd && (
              <Text style={styles.priceText}>${parseFloat(item.prices.usd).toFixed(2)}</Text>
            )}
            {item.prices?.usdFoil && (
              <Text style={styles.foilPriceText}>${parseFloat(item.prices.usdFoil).toFixed(2)} ✨</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={cards}
        renderItem={renderCardItem}
        keyExtractor={(item) => item.uuid || ''}
        numColumns={3}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No cards in this deck yet</Text>
        }
      />

      {showCollectedCards && (
        <FlatList
          data={filterLegalCards(collectedCards, selectedFormat)}
          renderItem={renderCardItem}
          keyExtractor={(item) => item.uuid || ''}
          numColumns={3}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No cards in your collection yet</Text>
          }
        />
      )}

      <RadialMenu items={radialItems} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  cardContainer: {
    flex: 1,
    margin: 4,
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    aspectRatio: CARD_ASPECT_RATIO,
  },
  cardInfo: {
    padding: 8,
  },
  cardName: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  cardDetails: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceText: {
    fontSize: 10,
    color: '#333',
  },
  foilPriceText: {
    fontSize: 10,
    color: '#888',
    fontStyle: 'italic',
  },
  grid: {
    padding: 4,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    color: '#666',
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#2196F3',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  missingImageText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -40 }, { translateY: -10 }],
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default DeckDetailScreen; 