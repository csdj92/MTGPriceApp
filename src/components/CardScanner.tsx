import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';

interface CardScannerProps {
    onTextDetected: (text: string) => void;
    onError: (error: string) => void;
}

const CardScanner: React.FC<CardScannerProps> = ({ onTextDetected, onError }) => {
    const cameraRef = useRef<Camera>(null);
    const device = useCameraDevice('back');

    const [hasPermission, setHasPermission] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [recognizedText, setRecognizedText] = useState('');

    useEffect(() => {
        const requestPermissions = async () => {
            const status = await Camera.requestCameraPermission();
            if (status === 'granted') {
                setHasPermission(true);
            } else {
                setHasPermission(false);
            }
        };
        requestPermissions();
    }, []);

    useEffect(() => {
        // Start interval to continuously capture & recognize text
        let intervalId: NodeJS.Timeout;

        if (hasPermission && device && !isScanning) {
            setIsScanning(true);
            intervalId = setInterval(async () => {
                await captureAndRecognize();
            }, 2000); // every 2 seconds, adjust as needed
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [hasPermission, device, isScanning]);

    const captureAndRecognize = async () => {
        try {
            // If camera isn't ready, just skip
            if (!cameraRef.current) return;

            // Capture a photo (make sure "photo={true}" is enabled on <Camera />)
            const photo = await cameraRef.current.takePhoto();

            // Use ML Kit to recognize text in the captured photo
            const result = await TextRecognition.recognize(photo.path);
            if (result?.blocks?.length > 0) {
                // Combine all recognized blocks into one string (or handle them as needed)
                const combinedText = result.blocks.map(b => b.text).join('\n');
                setRecognizedText(combinedText);
                onTextDetected(combinedText);
            } else {
                setRecognizedText('');
            }
        } catch (error) {
            console.warn('Error capturing or recognizing text:', error);
            onError('Failed to capture or recognize text');
        }
    };

    if (!hasPermission) {
        return (
            <View style={styles.centered}>
                <Text style={styles.text}>
                    Camera permission not granted
                </Text>
            </View>
        );
    }

    if (!device) {
        return (
            <View style={styles.centered}>
                <Text style={styles.text}>
                    No camera device available
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Camera Preview */}
            <Camera
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                photo={true}
            />
            {/* Text Overlay */}
            <View style={styles.overlay}>
                {recognizedText ? (
                    <Text style={styles.detectedText}>
                        {recognizedText}
                    </Text>
                ) : (
                    <ActivityIndicator color="#fff" size="large" />
                )}
            </View>
        </View>
    );
};

export default CardScanner;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        padding: 16,
    },
    detectedText: {
        color: '#fff',
        fontSize: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 8,
        borderRadius: 6,
    },
    text: {
        color: '#fff',
    },
});
