import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

export interface ScanHeaderInfoProps {
  isLorcanaScan: boolean;
  scannedCardsCount: number;
  totalPrice: number;
  onClose: () => void;
}

/**
 * Header component for the scanning modal
 * Shows scan type, counter, and close button
 */
const ScanHeaderInfo: React.FC<ScanHeaderInfoProps> = ({
  isLorcanaScan,
  scannedCardsCount,
  totalPrice,
  onClose
}) => {
  return (
    <View style={styles.modalHeader}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClose}
        accessibilityLabel="Close scanner"
        accessibilityHint="Closes the card scanner and returns to the list"
      >
        <Icon name="close" size={24} color="#fff" />
      </TouchableOpacity>
      
      <View style={styles.scanningInfo}>
        <Icon name="camera" size={16} color="#fff" style={styles.cameraIcon} />
        <Text style={styles.scanningText}>
          {isLorcanaScan ? 'Scanning Lorcana Cards' : 'Scanning MTG Cards'}
        </Text>
        
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>
            {scannedCardsCount} ${totalPrice.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  closeButton: {
    padding: 8,
  },
  scanningInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  cameraIcon: {
    marginRight: 8,
  },
  scanningText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  counterBadge: {
    marginLeft: 'auto',
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  counterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

// Use memo to prevent unnecessary re-renders
export default memo(ScanHeaderInfo); 