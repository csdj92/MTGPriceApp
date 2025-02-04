// import React, { useState, useCallback, useEffect } from 'react';
// import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
// import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
// import type { NativeStackScreenProps } from '@react-navigation/native-stack';
// import type { RootStackParamList } from '../navigation/AppNavigator';
// import type { Frame } from 'react-native-vision-camera';
// import { runOnJS } from 'react-native-reanimated';
// import { useTensorflowModel } from 'react-native-fast-tflite';
// import { Tensor } from 'react-native-fast-tflite';

// type Props = NativeStackScreenProps<RootStackParamList, 'CameraTest'>;

// const CameraTest: React.FC<Props> = () => {
//     const { hasPermission, requestPermission } = useCameraPermission();
//     const [isFrontCamera, setIsFrontCamera] = useState(false);
//     const [torch, setTorch] = useState<'off' | 'on'>('off');
//     const [zoom, setZoom] = useState(1);
//     const [confidence, setConfidence] = useState<number>(0);
//     const [isModelLoaded, setIsModelLoaded] = useState(false);
    
//     const plugin = useTensorflowModel(require('../../assets/models/mtg_classifier.tflite'));
    
//     const device = useCameraDevice(isFrontCamera ? 'front' : 'back');

//     const frameProcessor = useFrameProcessor((frame) => {
//         'worklet';
//         console.log(`Frame: ${frame.width}x${frame.height}`);
//     }, []);

//     useEffect(() => {
//         if (plugin) {
//             setIsModelLoaded(true);
//         }
//     }, [plugin]);

//     React.useEffect(() => {
//         if (!hasPermission) {
//             requestPermission();
//         }
//     }, [hasPermission, requestPermission]);

//     if (!hasPermission || !device || !isModelLoaded) {
//         return (
//             <View style={styles.center}>
//                 <Text>
//                     {!hasPermission ? 'No camera permission' : 
//                     !device ? 'No camera device found' : 
//                     'Loading model...'}
//                 </Text>
//             </View>
//         );
//     }

//     return (
//         <View style={styles.container}>
//             <Camera
//                 style={StyleSheet.absoluteFill}
//                 device={device}
//                 isActive={true}
//                 zoom={zoom}
//                 torch={torch}
//                 frameProcessor={frameProcessor}
//             />
//             <View style={styles.controls}>
//                 <View style={styles.confidenceContainer}>
//                     <Text style={styles.confidenceText}>
//                         Confidence: {(confidence * 100).toFixed(1)}%
//                     </Text>
//                 </View>
//                 <TouchableOpacity
//                     style={styles.button}
//                     onPress={() => setIsFrontCamera(!isFrontCamera)}
//                 >
//                     <Text style={styles.buttonText}>Switch Camera</Text>
//                 </TouchableOpacity>

//                 {device.hasTorch && (
//                     <TouchableOpacity
//                         style={styles.button}
//                         onPress={() => setTorch(torch === 'on' ? 'off' : 'on')}
//                     >
//                         <Text style={styles.buttonText}>
//                             Torch: {torch}
//                         </Text>
//                     </TouchableOpacity>
//                 )}

//                 <View style={styles.zoomControls}>
//                     <TouchableOpacity
//                         style={styles.button}
//                         onPress={() => setZoom(Math.max(zoom - 0.5, device.minZoom))}
//                     >
//                         <Text style={styles.buttonText}>Zoom -</Text>
//                     </TouchableOpacity>
//                     <Text style={styles.zoomText}>{zoom.toFixed(1)}x</Text>
//                     <TouchableOpacity
//                         style={styles.button}
//                         onPress={() => setZoom(Math.min(zoom + 0.5, device.maxZoom))}
//                     >
//                         <Text style={styles.buttonText}>Zoom +</Text>
//                     </TouchableOpacity>
//                 </View>
//             </View>
//         </View>
//     );
// };

// const styles = StyleSheet.create({
//     container: {
//         flex: 1,
//     },
//     center: {
//         flex: 1,
//         justifyContent: 'center',
//         alignItems: 'center',
//     },
//     controls: {
//         position: 'absolute',
//         bottom: 40,
//         left: 0,
//         right: 0,
//         padding: 20,
//         gap: 20,
//     },
//     button: {
//         backgroundColor: 'rgba(0,0,0,0.5)',
//         padding: 10,
//         borderRadius: 8,
//         alignItems: 'center',
//     },
//     buttonText: {
//         color: 'white',
//         fontSize: 16,
//     },
//     zoomControls: {
//         flexDirection: 'row',
//         justifyContent: 'center',
//         alignItems: 'center',
//         gap: 20,
//     },
//     zoomText: {
//         color: 'white',
//         fontSize: 16,
//         backgroundColor: 'rgba(0,0,0,0.5)',
//         padding: 10,
//         borderRadius: 8,
//     },
//     confidenceContainer: {
//         backgroundColor: 'rgba(0,0,0,0.7)',
//         padding: 10,
//         borderRadius: 8,
//         alignItems: 'center',
//     },
//     confidenceText: {
//         color: 'white',
//         fontSize: 16,
//         fontWeight: 'bold',
//     },
// });

// export default CameraTest; 