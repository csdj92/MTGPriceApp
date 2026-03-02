import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Modal,
  BackHandler,
  Platform,
  ToastAndroid,
  Alert,
  StyleSheet,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';

import { useLorcanaScanHistory } from '../../hooks/useLorcanaScanHistory';
import UnifiedScannedList from '../../components/price-lookup/UnifiedScannedList';
import { searchLorcanaCards } from '../../services/LorcanaService';
import CardScanner from '../../components/CardScanner';
import { OcrService } from '../../services/OcrService';
import { CardSearchService } from '../../services/CardSearchService';
import { CollectionService } from '../../services/CollectionService';
import type { OcrResult } from '../../types/card';
import { LorcanaCard as LorcanaDbCard } from '../../types/lorcana';
import LorcanaCardSelectionModal from '../../components/LorcanaCardSelectionModal';
import SetSelector from '../../components/price-lookup/SetSelector';
import CameraControls from '../../components/price-lookup/CameraControls';
import ZoomControls from '../../components/price-lookup/ZoomControls';
import ScanHeaderInfo from '../../components/price-lookup/ScanHeaderInfo';
import RecentScansReview from '../../components/price-lookup/RecentScansReview';

const Icon = MaterialCommunityIcons as any;
const LORCANA_SET_FILTER_KEY = '@price_lookup_lorcana_set_filter';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PriceLookup'>;
};

const PriceLookupScreenRefactored: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();

  const {
    lorcanaScannedCards,
    totalPrice,
    addLorcanaCard,
    removeCard,
    clearScans,
    incrementCard,
    decrementCard,
    toggleFoil,
  } = useLorcanaScanHistory();

  const [search, setSearch]                     = useState('');
  const [isLoading, setIsLoading]               = useState(false);
  const [cameraActive, setCameraActive]         = useState(false);
  const [cameraModalShown, setCameraModalShown] = useState(false);
  const [multiModalVisible, setMultiModalVisible] = useState(false);
  const [multiCards, setMultiCards]             = useState<LorcanaDbCard[]>([]);
  const [selectedSet, setSelectedSet]           = useState<string | null>(null);
  const [setFilterLoaded, setSetFilterLoaded]   = useState(false);
  const [isScanningPaused, setIsScanningPaused] = useState(false);
  const [isVerifying, setIsVerifying]           = useState(false);
  const isVerifyingRef                          = useRef(false);
  const [reviewVisible, setReviewVisible]       = useState(false);
  const [newToCollectionCards, setNewToCollectionCards] = useState<Set<string>>(new Set());

  const showScanFeedback = (message: string) => {
    if (Platform.OS === 'android') { ToastAndroid.show(message, ToastAndroid.SHORT); return; }
    Alert.alert('Scanner', message);
  };

  useEffect(() => {
    if (!cameraActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cameraActive) { setCameraModalShown(false); setCameraActive(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [cameraActive]);

  useEffect(() => { if (!cameraActive) setCameraModalShown(false); }, [cameraActive]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(LORCANA_SET_FILTER_KEY).then(saved => {
      if (!mounted) return;
      setSelectedSet(saved || null);
    }).catch(err => console.error('[PriceLookup] Failed to load set filter', err))
      .finally(() => { if (mounted) setSetFilterLoaded(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!setFilterLoaded) return;
    if (selectedSet) AsyncStorage.setItem(LORCANA_SET_FILTER_KEY, selectedSet).catch(() => {});
    else AsyncStorage.removeItem(LORCANA_SET_FILTER_KEY).catch(() => {});
  }, [selectedSet, setFilterLoaded]);

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) return;
    Keyboard.dismiss();
    setIsLoading(true);
    try {
      const results = await searchLorcanaCards(q);
      results.forEach(c => addLorcanaCard(c));
    } catch (err) {
      console.error('[PriceLookup] search error', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOcrScan = async (result: OcrResult) => {
    if (isVerifyingRef.current || isVerifying) return;
    try {
      if (!result?.text?.trim()) return;
      const preprocessed = OcrService.preprocessText(result.text);
      const mainName = result.isLorcana ? OcrService.preprocessText(result.mainName ?? '') : preprocessed;
      if (!mainName) return;
      const duplicateKey = result.cardNumber
        ? `${result.cardNumber}-${result.setNumber ?? selectedSet ?? ''}`
        : mainName.toLowerCase().trim();
      if (OcrService.checkDuplicate(duplicateKey)) return;
      isVerifyingRef.current = true;
      setIsVerifying(true);
      const found = await CardSearchService.findLorcanaCard(mainName, result.subtype, selectedSet, result.cardNumber, result.setNumber);
      if (!found) { showScanFeedback('Card not recognised'); return; }
      if (found.kind === 'multiple') {
        if (found.cards.length === 1) {
          const card = found.cards[0] as LorcanaDbCard;
          await CollectionService.addLorcanaCard(card);
          addLorcanaCard(card);
          setNewToCollectionCards(prev => new Set(prev).add(card.Unique_ID));
        } else {
          setMultiCards(found.cards as LorcanaDbCard[]);
          setMultiModalVisible(true);
          setIsScanningPaused(true);
        }
      } else {
        const card = found.card as LorcanaDbCard;
        await CollectionService.addLorcanaCard(card);
        addLorcanaCard(card);
        setNewToCollectionCards(prev => new Set(prev).add(card.Unique_ID));
      }
    } catch (err) {
      console.error('[PriceLookup] OCR processing error', err);
      showScanFeedback('Scan failed');
    } finally {
      isVerifyingRef.current = false;
      setIsVerifying(false);
    }
  };

  const hasCards = lorcanaScannedCards.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <LinearGradient colors={['#0D0D1A', '#1A1A2E']} style={styles.header}>
        {/* Top row: title + history */}
        <View style={styles.headerTopRow}>
          <Text style={styles.screenTitle}>Price Lookup</Text>
          <TouchableOpacity onPress={() => setReviewVisible(true)} style={styles.historyBtn} activeOpacity={0.8}>
            <Icon name="history" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={styles.historyBtnText}>History</Text>
          </TouchableOpacity>
        </View>

        {/* Session total */}
        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>SESSION TOTAL</Text>
          <Text style={styles.totalValue}>${totalPrice.toFixed(2)}</Text>
          {hasCards && (
            <Text style={styles.totalSub}>{lorcanaScannedCards.length} card{lorcanaScannedCards.length !== 1 ? 's' : ''}</Text>
          )}
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <Icon name="magnify" size={20} color="rgba(255,255,255,0.45)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Lorcana cards…"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {isLoading ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
          ) : search.trim().length > 0 ? (
            <TouchableOpacity onPress={handleSearch} style={styles.searchGoBtn} activeOpacity={0.8}>
              <Icon name="arrow-right" size={16} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>

      {/* ── Card list or empty state ── */}
      {hasCards ? (
        <UnifiedScannedList
          scannedCards={lorcanaScannedCards}
          lorcanaScannedCards={lorcanaScannedCards}
          onRemoveCard={removeCard}
          onSelectCard={() => {}}
          isPriceLoading={false}
          onToggleFoil={toggleFoil}
          newToCollectionCards={newToCollectionCards}
        />
      ) : (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconRing, { borderColor: theme.border }]}>
            <Icon name="camera-outline" size={48} color={theme.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No cards yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Scan a card with your camera or search by name above
          </Text>
        </View>
      )}

      {/* ── Bottom controls ── */}
      <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        {/* Clear button — only when cards exist */}
        {hasCards ? (
          <TouchableOpacity
            style={[styles.clearBtn, { borderColor: theme.error || '#E74C3C' }]}
            onPress={clearScans}
            activeOpacity={0.8}
          >
            <Icon name="delete-outline" size={18} color={theme.error || '#E74C3C'} />
            <Text style={[styles.clearBtnText, { color: theme.error || '#E74C3C' }]}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.bottomSpacer} />
        )}

        {/* Camera scan FAB */}
        <TouchableOpacity
          style={styles.scanFab}
          onPress={() => { setCameraModalShown(false); setCameraActive(true); }}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#6C63FF', '#3D35CC']} style={styles.scanFabGradient}>
            <Icon name="camera" size={20} color="#fff" />
            <Text style={styles.scanFabText}>SCAN CARDS</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </View>

      {/* ── Camera modal ── */}
      <Modal
        visible={cameraActive}
        animationType="slide"
        hardwareAccelerated
        statusBarTranslucent
        onShow={() => setCameraModalShown(true)}
        onRequestClose={() => { setCameraModalShown(false); setCameraActive(false); }}
      >
        <View style={{ flex: 1 }}>
          <ScanHeaderInfo
            isLorcanaScan
            isVerifying={isVerifying}
            scannedCardsCount={lorcanaScannedCards.length}
            totalPrice={totalPrice}
          />
          <SetSelector selectedSet={selectedSet} onSetSelected={setSelectedSet} />
          {cameraModalShown ? (
            <CardScanner
              onScan={handleOcrScan}
              onError={e => console.error(e)}
              isLorcanaScan
              scannedCards={lorcanaScannedCards}
              totalPrice={totalPrice}
              onRemoveCard={id => removeCard(id, 'Lorcana')}
              onToggleFoil={toggleFoil}
              onIncrementCard={incrementCard}
              onDecrementCard={decrementCard}
              isPaused={isScanningPaused || isVerifying}
              cardVariations={[]}
              onVariationSelect={() => {}}
              selectedVariation={null}
              onConfirmVariation={() => {}}
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: '#000' }} />
          )}

          {isVerifying && (
            <View style={styles.verifyingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.verifyingText}>Verifying card…</Text>
            </View>
          )}

          <ZoomControls />
          <View style={{ position: 'absolute', right: 20, bottom: 80 }}>
            <CameraControls
              isScanningPaused={isScanningPaused}
              onPausePress={() => setIsScanningPaused(p => !p)}
              onClosePress={() => { setCameraModalShown(false); setCameraActive(false); }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Lorcana multi-match modal ── */}
      <LorcanaCardSelectionModal
        visible={multiModalVisible}
        onClose={() => { setMultiModalVisible(false); setIsScanningPaused(false); }}
        cards={multiCards}
        onSelect={async (card: LorcanaDbCard) => {
          await CollectionService.addLorcanaCard(card);
          addLorcanaCard(card);
          setNewToCollectionCards(prev => new Set(prev).add(card.Unique_ID));
          setMultiModalVisible(false);
          setIsScanningPaused(false);
        }}
      />

      <RecentScansReview
        visible={reviewVisible}
        lorcanaScannedCards={lorcanaScannedCards}
        onIncrement={incrementCard}
        onDecrement={decrementCard}
        onRemove={id => removeCard(id, 'Lorcana')}
        onClose={() => setReviewVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { paddingTop: 52, paddingBottom: 16, paddingHorizontal: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  screenTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  historyBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },

  // Total display
  totalBlock: { alignItems: 'center', marginBottom: 20 },
  totalLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  totalValue: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  totalSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },

  // Search bar
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 14, height: 46, gap: 10 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  searchGoBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIconRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Bottom bar
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  bottomSpacer: { width: 80 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, width: 80, justifyContent: 'center' },
  clearBtnText: { fontSize: 13, fontWeight: '600' },
  scanFab: { borderRadius: 28, overflow: 'hidden', elevation: 6, shadowColor: '#6C63FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10 },
  scanFabGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14 },
  scanFabText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  // Camera overlays
  verifyingOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  verifyingText: { marginTop: 10, fontSize: 16, color: '#fff', fontWeight: '600' },
});

export default PriceLookupScreenRefactored;
