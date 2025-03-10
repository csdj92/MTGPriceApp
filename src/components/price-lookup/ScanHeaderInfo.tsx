import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { VerificationStatus } from '../../services/CardProcessingService';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Icon = MaterialCommunityIcons as any;

export type ScanHeaderInfoProps = {
  isLorcanaScan: boolean;
  verificationStatus?: VerificationStatus;
  scannedCardsCount?: number;
  totalPrice?: number;
  onClose?: () => void;
};

const ScanHeaderInfo: React.FC<ScanHeaderInfoProps> = ({ 
  isLorcanaScan, 
  verificationStatus,
  scannedCardsCount,
  totalPrice,
  onClose
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.text}>
          {isLorcanaScan ? 'Scanning for Lorcana Cards' : 'Scanning for MTG Cards'}
        </Text>
        {verificationStatus?.isVerifying && (
          <Text style={styles.verifyingText}>Verifying card...</Text>
        )}
        {typeof scannedCardsCount === 'number' && (
          <Text style={styles.statsText}>
            Cards: {scannedCardsCount} | Total: ${totalPrice?.toFixed(2) || '0.00'}
          </Text>
        )}
      </View>
      {onClose && (
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Icon name="close" size={24} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentContainer: {
    flex: 1,
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  verifyingText: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 5,
  },
  statsText: {
    color: '#4CAF50',
    fontSize: 14,
    marginTop: 5,
    fontWeight: '500',
  },
  closeButton: {
    padding: 8,
    marginLeft: 16,
  },
});

export default ScanHeaderInfo; 