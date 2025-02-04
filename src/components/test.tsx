import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
// import { useTensorflowModel } from 'react-native-fast-tflite';

type Props = NativeStackScreenProps<RootStackParamList, 'CameraTest'>;

const CameraTest: React.FC<Props> = () => {
    // All hooks must be called unconditionally at the top level
    const { hasPermission, requestPermission } = useCameraPermission();
    const [isFrontCamera, setIsFrontCamera] = useState(false);
    const [torch, setTorch] = useState<'off' | 'on'>('off');
    const [zoom, setZoom] = useState(1);
    const device = useCameraDevice(isFrontCamera ? 'front' : 'back');
    const frameProcessor = useFrameProcessor((frame) => {
        'worklet';
        const { width, height } = frame;
        console.log(`Processing frame: ${width}x${height}`);
    }, []);

    // Keep all hooks above any conditional returns
    useEffect(() => {
        if (!hasPermission) {
            requestPermission();
        }
    }, [hasPermission, requestPermission]);

    // Conditional returns should come after all hooks
    if (!hasPermission) {
        return (
            <View style={styles.center}>
                <Text>No camera permission</Text>
            </View>
        );
    }

    if (device == null) {
        return (
            <View style={styles.center}>
                <Text>No camera device found</Text>
            </View>
        );
    }

    const handleZoomIn = () => {
        setZoom(Math.min(zoom + 0.5, device?.maxZoom || 1));
    };

    const handleZoomOut = () => {
        setZoom(Math.max(zoom - 0.5, device?.minZoom || 1));
    };

    return (
        <View style={styles.container}>
            <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                zoom={zoom}
                torch={torch}
                frameProcessor={frameProcessor}
            />
            <View style={styles.controls}>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => setIsFrontCamera(!isFrontCamera)}
                >
                    <Text style={styles.buttonText}>Switch Camera</Text>
                </TouchableOpacity>

                {device.hasTorch && (
                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => setTorch(torch === 'on' ? 'off' : 'on')}
                    >
                        <Text style={styles.buttonText}>
                            Torch: {torch}
                        </Text>
                    </TouchableOpacity>
                )}

                <View style={styles.zoomControls}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleZoomOut}
                    >
                        <Text style={styles.buttonText}>Zoom -</Text>
                    </TouchableOpacity>
                    <Text style={styles.zoomText}>{zoom.toFixed(1)}x</Text>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleZoomIn}
                    >
                        <Text style={styles.buttonText}>Zoom +</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    controls: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        padding: 20,
        gap: 20,
    },
    button: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
    },
    zoomControls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
    },
    zoomText: {
        color: 'white',
        fontSize: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 10,
        borderRadius: 8,
    },
});

export default CameraTest;