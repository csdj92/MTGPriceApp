import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Modal,
  BackHandler,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
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
import { CardProcessingService, ProcessedOcrResult } from '../../services/CardProcessingService';
import type { OcrResult, ExtendedCard } from '../../types/card';
import { LorcanaCard as LorcanaDbCard } from '../../types/lorcana';
import LorcanaCardSelectionModal from '../../components/LorcanaCardSelectionModal';
import SetSelector from '../../components/price-lookup/SetSelector';
import CameraControls from '../../components/price-lookup/CameraControls';
import ZoomControls from '../../components/price-lookup/ZoomControls';
import ScanHeaderInfo from '../../components/price-lookup/ScanHeaderInfo';
import RecentScansReview from '../../components/price-lookup/RecentScansReview';

const Icon = MaterialCommunityIcons as any;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PriceLookup'>;
};

const PriceLookupScreenRefactored: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const styles = useStyles();
  /* ----------------------- scan-history state ---------------------- */
  const {
    scannedCards,
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
  // multiple Lorcana matches modal
  const [multiModalVisible, setMultiModalVisible] = useState(false);
  const [multiCards, setMultiCards] = useState<LorcanaDbCard[]>([]);
  // Lorcana set filter (for camera scanning)
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  // pause/verification state
  const [isScanningPaused, setIsScanningPaused] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<any>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [newToCollectionCards, setNewToCollectionCards] = useState<Set<string>>(new Set());

  /* subscribe to verification status */
  useEffect(() => {
    const emitter = CardProcessingService.getVerificationEmitter();
    const listener = (status: any) => setVerificationStatus(status);
    emitter.on('CardVerificationUpdate', listener);
    return () => emitter.removeListener('CardVerificationUpdate', listener);
  }, []);

  // Back handler to close camera on hardware back press
  useEffect(() => {
    if (!cameraActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cameraActive) {
        setCameraActive(false);
        return true; // handled
      }
      return false;
    });
    return () => sub.remove();
  }, [cameraActive]);

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
    try {
      const processed: ProcessedOcrResult | null = await CardProcessingService.processOcrResult(result, selectedSet);
      if (!processed) return;

      if ('multipleCards' in processed) {
        if (processed.multipleCards.length === 1) {
          const card = processed.multipleCards[0] as LorcanaDbCard;
          addLorcanaCard(card);
          setNewToCollectionCards((prev)=> new Set(prev).add(card.Unique_ID));
        } else if (processed.multipleCards.length > 1) {
          // Show selection modal to user
          setMultiCards(processed.multipleCards as LorcanaDbCard[]);
          setMultiModalVisible(true);
        }
      } else {
        const sc = processed; // ScannedCard
        if (sc.type === 'Lorcana' && sc.card) {
          const lcard = sc.card as unknown as LorcanaDbCard;
          addLorcanaCard(lcard);
          setNewToCollectionCards((prev)=> new Set(prev).add(lcard.Unique_ID));
        }
      }
    } catch (err) {
      console.error('[PriceLookup] OCR processing error', err);
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
          scannedCards={scannedCards}
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
        onPress={() => setCameraActive(true)}
      >
        <Icon name="camera" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={cameraActive}
        animationType="slide"
        onRequestClose={() => setCameraActive(false)}
      >
        {(() => {
          // Build recent cards list (last 20) for CardScanner widget
          const recentMtg: ExtendedCard[] = scannedCards.slice(0, 20) as unknown as ExtendedCard[];
          const recentLorcana: ExtendedCard[] = lorcanaScannedCards.slice(0, 20).map(lc => ({
            id: lc.id,
            name: lc.name,
            setCode: lc.setCode,
            setName: lc.setCode,
            collectorNumber: '',
            type: 'Lorcana',
            rarity: (lc as any).rarity ?? (lc.card as any)?.Rarity ?? 'Common',
            imageUrl: lc.imageUrl,
            imageUris: { normal: lc.imageUrl },
            prices: {},
            purchaseUrls: {},
            legalities: {},
            hasFoil: true,
            hasNonFoil: true,
            colorIdentity: [],
            keywords: [],
            cmc: 0,
            frameEffects: [],
          } as unknown as ExtendedCard));
          const recentCombined = [...recentLorcana, ...recentMtg];
          return (
            <View style={{ flex: 1 }}>
              {/* Header info + set selector */}
              <ScanHeaderInfo
                isLorcanaScan={true}
                verificationStatus={verificationStatus}
                scannedCardsCount={lorcanaScannedCards.length + scannedCards.length}
                totalPrice={totalPrice}
              />
              <SetSelector selectedSet={selectedSet} onSetSelected={setSelectedSet} />
              <CardScanner
                onScan={handleOcrScan}
                onError={(e) => console.error(e)}
                isLorcanaScan={true}
                scannedCards={recentCombined}
                totalPrice={totalPrice}
                onCardPress={() => {}}
                isPaused={isScanningPaused}
                cardVariations={[]}
                onVariationSelect={() => {}}
                selectedVariation={null}
                onConfirmVariation={() => {}}
              />

              {/* Zoom controls on left */}
              <ZoomControls />

              {/* Pause / Close controls on right */}
              <View style={{ position: 'absolute', right: 20, bottom: 80 }}>
                <CameraControls
                  isScanningPaused={isScanningPaused}
                  onPausePress={() => setIsScanningPaused((p) => !p)}
                  onClosePress={() => setCameraActive(false)}
                />
              </View>
            </View>
          );
        })()}
      </Modal>

      {/* clear */}
      {(scannedCards.length > 0 || lorcanaScannedCards.length > 0) && (
        <TouchableOpacity style={styles.clearBtn} onPress={clearScans}>
          <Icon name="delete" size={20} color="#fff" />
          <Text style={styles.clearText}>Clear Scans</Text>
        </TouchableOpacity>
      )}

      {/* Lorcana multiple match modal */}
      <LorcanaCardSelectionModal
        visible={multiModalVisible}
        onClose={() => setMultiModalVisible(false)}
        cards={multiCards}
        onSelect={(card: LorcanaDbCard) => {
          addLorcanaCard(card);
          setMultiModalVisible(false);
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
  })); 