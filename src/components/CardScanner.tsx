import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  NativeModules,
  NativeEventEmitter,
  PermissionsAndroid,
  Dimensions,
} from 'react-native';
import LiveOcrPreviewWithOverlay from './LiveOcrPreview';
import type { ExtendedCard, OcrResult } from '../types/card';

const { LiveOcr, LiveImageClassifier } = NativeModules;
const liveOcrEmitter = new NativeEventEmitter(LiveOcr);
const liveImageClassifierEmitter = new NativeEventEmitter(LiveImageClassifier);

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
  isPaused = false,
  useClassifier = false,
}) => {
  const [hasPermission, setHasPermission] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [aspectRatioStyle, setAspectRatioStyle] = useState({});
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

  const emitter = useClassifier ? liveImageClassifierEmitter : liveOcrEmitter;
  const eventName = useClassifier ? 'LiveImageClassification' : 'LiveOcrResult';

  useEffect(() => {
    checkPermission();

    const subscription = emitter.addListener(eventName, (event) => {
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

    const sizeSubscription = emitter.addListener('PreviewSize', (event) => {
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
      subscription.remove();
      sizeSubscription.remove();
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
      if (useClassifier) {
        await LiveImageClassifier.startClassificationSession();
        const { width, height } = await LiveImageClassifier.getPreviewSize();
        updateAspectRatio(width, height);
      } else {
        await LiveOcr.startOcrSession();
        const { width, height } = await LiveOcr.getPreviewSize();
        updateAspectRatio(width, height);
      }
      setIsActive(true);
    } catch (error: any) {
      onError(error instanceof Error ? error : new Error('Failed to start session'));
      throw error;
    }
  };

  const stopSession = async () => {
    try {
      if (useClassifier) {
        await LiveImageClassifier.stopClassificationSession();
      } else {
        await LiveOcr.stopOcrSession();
      }
    } catch (error) {
      console.error('Failed to stop session:', error);
    }
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
      <View style={[styles.previewContainer, aspectRatioStyle]}>
        <LiveOcrPreviewWithOverlay 
          style={StyleSheet.absoluteFill} 
          isActive={isActive && !isPaused}
          type={useClassifier ? 'classifier' : 'ocr'}
        />
      </View>
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
  counterBubble: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#2196F3',
    minWidth: 80,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 2,
  },
  counterText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  priceText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 2,
  },
});

export default CardScanner;
