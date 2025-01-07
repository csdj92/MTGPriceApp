import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, NativeModules, NativeEventEmitter, PermissionsAndroid, Dimensions, FlatList, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LiveOcrPreview from './LiveOcrPreview';
import type { ExtendedCard } from '../types/card';

const { LiveOcr } = NativeModules;
const liveOcrEmitter = new NativeEventEmitter(LiveOcr);

interface CardScannerProps {
    onTextDetected: (text: string) => void;
    onError: (error: Error) => void;
    scannedCards: ExtendedCard[];
    totalPrice: number;
    onCardPress?: (card: ExtendedCard) => void;
    isPaused?: boolean;
}

const CardScanner: React.FC<CardScannerProps> = ({
    onTextDetected,
    onError,
    scannedCards,
    totalPrice,
    onCardPress,
    isPaused = false
}) => {
    const [hasPermission, setHasPermission] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [aspectRatioStyle, setAspectRatioStyle] = useState({});
    const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

    const updateAspectRatio = (previewWidth: number, previewHeight: number) => {
        const screen = Dimensions.get('window');
        const screenWidth = screen.width;
        const screenHeight = screen.height;

        const scale = screenHeight / previewHeight;
        const scaledWidth = previewWidth * scale;
        const horizontalOffset = (screenWidth - scaledWidth) / 2;

        const newStyle = {
            position: 'absolute',
            width: scaledWidth,
            height: screenHeight,
            left: horizontalOffset,
            top: 0,
        };

        setAspectRatioStyle(newStyle);
    };

    useEffect(() => {
        const sizeSubscription = liveOcrEmitter.addListener('PreviewSize', (event) => {
            setPreviewSize({ width: event.width, height: event.height });
            updateAspectRatio(event.width, event.height);
        });

        const dimensionsListener = Dimensions.addEventListener('change', ({ window }) => {
            if (previewSize) {
                updateAspectRatio(previewSize.width, previewSize.height);
            }
        });

        return () => {
            sizeSubscription.remove();
            dimensionsListener.remove();
        };
    }, [previewSize]);

    useEffect(() => {
        checkPermission();

        const subscription = liveOcrEmitter.addListener('LiveOcrResult', (event) => {
            if (event.text && !isPaused) {
                onTextDetected(event.text);
            }
        });

        return () => {
            setIsActive(false);
            stopOcrSession();
            subscription.remove();
        };
    }, [isPaused]);

    const checkPermission = async () => {
        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.CAMERA,
                {
                    title: "Camera Permission",
                    message: "App needs camera permission to scan cards",
                    buttonNeutral: "Ask Me Later",
                    buttonNegative: "Cancel",
                    buttonPositive: "OK"
                }
            );

            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                setHasPermission(true);
                await startOcrSession();
                setIsActive(true);
            } else {
                onError(new Error('Camera permission denied'));
            }
        } catch (error) {
            onError(error instanceof Error ? error : new Error('Failed to check camera permission'));
        }
    };

    const startOcrSession = async () => {
        try {
            await LiveOcr.startOcrSession();
        } catch (error) {
            onError(error instanceof Error ? error : new Error('Failed to start OCR session'));
            throw error;
        }
    };

    const stopOcrSession = async () => {
        try {
            await LiveOcr.stopOcrSession();
        } catch (error) {
            console.error('Failed to stop OCR session:', error);
        }
    };

    // Add monitoring for prop changes
    // useEffect(() => {
    //     console.log('[CardScanner] Props updated:', {
    //         scannedCardsCount: scannedCards?.length,
    //         totalPrice,
    //         cards: scannedCards?.map(card => card.name)
    //     });
    // }, [scannedCards, totalPrice]);

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
                <LiveOcrPreview
                    style={StyleSheet.absoluteFill}
                    isActive={isActive && !isPaused}
                />
            </View>

            {scannedCards?.length > 0 && (
                <View style={styles.counterBubble}>
                    <Text style={styles.counterText}>{scannedCards.length}</Text>
                    <Text style={styles.priceText}>${totalPrice.toFixed(2)}</Text>
                </View>
            )}
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
