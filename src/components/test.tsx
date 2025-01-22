// import React, { useEffect, useState } from 'react';
// import { StyleSheet, Text, View } from 'react-native';
// import {
//   OpenCV,
//   ObjectType,
//   DataTypes,
//   ColorConversionCodes,
//   RetrievalModes,
//   ContourApproximationModes,
// } from 'react-native-fast-opencv';
// import {
//   Camera,
//   useCameraDevice,
//   useCameraPermission,
//   useFrameProcessor,
//   type Frame
// } from 'react-native-vision-camera';
// import { useResizePlugin } from 'vision-camera-resize-plugin';
// import { Canvas, Rect as SkRect } from '@shopify/react-native-skia';
// import { runOnJS } from 'react-native-reanimated';
// import { loadTensorflowModel } from 'react-native-fast-tflite';

// interface DetectedRect {
//   x: number;
//   y: number;
//   width: number;
//   height: number;
// }

// export function CameraRealtimeDetection() {
//   const device = useCameraDevice('back');
//   const { hasPermission, requestPermission } = useCameraPermission();
//   const { resize } = useResizePlugin();
//   const [rectangles, setRectangles] = useState<DetectedRect[]>([]);
//   const [model, setModel] = useState<any>(null);

//   useEffect(() => {
//     requestPermission();
//     loadModel();
//   }, [requestPermission]);

//   const loadModel = async () => {
//     try {
//       const loadedModel = await loadTensorflowModel(
//         require('../../assets/mtg_classifier.tflite'),
//         { numThreads: 4 }
//       );
//       setModel(loadedModel);
//       console.log('Model loaded successfully');
//     } catch (error) {
//       console.error('Error loading model:', error);
//     }
//   };

//   const frameProcessor = useFrameProcessor((frame: Frame) => {
//     'worklet';

//     const scaleFactor = 4;
//     const processingWidth = Math.floor(frame.width / scaleFactor);
//     const processingHeight = Math.floor(frame.height / scaleFactor);

//     try {
//       // First resize using the plugin
//       const smallFrame = resize(frame, {
//         scale: {
//           width: processingWidth,
//           height: processingHeight,
//         },
//         pixelFormat: 'rgb',
//         dataType: 'uint8',
//       });

//       // Convert to OpenCV Mat
//       const src = OpenCV.frameBufferToMat(
//         processingHeight,
//         processingWidth,
//         3,
//         smallFrame
//       );

//       // Color thresholding
//       const hsv = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8UC3);
//       const mask = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8UC1);
//       const lower = OpenCV.createObject(ObjectType.Scalar, 30, 60, 60);
//       const upper = OpenCV.createObject(ObjectType.Scalar, 50, 255, 255);
      
//       OpenCV.invoke('cvtColor', src, hsv, ColorConversionCodes.COLOR_RGB2HSV);
//       OpenCV.invoke('inRange', hsv, lower, upper, mask);

//       // Find contours
//       const contours = OpenCV.createObject(ObjectType.MatVector);
//       OpenCV.invoke(
//         'findContours',
//         mask,
//         contours,
//         RetrievalModes.RETR_TREE,
//         ContourApproximationModes.CHAIN_APPROX_SIMPLE
//       );

//       const detectedRectangles: DetectedRect[] = [];
//       const contoursArray = OpenCV.toJSValue(contours).array;

//       for (let i = 0; i < contoursArray.length; i++) {
//         const contour = OpenCV.copyObjectFromVector(contours, i);
//         const { value: area } = OpenCV.invoke('contourArea', contour, false);

//         if (area > 3000) {
//           const rect = OpenCV.invoke('boundingRect', contour);
//           const rectValues = OpenCV.toJSValue(rect);
          
//           // Scale coordinates back to original size
//           const scaledRect = {
//             x: rectValues.x * scaleFactor,
//             y: rectValues.y * scaleFactor,
//             width: rectValues.width * scaleFactor,
//             height: rectValues.height * scaleFactor
//           };
//           detectedRectangles.push(scaledRect);

//           // Crop using the resize plugin
//           const cropped = resize(frame, {
//             crop: {
//               x: scaledRect.x,
//               y: scaledRect.y,
//               width: scaledRect.width,
//               height: scaledRect.height,
//             },
//             scale: {
//               width: 224,
//               height: 224,
//             },
//             pixelFormat: 'rgb',
//             dataType: 'uint8',
//           });

//           // Convert to TensorFlow Lite input
//           runOnJS(runInference)(cropped);
//         }
//         OpenCV.deleteObject(contour);
//       }

//       runOnJS(setRectangles)(detectedRectangles);
      
//       // Cleanup OpenCV objects
//       OpenCV.deleteObject(src);
//       OpenCV.deleteObject(hsv);
//       OpenCV.deleteObject(mask);
//       OpenCV.deleteObject(contours);
//     } finally {
//       OpenCV.clearBuffers();
//     }
//   }, []);

//   const runInference = async (croppedFrame: any) => {
//     if (!model) return;

//     try {
//       // Directly use the resized frame buffer from the plugin
//       const inputTensor = {
//         shape: [1, 224, 224, 3],
//         data: croppedFrame,
//         type: 'uint8'
//       };

//       const outputs = await model.run([inputTensor]);
//       console.log('Inference results:', outputs[0].data);
//     } catch (error) {
//       console.error('Inference error:', error);
//     }
//   };

//   if (!hasPermission) {
//     return (
//       <View style={styles.center}>
//         <Text>No camera permission</Text>
//       </View>
//     );
//   }

//   if (device == null) {
//     return (
//       <View style={styles.center}>
//         <Text>No camera device found</Text>
//       </View>
//     );
//   }

//   return (
//     <View style={styles.container}>
//       <Camera
//         style={StyleSheet.absoluteFill}
//         device={device}
//         isActive={true}
//         frameProcessor={frameProcessor}
//         pixelFormat="rgb"
//       />
//       <Canvas style={StyleSheet.absoluteFill}>
//         {rectangles.map((rect, index) => (
//           <SkRect
//             key={index}
//             x={rect.x}
//             y={rect.y}
//             width={rect.width}
//             height={rect.height}
//             color="red"
//             style="stroke"
//             strokeWidth={2}
//           />
//         ))}
//       </Canvas>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//   },
//   center: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
// });