import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Button, Image, Text, NativeModules } from 'react-native';
import ImageCropPicker from 'react-native-image-crop-picker';

interface ClassifierResult {
  confidence: number;
  label: string;
}

const ManualCaptureScreen: React.FC = () => {
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [classifierResult, setClassifierResult] = useState<ClassifierResult | null>(null);

  // Instead of simulating a result, call the native live image classifier.
  const classifyCroppedImage = async (imagePath: string) => {
    try {
      const result = await NativeModules.LiveImageClassifier.classifyImageForTesting(imagePath);
      console.log('Classifier result:', result);
      setClassifierResult(result);
    } catch (error) {
      console.error('Error testing classifier:', error);
      setClassifierResult(null);
    }
  };

  // Opens the camera, allows manual cropping, and passes the cropped image to native classification.
  const handleCaptureAndCrop = async () => {
    try {
      const image = await ImageCropPicker.openCamera({
        width: 224,
        height: 224,
        cropping: true,
        cropperToolbarTitle: 'Crop the card image',
        compressImageQuality: 1.0,
      });
      console.log('Image captured and cropped', image);
      setCroppedImage(image.path);
      
      // Pass the cropped image to the native classifier.
      classifyCroppedImage(image.path);
    } catch (error) {
      console.error('Error capturing or cropping image:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Manual Image Capture & Crop</Text>
      <Button title="Take Picture & Crop" onPress={handleCaptureAndCrop} />
      
      {croppedImage && (
        <>
          <Text style={styles.previewTitle}>Cropped Image Preview:</Text>
          <Image source={{ uri: croppedImage }} style={styles.previewImage} />
        </>
      )}

      {classifierResult && (
        <>
          <Text style={styles.resultTitle}>Classifier Result:</Text>
          <Text style={styles.resultText}>
            Card: {classifierResult.label}{'\n'}
            Confidence: {(classifierResult.confidence * 100).toFixed(1)}%
          </Text>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: {
    fontSize: 18,
    marginBottom: 16,
  },
  previewTitle: {
    marginTop: 20,
    fontSize: 16,
  },
  previewImage: {
    marginTop: 10,
    width: 224,
    height: 224,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  resultTitle: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultText: {
    marginTop: 10,
    fontSize: 14,
  },
});

export default ManualCaptureScreen; 