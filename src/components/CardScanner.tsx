import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  PermissionsAndroid,
  Platform,
  ToastAndroid,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
} from 'react-native';
import LiveOcrPreviewWithOverlay from './LiveOcrPreview';
import type { OcrResult } from '../types/card';
import type { LorcanaCard } from '../types/lorcana';
import type { LiveOcrFrameEvent, NormalizedRect } from '../types/NativeModules';
import { CameraService } from '../services/CameraService';
import { Logger } from '../utils/logger';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { handleImageLoadError, handleImageLoadSuccess, getLorcanaImageUrl } from '../utils/imageUtils';
import FastImage from '@d11/react-native-fast-image';

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

type TrackingState = 'none' | 'searching' | 'locked';

export type CardScannerProps = {
  onScan: (result: OcrResult) => Promise<void>;
  onError: (error: Error) => void;
  isLorcanaScan: boolean;
  scannedCards: any[];
  totalPrice: number;
  onCardPress?: (card: any) => void;
  onRemoveCard?: (id: string) => void;
  onToggleFoil?: (id: string) => void;
  onIncrementCard?: (id: string) => void;
  onDecrementCard?: (id: string) => void;
  isPaused: boolean;
  cardVariations: LorcanaCard[];
  onVariationSelect: (card: LorcanaCard) => void;
  selectedVariation: LorcanaCard | null;
  onConfirmVariation: (isFoil: boolean) => void;
};

const CardScanner: React.FC<CardScannerProps> = ({
  onScan,
  onError,
  isLorcanaScan,
  scannedCards,
  totalPrice,
  onCardPress,
  onRemoveCard,
  onToggleFoil,
  onIncrementCard,
  onDecrementCard,
  isPaused,
  cardVariations,
  onVariationSelect,
  selectedVariation,
  onConfirmVariation
}) => {
  const [hasPermission, setHasPermission] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [selectedCard, setSelectedCard] = useState<LorcanaCard | null>(null);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [isRecentCardsCollapsed, setIsRecentCardsCollapsed] = useState(false);
  const [showingVariations, setShowingVariations] = useState(false);
  const [isFoilSelected, setIsFoilSelected] = useState(false);
  const [trackedCardRect, setTrackedCardRect] = useState<NormalizedRect | null>(null);
  const [trackingState, setTrackingState] = useState<TrackingState>('none');
  const [trackingConfidence, setTrackingConfidence] = useState(0);
  const effectivePaused = isPaused || cardModalVisible;
  const isPausedRef = useRef(isPaused);
  const onScanRef = useRef(onScan);
  const isLorcanaScanRef = useRef(isLorcanaScan);
  const previewLayoutRef = useRef({ width: 0, height: 0 });

  const sanitizeNormalizedRect = (rect: Partial<NormalizedRect> | null | undefined): NormalizedRect | null => {
    if (
      !rect ||
      typeof rect.x !== 'number' ||
      typeof rect.y !== 'number' ||
      typeof rect.w !== 'number' ||
      typeof rect.h !== 'number'
    ) {
      return null;
    }

    const x = Math.max(0, Math.min(1, rect.x));
    const y = Math.max(0, Math.min(1, rect.y));
    const w = Math.max(0, Math.min(1 - x, rect.w));
    const h = Math.max(0, Math.min(1 - y, rect.h));
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  };

  const mapRectThroughPreviewCenterCrop = (
    rect: Partial<NormalizedRect> | null | undefined,
    frameWidth: number,
    frameHeight: number
  ): NormalizedRect | null => {
    const sanitized = sanitizeNormalizedRect(rect);
    if (!sanitized) return null;

    const layout = previewLayoutRef.current;
    if (
      layout.width <= 0 ||
      layout.height <= 0 ||
      !Number.isFinite(frameWidth) ||
      !Number.isFinite(frameHeight) ||
      frameWidth <= 0 ||
      frameHeight <= 0
    ) {
      return sanitized;
    }

    // Camera preview uses center-crop (FILL_CENTER); map sensor-normalized boxes into the cropped viewport.
    const sourceWidth = Math.min(frameWidth, frameHeight);
    const sourceHeight = Math.max(frameWidth, frameHeight);
    const scale = Math.max(layout.width / sourceWidth, layout.height / sourceHeight);
    const scaledWidth = sourceWidth * scale;
    const scaledHeight = sourceHeight * scale;
    const offsetX = (scaledWidth - layout.width) / 2;
    const offsetY = (scaledHeight - layout.height) / 2;

    return sanitizeNormalizedRect({
      x: ((sanitized.x * scaledWidth) - offsetX) / layout.width,
      y: ((sanitized.y * scaledHeight) - offsetY) / layout.height,
      w: (sanitized.w * scaledWidth) / layout.width,
      h: (sanitized.h * scaledHeight) / layout.height,
    });
  };

  const isVisuallyReliableLock = (rect: NormalizedRect | null, confidence: number): boolean => {
    if (!rect || confidence < 0.72) return false;
    const area = rect.w * rect.h;
    return rect.w >= 0.30 && rect.h >= 0.45 && area >= 0.14;
  };

  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    previewLayoutRef.current = { width, height };
  }, []);

  useEffect(() => {
    isPausedRef.current = effectivePaused;
  }, [effectivePaused]);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    isLorcanaScanRef.current = isLorcanaScan;
  }, [isLorcanaScan]);

  useEffect(() => {
    checkPermission();

    const subscription = CameraService.addOcrListener((event: any) => {
      if (!isPausedRef.current) {
        if (event.text) {
          handleTextDetected(event);
        }
      }
    });

    const sizeSubscription = CameraService.addPreviewSizeListener((event: any) => {
      // Kept for native->JS synchronization; guide alignment uses frame telemetry + layout.
    });

    const frameSubscription = CameraService.addOcrFrameListener((event: LiveOcrFrameEvent) => {
      if (!event || isPausedRef.current) return;

      const nextState: TrackingState =
        event.state === 'locked' || event.state === 'searching' ? event.state : 'none';
      const nextRect = mapRectThroughPreviewCenterCrop(event.candidateBox, event.frameWidth, event.frameHeight);
      const nextConfidence =
        typeof event.confidence === 'number' ? Math.max(0, Math.min(1, event.confidence)) : 0;
      const downgradedState: TrackingState =
        nextState === 'locked' && !isVisuallyReliableLock(nextRect, nextConfidence)
          ? 'searching'
          : nextState;

      setTrackingState(downgradedState);
      setTrackingConfidence(nextConfidence);
      setTrackedCardRect(downgradedState === 'none' ? null : nextRect);
    });

    return () => {
      subscription?.remove();
      sizeSubscription?.remove();
      frameSubscription?.remove();
      setIsActive(false);
      stopSession().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    CameraService.setLorcanaScanMode(isLorcanaScan).catch((error) => {
      Logger.error('Failed to set Lorcana scan mode:', error);
    });
  }, [isLorcanaScan]);

  // Add useEffect to handle pause state changes
  useEffect(() => {
    const handlePauseStateChange = async () => {
      if (effectivePaused) {
        // If we're paused and active, temporarily stop processing
        if (isActive) {
          try {
            await CameraService.pauseProcessing();
          } catch (error) {
            Logger.error('Failed to pause processing:', error);
            showErrorToast('Failed to pause camera');
          }
        }
      } else if (isActive) {
        // If we're no longer paused and still active, resume processing
        try {
          await CameraService.resumeProcessing();
        } catch (error) {
          Logger.error('Failed to resume processing:', error);
          showErrorToast('Failed to resume camera');
        }
      }
  };

    handlePauseStateChange();
  }, [effectivePaused, isActive]);

  // Handle card press - either use the passed handler or show our own modal
  const handleCardPress = useCallback((card: LorcanaCard) => {
    Logger.debug(`Card pressed: ${card.Name || card.name}`);

    // If parent component provided a handler, use it
    if (onCardPress) {
      onCardPress(card);
    } else {
      // Otherwise show our own modal
      setSelectedCard(card);
      setCardModalVisible(true);
    }
  }, [onCardPress]);

  // Close the card detail modal
  const closeCardModal = useCallback(() => {
    setCardModalVisible(false);
    setTimeout(() => setSelectedCard(null), 300); // Clear after animation
  }, []);

  const getCardActionId = useCallback((card: any): string | null => {
    const rawId =
      card?.id ??
      card?.Unique_ID ??
      card?.uuid ??
      card?.card?.uuid ??
      card?.card?.Unique_ID;
    if (typeof rawId !== 'string') return null;
    const trimmed = rawId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, []);

  useEffect(() => {
    if (!cardModalVisible || !selectedCard) return;
    const selectedId = getCardActionId(selectedCard);
    if (!selectedId) return;

    const latest = scannedCards?.find((item) => getCardActionId(item) === selectedId);
    if (latest && latest !== selectedCard) {
      setSelectedCard(latest);
    } else if (!latest) {
      closeCardModal();
    }
  }, [cardModalVisible, selectedCard, scannedCards, getCardActionId, closeCardModal]);

  // Toggle recent cards collapsed state
  const toggleRecentCardsCollapse = useCallback(() => {
    // Only collapse if we have variations to show
    if (cardVariations?.length > 0) {
      setIsRecentCardsCollapsed(!isRecentCardsCollapsed);
      setShowingVariations(!showingVariations);
    }
  }, [isRecentCardsCollapsed, cardVariations, showingVariations]);

  useEffect(() => {
    // Show variations if they are available
    if (cardVariations?.length > 0) {
      setIsRecentCardsCollapsed(true);
      setShowingVariations(true);
    } else {
      setIsRecentCardsCollapsed(false);
      setShowingVariations(false);
    }
  }, [cardVariations]);

  // Render the counter bubble with most recent card
  const renderScannedCardsWidget = useCallback(() => {
    // Always render the container if we have variations to show, even if no scanned cards yet
    if ((!scannedCards || scannedCards.length === 0) && !cardVariations?.length) {
      return null;
    }

    // We'll show at most the 3 most recent cards
    const recentCards = scannedCards?.slice(0, 3) || [];
    
    return (
      <>
        {/* Stats bubble - top right - only show if there are scanned cards */}
        {scannedCards && scannedCards.length > 0 && (
          <View style={styles.statsBubbleContainer}>
            <View style={styles.statsBubble}>
              <Text style={styles.statsCountText}>
                {scannedCards.length}
              </Text>
              <Text style={styles.statsPriceText}>
                ${totalPrice.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Bottom container for either recent cards or variations */}
        <View style={styles.bottomContainer}>
          {/* Header section with toggle ability */}
          <TouchableOpacity 
            style={styles.recentCardsHeader} 
            onPress={toggleRecentCardsCollapse}
            disabled={!cardVariations || cardVariations.length === 0}
          >
            <Text style={styles.recentCardsHeaderText}>
              {showingVariations ? 'Select Version' : 'Recently Scanned'}
            </Text>
            {!showingVariations && scannedCards && scannedCards.length > 3 && (
              <Text style={styles.seeMoreText}>
                +{scannedCards.length - 3} more
              </Text>
            )}
            {cardVariations?.length > 0 && (
              <Icon 
                name={isRecentCardsCollapsed ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color="#fff" 
                style={styles.collapseIcon}
              />
            )}
          </TouchableOpacity>
          
          {/* Recently scanned cards content */}
          {!isRecentCardsCollapsed && scannedCards && scannedCards.length > 0 && (
            <ScrollView contentContainerStyle={styles.cardsStrip}>
              {recentCards.map((card, index) => {
                // Get appropriate image URI using our helper function
                const imageUri = getLorcanaImageUrl(card);
                
               
                  
                return (
                  <TouchableOpacity
                    key={`${card.id || card.name}-${index}`}
                    style={styles.cardPreviewContainer}
                    onPress={() => handleCardPress(card)}
                    activeOpacity={0.7}
                  >
                    <CardImage 
                      uri={imageUri} 
                      name={card.name}
                      previewMode={true}
                    />
                    {card.isFoil && (
                      <View style={styles.foilBadgeSmall}>
                        <Icon name="star" size={12} color="#FFD700" />
                      </View>
                    )}
                    
                    <View style={styles.cardPreviewInfo}>
                      <Text style={styles.cardPreviewName} numberOfLines={1}>
                        {card.Name || card.name}
                      </Text>
                      <Text style={styles.cardPreviewPrice}>
                        ${card.price_usd ? parseFloat(card.price_usd.toString()).toFixed(2) : (card.prices?.usd ? parseFloat(card.prices.usd).toFixed(2) : '0.00')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Variations selection */}
          {showingVariations && cardVariations?.length > 0 && (
            <View style={styles.variationsContainer}>
              <View style={styles.variationsListContainer}>
                <FlatList
                  data={cardVariations}
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  keyExtractor={(item, index) => `variation-${item.id || item.name}-${index}`}
                  renderItem={({ item }) => {
                    const isSelected = selectedVariation?.Unique_ID === item.Unique_ID;
                    const isOriginalScan = item.isOriginalScan;

                    // Get appropriate image URI
                    const imageUri = getLorcanaImageUrl(item);
                    
                    return (
                      <TouchableOpacity
                        style={[
                          styles.variationItem,
                          isSelected && styles.selectedVariation,
                          isOriginalScan && styles.originalScanVariation
                        ]}
                        onPress={() => onVariationSelect && onVariationSelect(item)}
                      >
                        <View style={styles.variationImageWrapper}>
                          <CardImage
                            uri={imageUri}
                            name={item.name}
                            previewMode={false}
                          />
                          {isOriginalScan && (
                            <View style={styles.originalScanBadge}>
                              <Text style={styles.originalScanText}>Scan</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.variationDetails}>
                          <Text style={styles.variationSetName} numberOfLines={1}>
                            {item.Set_Name || item.set_name || 'Unknown Set'}
                          </Text>
                          <Text style={styles.variationPrice}>
                            ${item.price_usd ? parseFloat(item.price_usd.toString()).toFixed(2) : (item.prices?.usd ? parseFloat(item.prices.usd).toFixed(2) : '0.00')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  style={styles.variationsList}
                />
              </View>
              
              {/* Foil toggle */}
              {selectedVariation?.hasFoil && (
                <TouchableOpacity
                  style={[styles.foilToggle, isFoilSelected && styles.foilToggleActive]}
                  onPress={() => setIsFoilSelected(!isFoilSelected)}
                >
                  <Icon
                    name={isFoilSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={20}
                    color={isFoilSelected ? '#FFD700' : '#fff'}
                  />
                  <Text style={styles.foilToggleText}>Foil</Text>
                </TouchableOpacity>
              )}

              {/* Confirm button */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={[
                    styles.confirmButton,
                    !selectedVariation && styles.confirmButtonDisabled
                  ]} 
                  onPress={() => {
                    if (onConfirmVariation && selectedVariation) {
                      onConfirmVariation(isFoilSelected);
                    }
                  }}
                  disabled={!selectedVariation}
                >
                  <Text style={styles.confirmButtonText}>
                    {selectedVariation ? 'Confirm Selection' : 'Select a Card Version'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </>
    );
  }, [
    scannedCards, 
    totalPrice, 
    handleCardPress, 
    isRecentCardsCollapsed, 
    showingVariations, 
    cardVariations, 
    selectedVariation, 
    onVariationSelect, 
    onConfirmVariation,
    toggleRecentCardsCollapse,
    isFoilSelected
  ]);

  // Helper component for card images with error handling
  const CardImage = useCallback(({ uri, name, previewMode = false }: { uri: string | null, name?: string, previewMode?: boolean }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    // Check if URI is valid before attempting to load
    const isValidUri = uri && 
      (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://'));
    
    useEffect(() => {
      // Log URI for debugging in development
      if (__DEV__) {
        console.log(`[CardImage] ${(name || 'Unknown')} image URI: ${uri || 'none'} (valid: ${Boolean(isValidUri)})`);
      }
    }, [uri, name, isValidUri]);
    
    const handleLoad = () => {
      setIsLoading(false);
      if (__DEV__) {
        console.log(`[CardImage] Successfully loaded image for ${name || 'Unknown'}`);
      }
      // Record successful load in our tracking system
      if (uri) {
        handleImageLoadSuccess(uri, { name: name || 'Unknown' });
      }
    };
    
    const handleError = (e: any) => {
      setHasError(true);
      setIsLoading(false);
      console.error(`[CardImage] Error loading image for ${name || 'Unknown'}:`, e);
      if (uri) {
        handleImageLoadError(uri, name || 'Unknown');
      }
    };
    
    // Default height and width for the image container
    const containerStyle = previewMode
      ? styles.imagePreviewContainer
      : styles.imageFullContainer;
        
    const imageStyle = previewMode
      ? styles.imagePreview
      : styles.imageFull;
      
    return (
      <View style={containerStyle}>
        {isValidUri ? (
          <>
            <FastImage
              source={{ uri, priority: FastImage.priority.high }}
              style={imageStyle}
              resizeMode={previewMode ? FastImage.resizeMode.cover : FastImage.resizeMode.contain}
              onLoad={handleLoad}
              onError={() => handleError('Image loading error')}
            />
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </>
        ) : (
          <View style={[imageStyle, styles.placeholderContainer]}>
            <Icon name="image-off" size={24} color="#777" />
            <Text style={styles.placeholderText}>{name || 'Unknown'}</Text>
          </View>
        )}
      </View>
    );
  }, []);

  // Render the card detail modal
  const renderCardDetailModal = useCallback(() => {
    if (!selectedCard) return null;

    // Get the appropriate image URL with our helper function
    const imageUrl = getLorcanaImageUrl(selectedCard);
    const cardActionId = getCardActionId(selectedCard);
    const normalCount = Number.isFinite(Number((selectedCard as any).normalCount))
      ? Math.max(0, Math.trunc(Number((selectedCard as any).normalCount)))
      : 0;
    const foilCount = Number.isFinite(Number((selectedCard as any).foilCount))
      ? Math.max(0, Math.trunc(Number((selectedCard as any).foilCount)))
      : 0;
    const totalCount = normalCount + foilCount;
    const isFoilActive = Boolean((selectedCard as any).isFoil);
    const setDisplay =
      (selectedCard as any).Set_Name ||
      (selectedCard as any).set_name ||
      (selectedCard as any).setName ||
      (selectedCard as any).Set_ID ||
      (selectedCard as any).set_id ||
      (selectedCard as any).setCode ||
      (selectedCard as any).card?.setCode ||
      'Unknown';
    const setCodeDisplay =
      (selectedCard as any).setCode ||
      (selectedCard as any).Set_ID ||
      (selectedCard as any).set_id ||
      (selectedCard as any).card?.setCode ||
      null;
    const explicitNumber =
      (selectedCard as any).Card_Num ??
      (selectedCard as any).card_num ??
      (selectedCard as any).collectorNumber ??
      (selectedCard as any).card?.cardNumber ??
      null;
    const parsedCollectorFromId =
      explicitNumber == null && cardActionId
        ? cardActionId.match(/-(\d{1,3})$/)?.[1] ?? null
        : null;
    const numberDisplay = explicitNumber ?? parsedCollectorFromId ?? 'Unknown';

    // Log the image URL for debugging
    if (__DEV__) {
      console.log(`[CardScanner] Modal card (${selectedCard.Name || selectedCard.name}): Using image URL: ${imageUrl || 'none'}`);
    }

    return (
      <Modal
        visible={cardModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeCardModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedCard.Name || selectedCard.name}
              </Text>
              <TouchableOpacity onPress={closeCardModal} style={styles.closeButton}>
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.cardImageContainer}>
                <View style={styles.modalCardImageFrame}>
                  <CardImage
                    uri={imageUrl}
                    name={selectedCard.Name || selectedCard.name}
                    previewMode={false}
                  />
                </View>
              </View>

              <View style={styles.cardDetailsSection}>
                <Text style={styles.sectionTitle}>Card Details</Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{selectedCard.Name || selectedCard.name}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Set:</Text>
                  <Text style={styles.detailValue}>
                    {setDisplay}
                    {setCodeDisplay ? ` (${setCodeDisplay})` : ''}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Number:</Text>
                  <Text style={styles.detailValue}>{numberDisplay}</Text>
                </View>

                {(selectedCard.Rarity || selectedCard.rarity) && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Rarity:</Text>
                    <Text style={styles.detailValue}>{selectedCard.Rarity || selectedCard.rarity}</Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Normal Price:</Text>
                  <Text style={[styles.detailValue, styles.priceText]}>
                    ${selectedCard.price_usd ? parseFloat(selectedCard.price_usd.toString()).toFixed(2) : (selectedCard.prices?.usd ? parseFloat(selectedCard.prices.usd).toFixed(2) : 'N/A')}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Foil Price:</Text>
                  <Text style={[styles.detailValue, styles.priceText]}>
                    ${selectedCard.price_usd_foil ? parseFloat(selectedCard.price_usd_foil.toString()).toFixed(2) : (selectedCard.prices?.usd_foil ? parseFloat(selectedCard.prices.usd_foil).toFixed(2) : 'N/A')}
                  </Text>
                </View>

                {totalCount > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Scanned Qty:</Text>
                    <Text style={styles.detailValue}>
                      {totalCount} (Normal {normalCount} / Foil {foilCount})
                    </Text>
                  </View>
                )}

                <View style={styles.modalActionsSection}>
                  <View style={styles.modalActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.modalActionButton,
                        styles.modalActionSecondary,
                        (!cardActionId || !onDecrementCard) && styles.modalActionDisabled,
                      ]}
                      disabled={!cardActionId || !onDecrementCard}
                      onPress={() => {
                        if (cardActionId && onDecrementCard) {
                          onDecrementCard(cardActionId);
                          setSelectedCard((prev: any) => {
                            if (!prev) return prev;
                            const prevNormal = Number(prev.normalCount) || 0;
                            return { ...prev, normalCount: Math.max(0, prevNormal - 1) };
                          });
                        }
                      }}
                    >
                      <Icon name="minus" size={16} color="#fff" />
                      <Text style={styles.modalActionText}>-1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalActionButton,
                        styles.modalActionPrimary,
                        (!cardActionId || !onIncrementCard) && styles.modalActionDisabled,
                      ]}
                      disabled={!cardActionId || !onIncrementCard}
                      onPress={() => {
                        if (cardActionId && onIncrementCard) {
                          onIncrementCard(cardActionId);
                          setSelectedCard((prev: any) => {
                            if (!prev) return prev;
                            const prevNormal = Number(prev.normalCount) || 0;
                            return { ...prev, normalCount: prevNormal + 1 };
                          });
                        }
                      }}
                    >
                      <Icon name="plus" size={16} color="#fff" />
                      <Text style={styles.modalActionText}>+1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalActionButton,
                        isFoilActive ? styles.modalActionFoilActive : styles.modalActionFoil,
                        (!cardActionId || !onToggleFoil) && styles.modalActionDisabled,
                      ]}
                      disabled={!cardActionId || !onToggleFoil}
                      onPress={() => {
                        if (cardActionId && onToggleFoil) {
                          onToggleFoil(cardActionId);
                          setSelectedCard((prev: any) => {
                            if (!prev) return prev;
                            const prevNormal = Number(prev.normalCount) || 0;
                            const prevFoil = Number(prev.foilCount) || 0;
                            const nextIsFoil = !Boolean(prev.isFoil);
                            return {
                              ...prev,
                              isFoil: nextIsFoil,
                              normalCount: nextIsFoil ? Math.max(0, prevNormal - 1) : prevNormal + 1,
                              foilCount: nextIsFoil ? prevFoil + 1 : Math.max(0, prevFoil - 1),
                            };
                          });
                        }
                      }}
                    >
                      <Icon name="star" size={16} color="#fff" />
                      <Text style={styles.modalActionText}>
                        {isFoilActive ? 'Foil On' : 'Foil Off'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.modalActionButton,
                      styles.modalActionDanger,
                      styles.modalActionDangerFull,
                      (!cardActionId || !onRemoveCard) && styles.modalActionDisabled,
                    ]}
                    disabled={!cardActionId || !onRemoveCard}
                    onPress={() => {
                      if (cardActionId && onRemoveCard) {
                        onRemoveCard(cardActionId);
                        closeCardModal();
                      }
                    }}
                  >
                    <Icon name="trash-can-outline" size={16} color="#fff" />
                    <Text style={styles.modalActionText}>Remove Card</Text>
                  </TouchableOpacity>
                  {!cardActionId && (
                    <Text style={styles.modalActionHint}>
                      Actions unavailable: missing card id
                    </Text>
                  )}
                </View>

                {(selectedCard.Body_Text || selectedCard.body_text) && (
                  <View style={styles.cardTextSection}>
                    <Text style={styles.detailLabel}>Card Text:</Text>
                    <Text style={styles.cardText}>{selectedCard.Body_Text || selectedCard.body_text}</Text>
                  </View>
                )}

                {/* Debug section */}
                {__DEV__ && (
                  <View style={styles.debugSection}>
                    <Text style={styles.debugTitle}>Debug Info:</Text>
                    <Text style={styles.debugText}>
                      ID: {selectedCard.Unique_ID || selectedCard.id}{'\n'}
                      Image URL: {imageUrl || 'None'}{'\n'}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }, [
    selectedCard,
    cardModalVisible,
    closeCardModal,
    getCardActionId,
    onDecrementCard,
    onIncrementCard,
    onToggleFoil,
    onRemoveCard,
    scannedCards,
  ]);

  const checkPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'App needs camera permission to scan cards.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        setHasPermission(true);
        await startSession();
        setIsActive(true);
      } else {
        onError(new Error('Camera permission denied'));
      }
    } catch (error: any) {
      onError(error instanceof Error ? error : new Error('Failed to check camera permission'));
    }
  };

  const startSession = async () => {
    try {
      Logger.debug('CardScanner: Starting camera session');
      await CameraService.startOcrSession();
      await CameraService.setLorcanaScanMode(isLorcanaScanRef.current);
      const { width, height } = await CameraService.getPreviewSize();
      if (width > 0 && height > 0) {
        Logger.debug(`CardScanner: Preview size available ${width}x${height}`);
      } else {
        Logger.debug('CardScanner: Waiting for native preview size event');
      }
      setIsActive(true);
    } catch (error: any) {
      Logger.error('Failed to start camera session:', error);
      showErrorToast('Failed to start camera');
      onError(error instanceof Error ? error : new Error('Failed to start session'));
      throw error;
    }
  };

  const stopSession = async () => {
    try {
      Logger.debug('CardScanner: Stopping camera session');
      await CameraService.stopOcrSession();
    } catch (error) {
      Logger.error('Failed to stop camera session:', error);
      // Don't show toast here as this is often called during unmount
    }
  };

  // Helper function for showing error toast on Android
  const showErrorToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
  }, []);

  const handleTextDetected = (result: any) => {
    // Adapt the result to match OcrResult type
    const ocrResult: OcrResult = {
      text: result.text,
      mainName: result.mainName || result.text,
      subtype: result.subtype || '',
      isLorcana: isLorcanaScanRef.current,
      setCode: result.setCode || null,
      cardNumber: result.cardNumber || null,
      setNumber:
        typeof result.setNumber === 'number'
          ? result.setNumber
          : result.setNumber != null
            ? Number(result.setNumber)
            : null,
    };
    onScanRef.current(ocrResult);
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No camera permission</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.previewContainer} onLayout={handlePreviewLayout}>
        <LiveOcrPreviewWithOverlay 
          style={StyleSheet.absoluteFill} 
          isActive={isActive && !effectivePaused}
        />
        {trackedCardRect ? (
          <View
            pointerEvents="none"
            style={[
              styles.dynamicGuide,
              trackingState === 'locked' ? styles.dynamicGuideLocked : styles.dynamicGuideSearching,
              {
                left: `${trackedCardRect.x * 100}%`,
                top: `${trackedCardRect.y * 100}%`,
                width: `${trackedCardRect.w * 100}%`,
                height: `${trackedCardRect.h * 100}%`,
              },
            ]}
          >
            <View
              style={[
                styles.guideBadge,
                trackingState === 'locked' ? styles.guideBadgeLocked : styles.guideBadgeSearching,
              ]}
            >
              <Text style={styles.guideBadgeText}>
                {trackingState === 'locked'
                  ? `Card Locked ${Math.round(trackingConfidence * 100)}%`
                  : 'Finding card...'}
              </Text>
            </View>
          </View>
        ) : (
          <View pointerEvents="none" style={styles.staticGuideFallback} />
        )}
        {effectivePaused && !showingVariations && (
          <View style={styles.pausedOverlay}>
            <Text style={styles.pausedText}>Camera Paused</Text>
          </View>
        )}
        {effectivePaused && showingVariations && (
          <View style={styles.pausedOverlayWithVariations}>
            <Text style={styles.pausedText}>Please select a card version</Text>
            <Icon 
              name="arrow-down-bold" 
              size={24} 
              color="#fff" 
              style={styles.pausedIcon}
            />
          </View>
        )}
      </View>
      
      {/* Render the scanned cards widget */}
      {renderScannedCardsWidget()}
      
      {/* Render the card detail modal */}
      {renderCardDetailModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  text: {
    color: 'white',
    textAlign: 'center',
    padding: 16,
  },
  staticGuideFallback: {
    position: 'absolute',
    left: '5%',
    top: '10%',
    width: '90%',
    height: '60%',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 4,
  },
  dynamicGuide: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    zIndex: 6,
  },
  dynamicGuideSearching: {
    borderColor: '#FFC107',
  },
  dynamicGuideLocked: {
    borderColor: '#4CAF50',
  },
  guideBadge: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  guideBadgeSearching: {
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
  },
  guideBadgeLocked: {
    backgroundColor: 'rgba(76, 175, 80, 0.92)',
  },
  guideBadgeText: {
    color: '#111',
    fontSize: 11,
    fontWeight: '700',
  },
  // Stats bubble styles
  statsBubbleContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 5,
  },
  statsBubble: {
    backgroundColor: 'rgba(33, 150, 243, 0.85)',
    borderRadius: 24,
    padding: 12,
    alignItems: 'center',
    minWidth: 70,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  statsCountText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statsPriceText: {
    color: 'white',
    fontSize: 14,
    marginTop: 2,
  },
  
  // Recent cards strip styles
  recentCardsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  recentCardsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  recentCardsHeaderText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  seeMoreText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
  cardsStrip: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
    flexWrap: 'wrap', // Enable wrapping to multiple rows if needed
    justifyContent: 'flex-start', // Start from left
  },
  cardPreviewContainer: {
    width: 120,
    marginHorizontal: 4,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    height: 170,
  },
  cardPreviewImage: {
    width: '100%',
    height: 85,
    backgroundColor: '#333',
  },
  cardPreviewPlaceholder: {
    width: '100%',
    height: 80,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardPlaceholderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardPreviewInfo: {
    padding: 6,
  },
  cardPreviewName: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  cardPreviewPrice: {
    color: '#4FC3F7',
    fontSize: 11,
    fontWeight: '500',
  },
  
  // Keep these existing styles
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pausedOverlayWithVariations: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 250,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pausedText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  pausedIcon: {
    marginTop: 8,
    opacity: 0.8,
  },
  
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    height: '90%',
    maxHeight: '90%',
    minHeight: 520,
    backgroundColor: '#212121',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: 16,
    paddingBottom: 28,
  },
  cardImageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalCardImageFrame: {
    width: 240,
    height: 336,
  },
  cardDetailImage: {
    width: 240,
    height: 336, // Standard card ratio
    borderRadius: 12,
    backgroundColor: '#333',
  },
  cardImagePlaceholder: {
    width: 240,
    height: 336,
    borderRadius: 12,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImagePlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  noImageText: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
  },
  cardDetailsSection: {
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'center',
  },
  detailLabel: {
    width: 100,
    fontSize: 14,
    color: '#ccc',
    fontWeight: '500',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
  },
  priceText: {
    color: '#4FC3F7',
    fontWeight: 'bold',
  },
  modalActionsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 3,
  },
  modalActionPrimary: {
    backgroundColor: '#2E7D32',
  },
  modalActionSecondary: {
    backgroundColor: '#546E7A',
  },
  modalActionFoil: {
    backgroundColor: '#6A1B9A',
  },
  modalActionFoilActive: {
    backgroundColor: '#9C27B0',
  },
  modalActionDanger: {
    backgroundColor: '#C62828',
  },
  modalActionDangerFull: {
    width: '100%',
  },
  modalActionDisabled: {
    opacity: 0.45,
  },
  modalActionText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 13,
  },
  modalActionHint: {
    color: '#B0BEC5',
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  cardTextSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cardText: {
    fontSize: 14,
    color: '#fff',
    marginTop: 8,
    lineHeight: 20,
  },
  debugSection: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  debugTitle: {
    fontSize: 14,
    color: '#ff9800',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 10,
    color: '#ccc',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '50%',
    elevation: 20,
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  collapseIcon: {
    marginLeft: 8,
  },
  variationsContainer: {
    padding: 12,
    paddingBottom: 8,
    display: 'flex',
    flexDirection: 'column',
    height: 'auto',
  },
  variationsListContainer: {
    height: 250,
  },
  variationsList: {
    flexGrow: 0,
  },
  buttonContainer: {
    marginTop: 10,
    paddingBottom: 10,
    width: '100%',
  },
  variationItem: {
    width: 140,
    height: 245,
    marginRight: 12,
    backgroundColor: '#333',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  selectedVariation: {
    borderColor: '#4CAF50',
  },
  originalScanVariation: {
    borderColor: '#2196F3',
  },
  variationImageWrapper: {
    height: 195,
    width: '100%',
    position: 'relative',
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  variationDetails: {
    padding: 6,
  },
  variationSetName: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  variationPrice: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: 'bold',
  },
  originalScanBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#2196F3',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderBottomLeftRadius: 4,
  },
  originalScanText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    paddingVertical: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    height: 60,
  },
  confirmButtonDisabled: {
    backgroundColor: '#757575',
    opacity: 0.8,
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  imagePreviewContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  imageFullContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageFull: {
    width: '90%', // Slightly smaller to fit within container
    height: '100%',
    borderRadius: 4,
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
  },
  placeholderText: {
    color: '#777',
    fontSize: 14,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  foilToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  foilToggleActive: {
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderColor: '#FFD700',
  },
  foilToggleText: {
    color: '#fff',
    marginLeft: 4,
    fontSize: 14,
  },
  foilBadgeSmall: {
    position: 'absolute',
    top: 2,
    left: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    padding: 1,
  },
});

export default CardScanner;
