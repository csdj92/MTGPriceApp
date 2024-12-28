import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';

interface CardScannerProps {
    onTextDetected: (text: string) => void;
    onError: (error: Error) => void;
}

const CardScanner: React.FC<CardScannerProps> = ({ onTextDetected, onError }) => {
    const [hasPermission, setHasPermission] = useState(false);
    const device = useCameraDevice('back');
    const camera = React.useRef<Camera>(null);
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        checkPermission();
        return () => {
            setIsActive(false);
        };
    }, []);

    const checkPermission = async () => {
        console.log('[CardScanner] Checking camera permission');
        try {
            const permission = await Camera.requestCameraPermission();
            console.log('[CardScanner] Camera permission status:', permission);
            setHasPermission(permission === 'granted');
            if (permission !== 'granted') {
                console.warn('[CardScanner] Camera permission denied');
                onError(new Error('Camera permission denied'));
            }
        } catch (error) {
            console.error('[CardScanner] Error checking camera permission:', error);
            onError(error instanceof Error ? error : new Error('Failed to check camera permission'));
        }
    };

    const takePhoto = useCallback(async () => {
        if (!isActive) return;

        console.log('[CardScanner] Taking photo');
        try {
            const photo = await camera.current?.takePhoto();
            if (photo) {
                console.log('[CardScanner] Photo taken:', photo.path);
                const result = await TextRecognition.recognize('file://' + photo.path);
                console.log('[CardScanner] Text recognition result:', result);

                if (result.blocks && result.blocks.length > 0) {
                    // Sort blocks by y-position and size, prioritizing larger text near the top
                    const blocks = result.blocks.sort((a, b) => {
                        // Calculate score based on text size and position
                        const aSize = a.frame?.height || 0 * (a.frame?.width || 0);
                        const bSize = b.frame?.height || 0 * (b.frame?.width || 0);
                        const aY = a.frame?.top || 0;
                        const bY = b.frame?.top || 0;
                        return (bSize - bY * 2) - (aSize - aY * 2);
                    });

                    // Take the most likely card name (largest text near top)
                    const cardName = blocks[0].text.trim();
                    console.log('[CardScanner] Detected card name:', cardName);
                    onTextDetected(cardName);
                } else {
                    console.log('[CardScanner] No text detected in photo');
                }
            }
        } catch (error) {
            console.error('[CardScanner] Error taking photo:', error);
            if (!isActive) return;
            onError(error instanceof Error ? error : new Error('Failed to take photo'));
        }
    }, [isActive, onTextDetected, onError]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (hasPermission && device && isActive) {
            interval = setInterval(takePhoto, 2000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [hasPermission, device, isActive, takePhoto]);

    if (!hasPermission) {
        console.log('[CardScanner] No camera permission');
        return (
            <View style={styles.container}>
                <Text style={styles.text}>No camera permission</Text>
            </View>
        );
    }

    if (!device) {
        console.log('[CardScanner] Camera not available');
        return (
            <View style={styles.container}>
                <Text style={styles.text}>Camera not available</Text>
            </View>
        );
    }

    console.log('[CardScanner] Rendering camera view');
    return (
        <View style={styles.container}>
            <Camera
                ref={camera}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={isActive}
                photo={true}
            />
            <View style={styles.overlay}>
                <Text style={styles.overlayText}>Position card in frame</Text>
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
    overlayText: {
        color: 'white',
        fontSize: 18,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        padding: 8,
        borderRadius: 4,
    },
});

export default CardScanner;
