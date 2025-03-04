import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  NativeModules,
  NativeEventEmitter,
  PermissionsAndroid,
  Dimensions,
  AppState,
  Platform,
  ToastAndroid,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import LiveOcrPreviewWithOverlay from './LiveOcrPreview';
import type { ExtendedCard, OcrResult } from '../types/card';
import { LiveOcrModule } from '../types/NativeModules';
import { CameraService } from '../services/CameraService';
import { Logger } from '../utils/logger';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess, getLorcanaImageUrl } from '../utils/imageUtils';
import FastImage from '@d11/react-native-fast-image';

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

// Only import LiveImageClassifier directly for now until we create a service for it
const { LiveImageClassifier } = NativeModules;
const liveOcrEmitter = LiveOcrModule ? new NativeEventEmitter(NativeModules.LiveOcr) : null;
const liveImageClassifierEmitter = LiveImageClassifier ? new NativeEventEmitter(LiveImageClassifier) : null;

interface CardScannerProps {
  onTextDetected: (result: { text: string }) => void;
  onError: (error: Error) => void;
  scannedCards: ExtendedCard[];
  totalPrice: number;
  onCardPress?: (card: ExtendedCard) => void;
  isPaused?: boolean;
  useClassifier?: boolean;
  cardVariations?: ExtendedCard[];
  onVariationSelect?: (card: ExtendedCard) => void;
  selectedVariation?: ExtendedCard | null;
  onConfirmVariation?: () => void;
}

const CardScanner: React.FC<CardScannerProps> = ({
  onTextDetected,
  onError,
  scannedCards,
  totalPrice,
  onCardPress,
  isPaused = false,
  useClassifier = false,
  cardVariations = [],
  onVariationSelect,
  selectedVariation = null,
  onConfirmVariation,
}) => {
  const [hasPermission, setHasPermission] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [aspectRatioStyle, setAspectRatioStyle] = useState({});
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [isRecentCardsCollapsed, setIsRecentCardsCollapsed] = useState(false);
  const [showingVariations, setShowingVariations] = useState(false);

  const emitter = useClassifier ? liveImageClassifierEmitter : liveOcrEmitter;
  const eventName = useClassifier ? 'LiveImageClassification' : 'LiveOcrResult';

  useEffect(() => {
    checkPermission();

    const subscription = emitter?.addListener(eventName, (event) => {
      if (!isPaused) {
        if (useClassifier) {
          if (event.label) {
            onTextDetected({ text: event.label });
          }
        } else {
          if (event.text) {
            onTextDetected(event);
          }
        }
      }
    });

    const sizeSubscription = emitter?.addListener('PreviewSize', (event) => {
      const { width, height } = event;
      setPreviewSize({ width, height });
      updateAspectRatio(width, height);
    });

    const dimensionsListener = Dimensions.addEventListener('change', ({ window }) => {
      if (previewSize) {
        updateAspectRatio(previewSize.width, previewSize.height);
      }
    });

    return () => {
      subscription?.remove();
      sizeSubscription?.remove();
      dimensionsListener.remove();
      setIsActive(false);
      stopSession().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  useEffect(() => {
    if (previewSize) {
      updateAspectRatio(previewSize.width, previewSize.height);
    }
  }, [previewSize]);

  // Add useEffect to handle pause state changes
  useEffect(() => {
    const handlePauseStateChange = async () => {
      if (isPaused) {
        // If we're paused and active, temporarily stop processing
        if (isActive) {
          try {
            if (useClassifier) {
              await LiveImageClassifier.pauseProcessing();
            } else {
              await LiveOcrModule.pauseProcessing();
            }
          } catch (error) {
            console.warn('Failed to pause processing:', error);
          }
        }
      } else if (isActive) {
        // If we're no longer paused and still active, resume processing
        try {
          if (useClassifier) {
            await LiveImageClassifier.resumeProcessing();
          } else {
            await LiveOcrModule.resumeProcessing();
          }
        } catch (error) {
          console.warn('Failed to resume processing:', error);
        }
      }
    };

    handlePauseStateChange();
  }, [isPaused, isActive, useClassifier]);

  // Add useEffect to handle pause state changes
  useEffect(() => {
    const handlePauseStateChange = async () => {
      if (isPaused) {
        // If we're paused and active, temporarily stop processing
        if (isActive) {
          try {
            if (useClassifier) {
              await LiveImageClassifier.pauseProcessing();
            } else {
              await CameraService.pauseProcessing();
            }
          } catch (error) {
            Logger.error('Failed to pause processing:', error);
            showErrorToast('Failed to pause camera');
          }
        }
      } else if (isActive) {
        // If we're no longer paused and still active, resume processing
        try {
          if (useClassifier) {
            await LiveImageClassifier.resumeProcessing();
          } else {
            await CameraService.resumeProcessing();
          }
        } catch (error) {
          Logger.error('Failed to resume processing:', error);
          showErrorToast('Failed to resume camera');
        }
      }
    };

    handlePauseStateChange();
  }, [isPaused, isActive, useClassifier]);

  // Handle card press - either use the passed handler or show our own modal
  const handleCardPress = useCallback((card: ExtendedCard) => {
    Logger.debug(`Card pressed: ${card.name}`);
    
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
            <View style={styles.cardsStrip}>
              {recentCards.map((card, index) => {
                // Get appropriate image URI using our helper function
                let imageUri = null;
                
                // Check if it's a Lorcana card
                if (card.type === 'Lorcana') {
                  // For Lorcana cards, use the imported function without specifying size
                  imageUri = getLorcanaImageUrl(card);
                } else {
                  // For MTG cards - use existing logic
                  imageUri = card.imageUris?.normal || 
                             card.imageUris?.small || 
                             card.imageUrl || null;
                }
                
                // Log the image URI for debugging
                if (__DEV__) {
                  console.log(`[CardScanner] Card ${index} (${card.name}): Using image URI: ${imageUri || 'none'}`);
                }
                  
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
                    
                    <View style={styles.cardPreviewInfo}>
                      <Text style={styles.cardPreviewName} numberOfLines={1}>
                        {card.name}
                      </Text>
                      <Text style={styles.cardPreviewPrice}>
                        ${card.prices?.usd ? parseFloat(card.prices.usd).toFixed(2) : '0.00'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
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
                    const isSelected = selectedVariation?.id === item.id;
                    const isOriginalScan = item.isOriginalScan;
                    
                    // Get appropriate image URI 
                    const imageUri = item.imageUris?.small || item.imageUrl || null;
                    
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
                            {item.setName || 'Unknown Set'}
                          </Text>
                          <Text style={styles.variationPrice}>
                            ${item.prices?.usd ? parseFloat(item.prices.usd).toFixed(2) : '0.00'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  style={styles.variationsList}
                />
              </View>
              
              {/* Always show the confirm button when variations are displayed */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={[
                    styles.confirmButton,
                    !selectedVariation && styles.confirmButtonDisabled
                  ]} 
                  onPress={() => {
                    if (onConfirmVariation && selectedVariation) {
                      onConfirmVariation();
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
    toggleRecentCardsCollapse
  ]);

  // Helper component for card images with error handling
  const CardImage = useCallback(({ uri, name, previewMode = false }: { uri: string | null, name: string, previewMode?: boolean }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    // Check if URI is valid before attempting to load
    const isValidUri = uri && 
      (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://'));
    
    useEffect(() => {
      // Log URI for debugging in development
      if (__DEV__) {
        console.log(`[CardImage] ${name} image URI: ${uri || 'none'} (valid: ${Boolean(isValidUri)})`);
      }
    }, [uri, name, isValidUri]);
    
    const handleLoad = () => {
      setIsLoading(false);
      if (__DEV__) {
        console.log(`[CardImage] Successfully loaded image for ${name}`);
      }
      // Record successful load in our tracking system
      if (uri) {
        handleImageLoadSuccess(uri, { name });
      }
    };
    
    const handleError = (e: any) => {
      setHasError(true);
      setIsLoading(false);
      console.error(`[CardImage] Error loading image for ${name}:`, e);
      if (uri) {
        handleImageLoadError(uri, name);
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
            <Text style={styles.placeholderText}>{name}</Text>
          </View>
        )}
      </View>
    );
  }, []);

  // Render the card detail modal
  const renderCardDetailModal = useCallback(() => {
    if (!selectedCard) return null;

    // Determine if it's a Lorcana card based on properties or URL
    const isLorcanaCard = selectedCard.type === 'Lorcana' || 
                          (selectedCard.imageUris?.normal && 
                           (selectedCard.imageUris.normal.includes('lorcana') || 
                            selectedCard.imageUris.normal.includes('lorcast')));

    // Get the appropriate image URL with our helper function
    let imageUrl = null;
    
    if (isLorcanaCard) {
      // For Lorcana cards, don't explicitly specify size
      imageUrl = getLorcanaImageUrl(selectedCard);
    } else {
      // For MTG cards - use existing logic
      imageUrl = selectedCard.imageUris?.normal || 
                 selectedCard.imageUris?.small || 
                 selectedCard.imageUrl || null;
    }
    
    // Log the image URL for debugging
    if (__DEV__) {
      console.log(`[CardScanner] Modal card (${selectedCard.name}): Using image URL: ${imageUrl || 'none'}`);
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
                {selectedCard.name}
              </Text>
              <TouchableOpacity onPress={closeCardModal} style={styles.closeButton}>
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.cardImageContainer}>
                <CardImage 
                  uri={imageUrl} 
                  name={selectedCard.name}
                  previewMode={false}
                />
              </View>
              
              <View style={styles.cardDetailsSection}>
                <Text style={styles.sectionTitle}>Card Details</Text>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{selectedCard.name}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Set:</Text>
                  <Text style={styles.detailValue}>{selectedCard.setName}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Number:</Text>
                  <Text style={styles.detailValue}>{selectedCard.collectorNumber}</Text>
                </View>
                
                {selectedCard.rarity && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Rarity:</Text>
                    <Text style={styles.detailValue}>{selectedCard.rarity}</Text>
                  </View>
                )}
                
                {selectedCard.prices && (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Normal Price:</Text>
                      <Text style={[styles.detailValue, styles.priceText]}>
                        ${selectedCard.prices.usd ? parseFloat(selectedCard.prices.usd).toFixed(2) : 'N/A'}
                      </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Foil Price:</Text>
                      <Text style={[styles.detailValue, styles.priceText]}>
                        ${selectedCard.prices.usdFoil ? parseFloat(selectedCard.prices.usdFoil).toFixed(2) : 'N/A'}
                      </Text>
                    </View>
                  </>
                )}
                
                {selectedCard.text && (
                  <View style={styles.cardTextSection}>
                    <Text style={styles.detailLabel}>Card Text:</Text>
                    <Text style={styles.cardText}>{selectedCard.text}</Text>
                  </View>
                )}
                
                {/* Debug section - expanded with more details */}
                {__DEV__ && (
                  <View style={styles.debugSection}>
                    <Text style={styles.debugTitle}>Debug Info:</Text>
                    <Text style={styles.debugText}>
                      Type: {isLorcanaCard ? 'Lorcana' : 'MTG'}{'\n'}
                      ID: {selectedCard.id}{'\n'}
                      Image URL: {imageUrl || 'None'}{'\n'}
                      imageUris.normal: {selectedCard.imageUris?.normal || 'None'}{'\n'}
                      imageUris.small: {selectedCard.imageUris?.small || 'None'}{'\n'}
                      imageUrl: {selectedCard.imageUrl || 'None'}{'\n'}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }, [selectedCard, cardModalVisible, closeCardModal]);

  const updateAspectRatio = (previewWidth: number, previewHeight: number) => {
    const screen = Dimensions.get('window');
    const screenWidth = screen.width;
    const screenHeight = screen.height;

    const previewAspectRatio = previewWidth / previewHeight;
    const screenAspectRatio = screenWidth / screenHeight;

    let scale: number;
    let scaledWidth: number;
    let scaledHeight: number;
    let horizontalOffset: number;
    let verticalOffset: number;

    if (previewAspectRatio > screenAspectRatio) {
        // Preview is wider than screen
        scale = screenHeight / previewHeight;
        scaledWidth = previewWidth * scale;
        scaledHeight = screenHeight;
        horizontalOffset = (screenWidth - scaledWidth) / 2;
        verticalOffset = 0;
    } else {
        // Preview is taller or equal to screen
        scale = screenWidth / previewWidth;
        scaledWidth = screenWidth;
        scaledHeight = previewHeight * scale;
        horizontalOffset = 0;
        verticalOffset = (screenHeight - scaledHeight) / 2;
    }

    const newStyle = {
        position: 'absolute' as const,
        width: scaledWidth,
        height: scaledHeight,
        left: horizontalOffset,
        top: verticalOffset,
    };
    setAspectRatioStyle(newStyle);
  };

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
      if (useClassifier) {
        await LiveImageClassifier.startClassificationSession();
        const { width, height } = await LiveImageClassifier.getPreviewSize();
        updateAspectRatio(width, height);
      } else {
        await CameraService.startOcrSession();
        const { width, height } = await CameraService.getPreviewSize();
        updateAspectRatio(width, height);
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
      if (useClassifier) {
        await LiveImageClassifier.stopClassificationSession();
      } else {
        await CameraService.stopOcrSession();
      }
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

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No camera permission</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.previewContainer, aspectRatioStyle]}>
        <LiveOcrPreviewWithOverlay 
          style={StyleSheet.absoluteFill} 
          isActive={isActive && !isPaused}
          type={useClassifier ? 'classifier' : 'ocr'}
        />
        {isPaused && !showingVariations && (
          <View style={styles.pausedOverlay}>
            <Text style={styles.pausedText}>Camera Paused</Text>
          </View>
        )}
        {isPaused && showingVariations && (
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
    paddingVertical: 12,
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
    paddingBottom: 8,
  },
  cardPreviewContainer: {
    width: 110,
    marginHorizontal: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cardPreviewImage: {
    width: '100%',
    height: 110,
    top:10,
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
    padding: 8,
  },
  cardPreviewName: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  cardPreviewPrice: {
    color: '#4FC3F7',
    fontSize: 12,
    fontWeight: '500',
  },
  
  // Keep these existing styles
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
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
    zIndex: 5,
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
    maxHeight: '90%',
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
    padding: 16,
  },
  cardImageContainer: {
    alignItems: 'center',
    marginBottom: 20,
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
    maxHeight: 375,
    elevation: 20,
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  collapseIcon: {
    marginLeft: 8,
  },
  variationsContainer: {
    padding: 12,
    paddingBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    height: 'auto',
  },
  variationsListContainer: {
    height: 220,
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
});

export default CardScanner;
