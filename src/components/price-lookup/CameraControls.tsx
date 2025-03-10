import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Icon = MaterialCommunityIcons as any;

export type CameraControlsProps = {
  isScanningPaused: boolean;
  onPausePress: () => void;
  onClosePress: () => void;
};

const CameraControls: React.FC<CameraControlsProps> = ({
  isScanningPaused,
  onPausePress,
  onClosePress,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={onPausePress}
        accessibilityLabel={isScanningPaused ? "Resume scanning" : "Pause scanning"}
      >
        <Icon
          name={isScanningPaused ? "play" : "pause"}
          size={24}
          color="white"
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={onClosePress}
        accessibilityLabel="Close scanner"
      >
        <Icon name="close" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    gap: 16,
  },
  button: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CameraControls; 