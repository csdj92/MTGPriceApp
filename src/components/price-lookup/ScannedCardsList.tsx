import React, { useCallback, memo } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Image, 
  ActivityIndicator 
} from 'react-native';
import { ExtendedCard } from '../../types/card';
import { LorcanaCard } from '../../types/lorcana';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Logger } from '../../utils/logger';

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

export type ScannedCard = Omit<ExtendedCard, 'type'> & { type: 'MTG' | 'Lorcana' };

export interface ScannedCardsListProps {
  cards: ScannedCard[];
  isLoading?: boolean;
  onCardPress: (card: ScannedCard) => void;
  keyExtractor?: (item: ScannedCard) => string;
}

/**
 * Renders a list of scanned cards with optimized performance
 */
const ScannedCardsList: React.FC<ScannedCardsListProps> = ({
  cards,
  isLoading = false,
  onCardPress,
  keyExtractor = (item) => item.id || item.name || Math.random().toString()
}) => {
  
  // Memoize the renderItem function to prevent rebuilding on each render
  const renderScannedCard = useCallback(({ item }: { item: ScannedCard }) => (
    <TouchableOpacity 
      style={styles.cardItem}
      onPress={() => onCardPress(item)}
      accessibilityLabel={`Card: ${item.name}`}
      accessibilityHint="Press to view card details"
    >
      {/* Improve image handling to support multiple image URI formats */}
      {(item.imageUris?.small || item.imageUris?.normal || item.imageUrl) ? (
        <Image 
          source={{ uri: item.imageUris?.small || item.imageUris?.normal || item.imageUrl }} 
          style={styles.cardImage} 
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.cardImage, styles.placeholderImage]}>
          <Icon name="card" size={36} color="#999" />
        </View>
      )}
      
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.cardDetails}>
          {item.setName} • {item.rarity}
        </Text>
        <Text style={styles.cardPrice}>
          ${typeof item.prices?.usd === 'string' 
            ? parseFloat(item.prices.usd).toFixed(2) 
            : '0.00'}
        </Text>
      </View>
      
      <View style={styles.cardType}>
        <Text style={[
          styles.cardTypeText,
          item.type === 'Lorcana' ? styles.lorcanaText : styles.mtgText
        ]}>
          {item.type}
        </Text>
      </View>
    </TouchableOpacity>
  ), [onCardPress]);

  // Use memo to prevent recreating the empty component on each render
  const EmptyListComponent = useCallback(() => (
    <View style={styles.emptyContainer}>
      {isLoading ? (
        <ActivityIndicator size="large" color="#2196F3" />
      ) : (
        <>
          <Icon name="card-search" size={64} color="#999" />
          <Text style={styles.emptyText}>No cards scanned yet</Text>
          <Text style={styles.emptySubtext}>
            Press the camera button to start scanning
          </Text>
        </>
      )}
    </View>
  ), [isLoading]);
  
  // Memoize the equality function for the FlatList items
  const areCardsEqual = useCallback((prevItem: ScannedCard, nextItem: ScannedCard) => 
    prevItem.id === nextItem.id && 
    prevItem.name === nextItem.name && 
    prevItem.prices?.usd === nextItem.prices?.usd, 
  []);

  return (
    <FlatList
      data={cards}
      renderItem={renderScannedCard}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.listContainer}
      ListEmptyComponent={EmptyListComponent}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={
        cards.length > 0 ? (
          <View style={styles.listHeader}>
            <Text style={styles.headerText}>
              Scanned Cards ({cards.length})
            </Text>
          </View>
        ) : null
      }
      // Performance optimizations
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={5}
      getItemLayout={(data, index) => ({
        length: 100, // Fixed item height for performance
        offset: 100 * index,
        index
      })}
      // Extra optimization: only re-render if the card actually changed
      extraData={cards.length}
    />
  );
};

const styles = StyleSheet.create({
  listContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  cardItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    height: 100, // Fixed height for performance
  },
  cardImage: {
    width: 70,
    height: 98,
    borderRadius: 4,
    marginRight: 12,
  },
  placeholderImage: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'space-between',
    height: '100%',
  },
  cardName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  cardPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  cardType: {
    marginLeft: 8,
    padding: 4,
    borderRadius: 4,
  },
  cardTypeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  mtgText: {
    color: '#2196F3',
  },
  lorcanaText: {
    color: '#673AB7',
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    height: 300,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});

// Use memo to prevent unnecessary re-renders
export default memo(ScannedCardsList); 