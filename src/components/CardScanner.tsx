import React, { useState, useEffect, useCallback } from 'react';
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
}

const CardScanner: React.FC<CardScannerProps> = ({
  onTextDetected,
  onError,
  scannedCards,
  totalPrice,
  onCardPress,
  isPaused = false,
  useClassifier = false,
}) => {
  const [hasPermission, setHasPermission] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [aspectRatioStyle, setAspectRatioStyle] = useState({});
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [selectedCard, setSelectedCard] = useState<ExtendedCard | null>(null);
  const [cardModalVisible, setCardModalVisible] = useState(false);

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

  // Render the counter bubble with most recent card
  const renderScannedCardsWidget = useCallback(() => {
    if (!scannedCards || scannedCards.length === 0) {
      return null;
    }

    // We'll show at most the 3 most recent cards
    const recentCards = scannedCards.slice(0, 3);
    
    return (
      <>
        {/* Stats bubble - top right */}
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

        {/* Recently scanned cards strip - bottom */}
        <View style={styles.recentCardsContainer}>
          <View style={styles.recentCardsHeader}>
            <Text style={styles.recentCardsHeaderText}>
              Recently Scanned
            </Text>
            {scannedCards.length > 3 && (
              <Text style={styles.seeMoreText}>
                +{scannedCards.length - 3} more
              </Text>
            )}
          </View>
          
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
        </View>
      </>
    );
  }, [scannedCards, totalPrice, handleCardPress]);

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
      console.log(`[CardScanner] Failed to load image for card: ${name} ${e.nativeEvent?.error || 'undefined'}`);
      console.log(`[CardScanner] Failed image URI: ${uri}`);
      setIsLoading(false);
      setHasError(true);
      // Track the failure for retry management
      if (uri) {
        handleImageLoadError(uri, name);
      }
    };
    
    if (!isValidUri || hasError) {
      // Show placeholder for missing or failed images
      return (
        <View style={previewMode ? styles.cardPreviewPlaceholder : styles.cardImagePlaceholder}>
          <Text style={previewMode ? styles.cardPlaceholderText : styles.cardImagePlaceholderText}>
            {name ? name.substring(0, 1).toUpperCase() : "?"}
          </Text>
          {!previewMode && (
            <Text style={styles.noImageText}>No Image Available</Text>
          )}
        </View>
      );
    }
    
    return (
      <View style={previewMode ? {height: 80, width: '100%'} : {height: 336, width: 240}}>
        <FastImage 
          source={getImageSource(uri) || {
            uri,
            priority: FastImage.priority.high,
            cache: FastImage.cacheControl.immutable,
            headers: {
              'User-Agent': 'MTGPriceApp/1.0',
              'Accept': 'image/*,image/jpeg,image/png,image/avif',
              'Cache-Control': 'max-age=31536000, immutable'
            }
          }}
          style={previewMode ? styles.cardPreviewImage : styles.cardDetailImage} 
          resizeMode={previewMode ? FastImage.resizeMode.cover : FastImage.resizeMode.contain}
          onLoad={handleLoad}
          onError={() => handleError({ nativeEvent: { error: 'FastImage error' } })}
        />
        {isLoading && (
          <View style={[
            previewMode ? styles.cardPreviewPlaceholder : styles.cardImagePlaceholder,
            {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}
          ]}>
            <Text style={previewMode ? styles.cardPlaceholderText : styles.cardImagePlaceholderText}>
              {name ? name.substring(0, 1).toUpperCase() : "?"}
            </Text>
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
        {isPaused && (
          <View style={styles.pausedOverlay}>
            <Text style={styles.pausedText}>Camera Paused</Text>
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
    backgroundColor: 'black',
  },
  previewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    marginBottom: 8,
  },
  recentCardsHeaderText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
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
    height: 80,
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
    zIndex: 10,
  },
  pausedText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
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
});

export default CardScanner;
