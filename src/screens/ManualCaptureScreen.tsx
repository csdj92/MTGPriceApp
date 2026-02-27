import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Button, Image, Text } from 'react-native';
import ImageCropPicker from 'react-native-image-crop-picker';

const ManualCaptureScreen: React.FC = () => {
  const [croppedImage, setCroppedImage] = useState<string | null>(null);

  // Opens the camera and allows manual cropping.
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
    } catch (error) {
      console.error('Error capturing or cropping image:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Manual Image Capture</Text>
      <Button title="Take Picture & Crop" onPress={handleCaptureAndCrop} />
      
      {croppedImage && (
        <>
          <Text style={styles.previewTitle}>Cropped Image Preview:</Text>
          <Image source={{ uri: croppedImage }} style={styles.previewImage} />
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
});

export default ManualCaptureScreen; 
