import React, { useRef, useEffect } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Image, 
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { ExtendedCard } from '../types/card';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
const Icon = MaterialIcons as any;

interface CardModalProps {
  card: ExtendedCard;
  onAdd: () => void;
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

const calculateCMC = (manaCost: string | undefined): number => {
  if (!manaCost) return 0;
  const manaSymbols = manaCost.replace(/[{}]/g, '').split('/');
  let cmc = 0;
  for (const symbol of manaSymbols) {
    const numericValue = parseInt(symbol);
    if (!isNaN(numericValue)) {
      cmc += numericValue;
    } else if (symbol.length > 0 && symbol !== '') {
      cmc += 1;
    }
  }
  return cmc;
};

const getLegalityColor = (status: string): string => {
  const statusMap: { [key: string]: string } = {
    legal: '#90EE90',
    restricted: '#FFD700',
    banned: '#FFB6C1',
    not_legal: '#D3D3D3',
  };
  return statusMap[status.toLowerCase()] || '#D3D3D3';
};

const getColorFromIdentity = (color: string): string => {
  const colorMap: { [key: string]: string } = {
    W: '#F8E7B9',
    U: '#B3CEEA',
    B: '#B0AFAE',
    R: '#EAA7A7',
    G: '#B7C4B9',
  };
  return colorMap[color] || '#000000';
};

const formatManaSymbols = (manaCost: string | undefined): React.ReactNode => {
  if (!manaCost) return null;
  
  const symbolRegex = /\{([^}]+)\}/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = symbolRegex.exec(manaCost)) !== null) {
    const manaSymbol = match[1];
    const symbolColor = getManaSymbolColor(manaSymbol);
    
    parts.push(
      <View key={`mana-${match.index}`} style={[styles.manaSymbol, { backgroundColor: symbolColor }]}>
        <Text style={styles.manaSymbolText}>{manaSymbol}</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.manaSymbolsContainer}>
      {parts}
    </View>
  );
};

const getManaSymbolColor = (symbol: string): string => {
  switch (symbol.toUpperCase()) {
    case 'W': return '#F8E7B9'; // White
    case 'U': return '#B3CEEA'; // Blue
    case 'B': return '#B0AFAE'; // Black
    case 'R': return '#EAA7A7'; // Red
    case 'G': return '#B7C4B9'; // Green
    default: return '#E5E5E5';  // Colorless/generic
  }
};

const CardModal: React.FC<CardModalProps> = ({ card, onAdd, onClose }) => {
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(50)).current;
  const [imageLoading, setImageLoading] = React.useState(false);
  
  useEffect(() => {
    setImageLoading(true);
    
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    return () => {
      // Add cleanup animation if needed
    };
  }, []);
  
  const handleClose = () => {
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: 50,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  return (
    <Modal transparent animationType="none" visible onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <Animated.View 
              style={[
                styles.modalContainer,
                { 
                  opacity: modalOpacity,
                  transform: [{ translateY: modalTranslateY }],
                }
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{card.name}</Text>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <Icon name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                <View style={styles.cardImageContainer}>
                  {imageLoading && (
                    <View style={styles.imageLoader}>
                      <ActivityIndicator size="large" color="#1e88e5" />
                    </View>
                  )}
                  {card.imageUrl && (
                    <Image
                      source={{ uri: card.imageUrl }}
                      style={styles.modalImage}
                      resizeMode="contain"
                      onLoadStart={() => setImageLoading(true)}
                      onLoadEnd={() => setImageLoading(false)}
                    />
                  )}
                </View>
                
                <View style={styles.cardInfoContainer}>
                  <View style={styles.typeLine}>
                    <Text style={styles.typeText}>
                      {card.type}
                      {card.rarity ? ` • ${card.rarity}` : ''}
                    </Text>
                    {formatManaSymbols(card.manaCost)}
                  </View>
                  
                  {card.text && (
                    <View style={styles.cardSection}>
                      <Text style={styles.sectionTitle}>Rules Text</Text>
                      <Text style={styles.rulesText}>{card.text}</Text>
                    </View>
                  )}
                  
                  {(card.power || card.toughness) && (
                    <View style={styles.statsContainer}>
                      <Text style={styles.statsLabel}>Power/Toughness:</Text>
                      <Text style={styles.statsValue}>{card.power}/{card.toughness}</Text>
                    </View>
                  )}
                  
                  {card.colorIdentity && card.colorIdentity.length > 0 && (
                    <View style={styles.cardSection}>
                      <Text style={styles.sectionTitle}>Color Identity</Text>
                      <View style={styles.colorIdentityContainer}>
                        {card.colorIdentity.map((color, index) => (
                          <View 
                            key={index} 
                            style={[
                              styles.colorDot, 
                              { backgroundColor: getColorFromIdentity(color) }
                            ]} 
                          />
                        ))}
                      </View>
                    </View>
                  )}
                  
                  {card.keywords && card.keywords.length > 0 && (
                    <View style={styles.cardSection}>
                      <Text style={styles.sectionTitle}>Keywords</Text>
                      <View style={styles.keywordsContainer}>
                        {card.keywords.map((keyword, index) => (
                          <View key={index} style={styles.keywordPill}>
                            <Text style={styles.keywordText}>{keyword}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionTitle}>Set Information</Text>
                    <View style={styles.setInfoBox}>
                      <Text style={styles.setName}>
                        {card.setName} ({card.setCode.toUpperCase()})
                      </Text>
                      <Text style={styles.collectorNumber}>
                        Collector Number: {card.collectorNumber}
                      </Text>
                    </View>
                  </View>
                  
                  {card.legalities && (
                    <View style={styles.cardSection}>
                      <Text style={styles.sectionTitle}>Format Legality</Text>
                      <View style={styles.legalitiesContainer}>
                        {Object.entries(card.legalities).map(([format, status]) => (
                          <View 
                            key={format} 
                            style={[
                              styles.legalityPill,
                              { backgroundColor: getLegalityColor(status) }
                            ]}
                          >
                            <Text style={styles.legalityText}>
                              {format}: {status}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionTitle}>Additional Information</Text>
                    <View style={styles.additionalInfoBox}>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Mana Cost:</Text>
                        <Text style={styles.infoValue}>{card.manaCost || 'None'}</Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>CMC:</Text>
                        <Text style={styles.infoValue}>{calculateCMC(card.manaCost)}</Text>
                      </View>
                      {card.power && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Power:</Text>
                          <Text style={styles.infoValue}>{card.power}</Text>
                        </View>
                      )}
                      {card.toughness && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Toughness:</Text>
                          <Text style={styles.infoValue}>{card.toughness}</Text>
                        </View>
                      )}
                      {card.rarity && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Rarity:</Text>
                          <Text style={styles.infoValue}>{card.rarity}</Text>
                        </View>
                      )}
                      {card.edhrec_rank && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>EDHREC Rank:</Text>
                          <Text style={styles.infoValue}>{card.edhrec_rank}</Text>
                        </View>
                      )}
                      {card.booster && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Found in Boosters:</Text>
                          <Text style={styles.infoValue}>{card.booster}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  
                  {card.flavorText && (
                    <View style={styles.cardSection}>
                      <Text style={styles.flavorText}>{card.flavorText}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
              
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity 
                  style={styles.addButton} 
                  onPress={onAdd}
                  activeOpacity={0.8}
                >
                  <Icon name="add" size={20} color="#fff" />
                  <Text style={styles.addButtonText}>Add to Deck</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={handleClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: SCREEN_WIDTH * 0.9,
    maxHeight: SCREEN_HEIGHT * 0.85,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  cardImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
    paddingVertical: 16,
  },
  modalImage: {
    width: SCREEN_WIDTH * 0.6,
    height: 360,
    borderRadius: 12,
  },
  imageLoader: {
    position: 'absolute',
    zIndex: 10,
  },
  cardInfoContainer: {
    padding: 16,
  },
  typeLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  typeText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  cardSection: {
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  rulesText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  statsLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginRight: 8,
  },
  statsValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  colorIdentityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keywordPill: {
    backgroundColor: '#e9ecef',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  keywordText: {
    fontSize: 12,
    color: '#495057',
  },
  setInfoBox: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
  },
  setName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  collectorNumber: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  legalitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legalityPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    margin: 2,
  },
  legalityText: {
    fontSize: 12,
    color: '#333',
  },
  additionalInfoBox: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
    width: 120,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  flavorText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 20,
    padding: 8,
    textAlign: 'center',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    padding: 16,
  },
  addButton: {
    flex: 2,
    backgroundColor: '#1e88e5',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  manaSymbolsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  manaSymbol: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  manaSymbolText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default CardModal; 