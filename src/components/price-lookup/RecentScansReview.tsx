import React from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import type { Theme } from '../../context/ThemeContext';
import type { LorcanaScannedCard } from '../../types/card';
import { getImageSource } from '../../utils/imageUtils';

const Icon = MaterialCommunityIcons as any;

export interface RecentScansReviewProps {
  visible: boolean;
  lorcanaScannedCards: LorcanaScannedCard[];
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

/**
 * Lightweight modal that shows the most-recent scans (MTG & Lorcana).
 * Users can: 1) increment/decrement quantity, 2) remove a mistaken scan.
 * This helps mitigate OCR "double-fires" that inflate quantities.
 */
const RecentScansReview: React.FC<RecentScansReviewProps> = ({
  visible,
  lorcanaScannedCards,
  onIncrement,
  onDecrement,
  onRemove,
  onClose,
}) => {
  const { theme } = useTheme();
  const styles = useStyles();
  const data: LorcanaScannedCard[] = [...lorcanaScannedCards];

  const renderItem = ({ item }: { item: LorcanaScannedCard }) => {
    const id = item.id;
    const qtyNormal = item.normalCount;
    const qtyFoil = item.foilCount;

    return (
      <View style={styles.row}>
        <Image
          source={getImageSource(item.imageUrl) || { uri: item.imageUrl }}
          style={styles.image}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.details}>{item.setCode}</Text>
          <Text style={styles.details}>Normal: {qtyNormal} • Foil: {qtyFoil}</Text>
        </View>
        {/* quantity controls */}
        <View style={styles.qtyControls}>
          <TouchableOpacity onPress={() => onIncrement(id)} style={styles.iconBtn}>
            <Icon name="plus" size={20} color={theme.success} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDecrement(id)} style={styles.iconBtn}>
            <Icon name="minus" size={20} color={theme.error} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => onRemove(id)} style={styles.removeBtn}>
          <Icon name="delete" size={20} color={theme.icon} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Review Recent Scans</Text>
          <TouchableOpacity onPress={onClose}>
            <Icon name="close" size={26} color={theme.card} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
};

const useStyles = () =>
  useThemedStyles((theme: Theme) => ({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.primary,
    },
    title: { color: theme.card, fontSize: 18, fontWeight: 'bold' as const },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: theme.surface,
      padding: 8,
      marginBottom: 10,
      borderRadius: 8,
      elevation: 2,
    },
    image: { width: 50, height: 70, borderRadius: 4, marginRight: 10 },
    name: { fontSize: 14, fontWeight: 'bold' as const, color: theme.text },
    details: { fontSize: 12, color: theme.textSecondary },
    qtyControls: { flexDirection: 'row' as const, alignItems: 'center' as const },
    iconBtn: { padding: 4 },
    removeBtn: { padding: 6, marginLeft: 4 },
  }));

export default RecentScansReview; 