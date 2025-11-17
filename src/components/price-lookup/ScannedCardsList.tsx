import React, { useCallback, memo, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Image, 
  ActivityIndicator,
  Platform
} from 'react-native';
import { ExtendedCard, ScannedCard } from '../../types/card';
import { LorcanaCard } from '../../types/lorcana';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Logger } from '../../utils/logger';
import { getLorcanaImageUrl, getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils';
import FastImage from '@d11/react-native-fast-image';
import NewToCollectionLabel from './NewToCollectionLabel';

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

export interface ScannedCardsListProps {
  cards: ScannedCard[];
  isLoading?: boolean;
  onCardPress: (card: ScannedCard) => void;
  keyExtractor?: (item: ScannedCard) => string;
  newToCollectionCards?: Set<string>; // Set of card UUIDs that are new to the collection
}

/**
 * Renders a list of scanned cards with optimized performance
 */
const ScannedCardsList: React.FC<ScannedCardsListProps> = ({
  cards,
  isLoading = false,
  onCardPress,
  keyExtractor = (item: ScannedCard) => item.id || item.name || Math.random().toString(),
  newToCollectionCards = new Set()
}) => {
  
  // Card image component with loading state
  const CardImage = useCallback(({ uri, name }: { uri: string | null, name: string }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const handleLoad = () => {
      setIsLoading(false);
      // Record successful load
      if (uri) {
        handleImageLoadSuccess(uri, { name });
      }
    };
    
    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      Logger.error(`Failed to load image for card: ${name}`);
      if (uri) {
        console.log(`[ScannedCardsList] Failed image URI: ${uri}`);
        handleImageLoadError(uri, name);
      }
    };

    // Create a placeholder URL using the card name
    const placeholderUrl = `https://via.placeholder.com/488x680/333333/FFFFFF?text=${encodeURIComponent(name.charAt(0))}`;

    // If URI is invalid or there was an error, show placeholder
    if (!uri || hasError) {
      return (
        <View style={styles.cardImagePlaceholder}>
          <Text style={styles.cardPlaceholderText}>
            {name ? name.substring(0, 1).toUpperCase() : "?"}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.cardImageWrapper}>
        <FastImage 
          source={getImageSource(uri) || {
            uri,
            priority: FastImage.priority.high,
            cache: FastImage.cacheControl.immutable,
            headers: {
              'User-Agent': 'MTGPriceApp/1.0',
              'Accept': 'image/*,image/jpeg,image/png,image/avif',
              'Cache-Control': 'max-age=31536000, immutable'
            }
          }}
          style={styles.cardImage} 
          resizeMode={FastImage.resizeMode.contain}
          onLoad={handleLoad}
          onError={() => handleError()}
        />
        {isLoading && (
          <View style={[styles.cardImagePlaceholder, {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}]}>
            <Text style={styles.cardPlaceholderText}>
              {name ? name.substring(0, 1).toUpperCase() : "?"}
            </Text>
          </View>
        )}
      </View>
    );
  }, []);

  // Memoize the renderItem function to prevent rebuilding on each render
  const renderScannedCard = useCallback(({ item }: { item: ScannedCard }) => {
    // Get appropriate image URI
    let imageUri = null;
    
    // Check if it's a Lorcana card
    if (item.type === 'Lorcana') {
      // For Lorcana cards, use helper function - don't specify 'full' size
      imageUri = getLorcanaImageUrl(item);
    } else {
      // For MTG cards - use existing logic
      imageUri = item.imageUris?.normal || 
                 item.imageUris?.small || 
                 item.imageUrl || null;
    }

    // Check if the card is new to the collection
    const isNewToCollection = (() => {
      // For MTG cards
      if (item.type === 'MTG' && (item.id || item.uuid)) {
        return newToCollectionCards.has(item.id || item.uuid || '');
      }
      
      // For Lorcana cards - first check if Unique_ID exists on the card
      if (item.type === 'Lorcana') {
        const uniqueId = (item as any).Unique_ID;
        if (uniqueId) {
          return newToCollectionCards.has(uniqueId);
        }
        // Fallback to id if Unique_ID doesn't exist
        return newToCollectionCards.has(item.id || '');
      }
      
      // Default fallback
      return newToCollectionCards.has(item.id || item.uuid || '');
    })();
    
    // // Debug log
    // if (__DEV__) {
    //   console.log(`[ScannedCardsList] Card (${item.name}): New to collection: ${isNewToCollection}`, {
    //     id: item.id,
    //     uuid: item.uuid,
    //     Unique_ID: (item as any).Unique_ID, // Check if Lorcana Unique_ID exists
    //     inNewSet: Array.from(newToCollectionCards),
    //     cardType: item.type
    //   });
    // }

    // // Log the image URI for debugging
    // if (__DEV__) {
    //   console.log(`[ScannedCardsList] Card (${item.name}): Using image URI: ${imageUri || 'none'}`);
    // }

    return (
      <TouchableOpacity 
        style={styles.cardItem}
        onPress={() => onCardPress(item)}
        accessibilityLabel={`Card: ${item.name}`}
        accessibilityHint="Press to view card details"
      >
        <CardImage uri={imageUri} name={item.name} />
        
        {item.isFoil && (
          <View style={styles.foilBadge}>
            <Icon name="star" size={14} color="#FFD700" />
          </View>
        )}
        
        {/* Show "New to Collection" label if the card is new */}
        {isNewToCollection && <NewToCollectionLabel setCode={item.setCode} />}
        
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
    );
  }, [onCardPress, CardImage, newToCollectionCards]);

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
        length: 140, // Updated height for larger card display
        offset: 140 * index,
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
    height: 140, // Increased height for larger card display
  },
  cardImageWrapper: {
    width: 100, // Increased width for larger card display
    height: 140, // Increased height to maintain aspect ratio
    borderRadius: 8,
    marginRight: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  cardImagePlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  cardPlaceholderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#999',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'space-between',
    height: '100%',
    paddingVertical: 4,
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
  foilBadge: {
    position: 'absolute',
    top: 2,
    left: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    padding: 2,
  },
});

// Use memo to prevent unnecessary re-renders
export default memo(ScannedCardsList); 