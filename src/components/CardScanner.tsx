import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, NativeModules, NativeEventEmitter, PermissionsAndroid, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LiveOcrPreview from './LiveOcrPreview';

const { LiveOcr } = NativeModules;
const liveOcrEmitter = new NativeEventEmitter(LiveOcr);

interface CardScannerProps {
    onTextDetected: (text: string) => void;
    onError: (error: Error) => void;
}

const CardScanner: React.FC<CardScannerProps> = ({ onTextDetected, onError }) => {
    const [hasPermission, setHasPermission] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [aspectRatioStyle, setAspectRatioStyle] = useState({});
    const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

    const updateAspectRatio = (previewWidth: number, previewHeight: number) => {
        const screen = Dimensions.get('window');
        const screenWidth = screen.width;
        const screenHeight = screen.height;

        // Calculate scale to fill screen height
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

        console.log('[CardScanner] Setting aspect ratio style:', newStyle);
        setAspectRatioStyle(newStyle);
    };

    useEffect(() => {
        const sizeSubscription = liveOcrEmitter.addListener('PreviewSize', (event) => {
            console.log('[CardScanner] Received preview size:', event);
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

        // Subscribe to OCR results
        console.log('[CardScanner] Setting up OCR event listener');
        const subscription = liveOcrEmitter.addListener('LiveOcrResult', (event) => {
            console.log('[CardScanner] Received OCR result:', event);
            if (event.text) {
                console.log('[CardScanner] Detected text:', event.text);
                onTextDetected(event.text);
            }
        });

        return () => {
            console.log('[CardScanner] Cleaning up...');
            setIsActive(false);
            stopOcrSession();
            subscription.remove();
        };
    }, []);

    const checkPermission = async () => {
        console.log('[CardScanner] Checking camera permission');
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
            console.log('[CardScanner] Camera permission status:', granted);

            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                setHasPermission(true);
                await startOcrSession();
                setIsActive(true);
            } else {
                console.warn('[CardScanner] Camera permission denied');
                onError(new Error('Camera permission denied'));
            }
        } catch (error) {
            console.error('[CardScanner] Error checking camera permission:', error);
            onError(error instanceof Error ? error : new Error('Failed to check camera permission'));
        }
    };

    const startOcrSession = async () => {
        try {
            console.log('[CardScanner] Starting OCR session...');
            await LiveOcr.startOcrSession();
            console.log('[CardScanner] OCR Session started successfully');
        } catch (error) {
            console.error('[CardScanner] Failed to start OCR session:', error);
            onError(error instanceof Error ? error : new Error('Failed to start OCR session'));
            throw error;
        }
    };

    const stopOcrSession = async () => {
        try {
            console.log('[CardScanner] Stopping OCR session...');
            await LiveOcr.stopOcrSession();
            console.log('[CardScanner] OCR Session stopped successfully');
        } catch (error) {
            console.error('[CardScanner] Failed to stop OCR session:', error);
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
            {/* Camera Preview with Aspect Ratio */}
            <View style={[styles.previewContainer, aspectRatioStyle]}>
                <LiveOcrPreview
                    style={StyleSheet.absoluteFill}
                    isActive={isActive}
                />
                {/* Overlay */}
                <View style={styles.overlay}>
                    <View style={styles.scanArea}>
                        <Text style={styles.overlayText}>Position card name here</Text>
                        <Icon name="card-search" size={40} color="white" style={styles.cameraIcon} />
                    </View>
                </View>
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
        justifyContent: 'center', // Ensures content is centered vertically
        alignItems: 'center', // Ensures content is centered horizontally
    },
    overlay: {
        ...StyleSheet.absoluteFillObject, // Makes the overlay fill the same space as the preview
        justifyContent: 'center', // Center vertically
        alignItems: 'center', // Center horizontally
    },
    scanArea: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        padding: 20,
        borderRadius: 10,
    },
    overlayText: {
        color: 'white',
        textAlign: 'center',
        fontSize: 18,
    },
    cameraIcon: {
        marginTop: 16,
        opacity: 0.8,
    },
    text: {
        color: 'white',
        textAlign: 'center',
        padding: 16,
    },
});

export default CardScanner;
