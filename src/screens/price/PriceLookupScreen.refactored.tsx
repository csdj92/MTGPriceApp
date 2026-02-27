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
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import type { Theme } from '../../context/ThemeContext';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';

import { useLorcanaScanHistory } from '../../hooks/useLorcanaScanHistory';
import UnifiedScannedList from '../../components/price-lookup/UnifiedScannedList';
import { searchLorcanaCards } from '../../services/LorcanaService';
import SortHeader from '../../components/shared/SortHeader';
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
  const styles = useStyles();
  /* ----------------------- scan-history state ---------------------- */
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

  /* --------------------------- search UI --------------------------- */
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  /* ------------------------- camera / OCR ------------------------- */
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraModalShown, setCameraModalShown] = useState(false);
  // multiple Lorcana matches modal
  const [multiModalVisible, setMultiModalVisible] = useState(false);
  const [multiCards, setMultiCards] = useState<LorcanaDbCard[]>([]);
  // Lorcana set filter (for camera scanning)
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [setFilterLoaded, setSetFilterLoaded] = useState(false);
  // pause/verification state
  const [isScanningPaused, setIsScanningPaused] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const isVerifyingRef = useRef(false);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [newToCollectionCards, setNewToCollectionCards] = useState<Set<string>>(new Set());

  const showScanFeedback = (message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert('Scanner', message);
  };

  // Back handler to close camera on hardware back press
  useEffect(() => {
    if (!cameraActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cameraActive) {
        setCameraModalShown(false);
        setCameraActive(false);
        return true; // handled
      }
      return false;
    });
    return () => sub.remove();
  }, [cameraActive]);

  useEffect(() => {
    if (!cameraActive) {
      setCameraModalShown(false);
    }
  }, [cameraActive]);

  useEffect(() => {
    let mounted = true;
    const loadSelectedSet = async () => {
      try {
        const savedSet = await AsyncStorage.getItem(LORCANA_SET_FILTER_KEY);
        if (!mounted) return;
        setSelectedSet(savedSet || null);
      } catch (error) {
        console.error('[PriceLookup] Failed to load set filter', error);
      } finally {
        if (mounted) setSetFilterLoaded(true);
      }
    };
    loadSelectedSet();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!setFilterLoaded) return;

    const saveSelectedSet = async () => {
      try {
        if (selectedSet) {
          await AsyncStorage.setItem(LORCANA_SET_FILTER_KEY, selectedSet);
        } else {
          await AsyncStorage.removeItem(LORCANA_SET_FILTER_KEY);
        }
      } catch (error) {
        console.error('[PriceLookup] Failed to persist set filter', error);
      }
    };
    saveSelectedSet();
  }, [selectedSet, setFilterLoaded]);

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) return;
    Keyboard.dismiss();
    setIsLoading(true);
    try {
      const results = await searchLorcanaCards(q);
      results.forEach((c) => addLorcanaCard(c));
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
      const mainName = result.isLorcana
        ? OcrService.preprocessText(result.mainName ?? '')
        : preprocessed;

      if (!mainName) return;

      const duplicateKey = result.cardNumber
        ? `${result.cardNumber}-${result.setNumber ?? selectedSet ?? ''}`
        : mainName.toLowerCase().trim();
      if (OcrService.checkDuplicate(duplicateKey)) return;

      isVerifyingRef.current = true;
      setIsVerifying(true);

      const found = await CardSearchService.findLorcanaCard(
        mainName,
        result.subtype,
        selectedSet,
        result.cardNumber,
        result.setNumber,
      );
      if (!found) {
        showScanFeedback('Card not recognised');
        return;
      }

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

  /* ---------------------------- render ----------------------------- */
  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <Text style={styles.title}>Price Lookup</Text>
        <TouchableOpacity onPress={() => setReviewVisible(true)} style={styles.recentBtn}>
          <Icon name="history" size={20} color={theme.primary} />
          <Text style={styles.recentBtnText}>Recent Scans</Text>
        </TouchableOpacity>
        <View style={styles.priceChip}>
          <Icon name="currency-usd" size={18} color="#fff" />
          <Text style={styles.priceText}>{totalPrice.toFixed(2)}</Text>
        </View>
      </View>

      {/* search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={'Search Lorcana…'}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Icon name="magnify" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* sort header placeholder */}
      <SortHeader sortBy={'name'} sortDirection={'asc'} onSortChange={() => {}} onFilterPress={() => {}} />

      {/* list or loader */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} size="large" />
      ) : (
        <UnifiedScannedList
          scannedCards={lorcanaScannedCards}
          lorcanaScannedCards={lorcanaScannedCards}
          onRemoveCard={removeCard}
          onSelectCard={() => {}}
          isPriceLoading={false}
          onToggleFoil={toggleFoil}
          newToCollectionCards={newToCollectionCards}
        />
      )}

      {/* camera FAB */}
      <TouchableOpacity
        style={styles.cameraFab}
        onPress={() => {
          setCameraModalShown(false);
          setCameraActive(true);
        }}
      >
        <Icon name="camera" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={cameraActive}
        animationType="slide"
        hardwareAccelerated
        statusBarTranslucent
        onShow={() => setCameraModalShown(true)}
        onRequestClose={() => {
          setCameraModalShown(false);
          setCameraActive(false);
        }}
      >
        <View style={{ flex: 1 }}>
          {/* Header info + set selector */}
          <ScanHeaderInfo
            isLorcanaScan={true}
            isVerifying={isVerifying}
            scannedCardsCount={lorcanaScannedCards.length}
            totalPrice={totalPrice}
          />
          <SetSelector selectedSet={selectedSet} onSetSelected={setSelectedSet} />
          {cameraModalShown ? (
            <CardScanner
              onScan={handleOcrScan}
              onError={(e) => console.error(e)}
              isLorcanaScan={true}
              scannedCards={lorcanaScannedCards}
              totalPrice={totalPrice}
              onRemoveCard={(id) => removeCard(id, 'Lorcana')}
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

          {/* Zoom controls on left */}
          <ZoomControls />

          {/* Pause / Close controls on right */}
          <View style={{ position: 'absolute', right: 20, bottom: 80 }}>
            <CameraControls
              isScanningPaused={isScanningPaused}
              onPausePress={() => setIsScanningPaused((p) => !p)}
              onClosePress={() => {
                setCameraModalShown(false);
                setCameraActive(false);
              }}
            />
          </View>
        </View>
      </Modal>

      {/* clear */}
      {lorcanaScannedCards.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={clearScans}>
          <Icon name="delete" size={20} color="#fff" />
          <Text style={styles.clearText}>Clear Scans</Text>
        </TouchableOpacity>
      )}

      {/* Lorcana multiple match modal */}
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
        onRemove={(id)=>removeCard(id,'Lorcana')}
        onClose={()=>setReviewVisible(false)}
      />
    </View>
  );
};

export default PriceLookupScreenRefactored;

const useStyles = () =>
  useThemedStyles((theme: Theme) => ({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      padding: 16,
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    title: { fontSize: 22, fontWeight: 'bold' as const, color: theme.text },
    priceChip: {
      flexDirection: 'row' as const,
      backgroundColor: theme.success,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      alignItems: 'center' as const,
    },
    priceText: { color: '#fff', marginLeft: 4, fontWeight: 'bold' as const },
    searchRow: {
      flexDirection: 'row' as const,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    searchInput: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 40,
      color: theme.text,
    },
    searchBtn: {
      backgroundColor: theme.primary,
      marginLeft: 8,
      borderRadius: 8,
      width: 40,
      height: 40,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    recentBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginLeft: 12,
    },
    recentBtnText: {
      marginLeft: 4,
      color: theme.primary,
      fontSize: 14,
    },
    clearBtn: {
      position: 'absolute' as const,
      bottom: 32,
      right: 32,
      flexDirection: 'row' as const,
      backgroundColor: theme.error,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 24,
      alignItems: 'center' as const,
    },
    clearText: { color: '#fff', marginLeft: 6, fontWeight: '600' as const },
    cameraFab: {
      position: 'absolute' as const,
      bottom: 100,
      right: 32,
      backgroundColor: theme.primary,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      elevation: 4,
    },
    verifyingOverlay: {
      position: 'absolute' as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.35)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 20,
    },
    verifyingText: {
      marginTop: 10,
      fontSize: 16,
      color: '#fff',
      fontWeight: '600' as const,
    },
  })); 
