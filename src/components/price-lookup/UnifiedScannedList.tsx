import React from 'react';
import { View, FlatList, Text, StyleSheet, TouchableOpacity } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { ScannedCard, LorcanaScannedCard, ScannedItem } from '../../types/card';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { inkColor, getLorcanaRarityColor, formatLorcanaRarity } from '../../utils/formatters';

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
  scannedCards: _scannedCards,
  lorcanaScannedCards,
  onRemoveCard,
  onSelectCard,
  isPriceLoading,
  newToCollectionCards = new Set(),
  onToggleFoil,
}) => {
  const { theme } = useTheme();

  const combinedList: ScannedItem[] = [...lorcanaScannedCards].sort((a, b) =>
    (b.scannedAt || 0) - (a.scannedAt || 0)
  );

  const renderItem = ({ item, index }: { item: ScannedItem; index: number }) => {
    const isNew      = newToCollectionCards.has(item.id);
    const normalPrice = Number(item.prices?.usd ?? 0) || 0;
    const foilPrice  = Number(item.prices?.usd_foil ?? item.prices?.usdFoil ?? item.prices?.usd ?? 0) || 0;
    const lineTotal  = normalPrice * item.normalCount + foilPrice * item.foilCount;
    const totalCopies = item.normalCount + item.foilCount;
    const cardColor   = (item as LorcanaScannedCard).card?.Color;
    const cardRarity  = (item as LorcanaScannedCard).card?.Rarity;
    const accentClr   = inkColor(cardColor);
    const rarityClr   = getLorcanaRarityColor(cardRarity, accentClr);

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: theme.surface }]}
        onPress={() => onSelectCard(item)}
        activeOpacity={0.75}
      >
        {/* Ink color left strip */}
        <View style={[styles.inkStrip, { backgroundColor: accentClr }]} />

        {/* Card image */}
        <View style={styles.imageWrapper}>
          <FastImage
            source={{ uri: item.imageUrl }}
            style={styles.cardImage}
            resizeMode={FastImage.resizeMode.cover}
          />
          {isNew && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
          {item.isFoil && (
            <View style={[styles.foilBadge, { borderColor: accentClr + '80' }]}>
              <Icon name="star" size={8} color="#fdd835" />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            {item.setCode ? (
              <View style={[styles.metaChip, { borderColor: theme.border }]}>
                <Text style={[styles.metaChipText, { color: theme.textSecondary }]}>{item.setCode}</Text>
              </View>
            ) : null}
            {cardRarity ? (
              <View style={[styles.metaChip, { borderColor: rarityClr + '60' }]}>
                <Text style={[styles.metaChipText, { color: rarityClr }]}>{formatLorcanaRarity(cardRarity)}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.qtyRow}>
            {item.normalCount > 0 && (
              <View style={styles.qtyChip}>
                <Icon name="cards" size={11} color={theme.textSecondary} />
                <Text style={[styles.qtyText, { color: theme.textSecondary }]}>×{item.normalCount}</Text>
              </View>
            )}
            {item.foilCount > 0 && (
              <View style={styles.qtyChip}>
                <Icon name="cards-diamond" size={11} color="#fdd835" />
                <Text style={[styles.qtyText, { color: theme.textSecondary }]}>×{item.foilCount}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Right: price + actions */}
        <View style={styles.rightCol}>
          <Text style={[styles.priceValue, { color: accentClr }]}>
            ${lineTotal.toFixed(2)}
          </Text>
          {totalCopies > 1 && (
            <Text style={[styles.priceUnit, { color: theme.textSecondary }]}>
              ×{totalCopies}
            </Text>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onToggleFoil && onToggleFoil(item.id)}
              activeOpacity={0.7}
            >
              <Icon
                name={item.isFoil ? 'star' : 'star-outline'}
                size={20}
                color={item.isFoil ? '#fdd835' : (theme.textSecondary || '#999')}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onRemoveCard(item.id, 'Lorcana')}
              activeOpacity={0.7}
            >
              <Icon name="close-circle-outline" size={20} color={theme.textSecondary || '#999'} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={combinedList}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      contentContainerStyle={[styles.listContent, { backgroundColor: theme.background }]}
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
    />
  );
};

const styles = StyleSheet.create({
  listContent: { paddingVertical: 8, paddingHorizontal: 12, flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginVertical: 4,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  inkStrip: { width: 3, alignSelf: 'stretch' },

  imageWrapper: { position: 'relative', marginVertical: 10, marginLeft: 10 },
  cardImage: { width: 56, height: 78, borderRadius: 6 },
  newBadge: {
    position: 'absolute', top: -4, left: -4,
    backgroundColor: '#2ECC71', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  newBadgeText: { color: '#fff', fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  foilBadge: {
    position: 'absolute', bottom: -4, right: -4,
    backgroundColor: '#1a1a1a', borderRadius: 6, borderWidth: 1,
    width: 16, height: 16, alignItems: 'center', justifyContent: 'center',
  },

  info: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center' },
  cardName: { fontSize: 13, fontWeight: '700', marginBottom: 5, lineHeight: 17 },

  metaRow: { flexDirection: 'row', gap: 4, marginBottom: 6, flexWrap: 'wrap' },
  metaChip: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  metaChipText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },

  qtyRow: { flexDirection: 'row', gap: 8 },
  qtyChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  qtyText: { fontSize: 11, fontWeight: '600' },

  rightCol: { alignItems: 'flex-end', paddingRight: 12, paddingVertical: 10, minWidth: 72 },
  priceValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.5, marginBottom: 2 },
  priceUnit: { fontSize: 10, marginBottom: 6 },
  actionRow: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 4 },
});

export default UnifiedScannedList;
