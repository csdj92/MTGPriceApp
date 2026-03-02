import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Icon = MaterialCommunityIcons as any;

export type ScanHeaderInfoProps = {
  isLorcanaScan: boolean;
  isVerifying?: boolean;
  scannedCardsCount?: number;
  totalPrice?: number;
  onClose?: () => void;
};

const ScanHeaderInfo: React.FC<ScanHeaderInfoProps> = ({
  isLorcanaScan,
  isVerifying,
  scannedCardsCount,
  totalPrice,
}) => {
  return (
    <View style={styles.container}>
      {/* Left: status */}
      <View style={styles.statusBlock}>
        {isVerifying ? (
          <View style={styles.verifyingRow}>
            <ActivityIndicator size="small" color="#6C63FF" style={{ marginRight: 8 }} />
            <Text style={styles.verifyingText}>Verifying…</Text>
          </View>
        ) : (
          <View style={styles.listeningRow}>
            <View style={styles.liveDot} />
            <Text style={styles.listeningText}>
              {isLorcanaScan ? 'LORCANA' : 'MTG'} SCANNER
            </Text>
          </View>
        )}
      </View>

      {/* Right: stats */}
      {typeof scannedCardsCount === 'number' && (
        <View style={styles.statsBlock}>
          <View style={styles.stat}>
            <Icon name="cards-outline" size={13} color="rgba(255,255,255,0.5)" />
            <Text style={styles.statValue}>{scannedCardsCount}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Icon name="currency-usd" size={13} color="#6C63FF" />
            <Text style={[styles.statValue, styles.statPrice]}>
              {totalPrice?.toFixed(2) ?? '0.00'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(8,8,16,0.92)',
  },

  // Status
  statusBlock: { flex: 1 },
  listeningRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2ECC71' },
  listeningText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  verifyingRow: { flexDirection: 'row', alignItems: 'center' },
  verifyingText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },

  // Stats
  statsBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  statPrice: { color: '#fff' },
  statDivider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.15)' },
});

export default ScanHeaderInfo;
