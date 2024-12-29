import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, NativeModules, NativeEventEmitter, PermissionsAndroid, requireNativeComponent, StyleProp, ViewStyle } from 'react-native';

console.log('[CardScanner] Available Native Modules:', Object.keys(NativeModules));
const { LiveOcr } = NativeModules;
console.log('[CardScanner] LiveOcr module:', LiveOcr);
const liveOcrEmitter = new NativeEventEmitter(LiveOcr);

interface LiveOcrPreviewProps {
    style?: StyleProp<ViewStyle>;
    isActive: boolean;
}

const LiveOcrPreview = requireNativeComponent<LiveOcrPreviewProps>('LiveOcrPreview');

interface CardScannerProps {
    onTextDetected: (text: string) => void;
    onError: (error: Error) => void;
}

const CardScanner: React.FC<CardScannerProps> = ({ onTextDetected, onError }) => {
    const [hasPermission, setHasPermission] = useState(false);
    const [isActive, setIsActive] = useState(false);

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
            <LiveOcrPreview
                style={StyleSheet.absoluteFill}
                isActive={isActive}
            />
            <View style={styles.overlay}>
                <View style={styles.scanArea}>
                    <Text style={styles.overlayText}>Position card name here</Text>
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
    text: {
        color: 'white',
        textAlign: 'center',
        padding: 16,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanArea: {
        width: '80%',
        height: 100,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    overlayText: {
        color: 'white',
        fontSize: 18,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        padding: 8,
        borderRadius: 4,
    },
});

export default CardScanner;

