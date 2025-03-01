import React, { useCallback, memo } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { CameraService } from '../../services/CameraService';
import { Logger } from '../../utils/logger';

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

export interface CameraControlsProps {
  isScanning: boolean;
  isLorcanaScan: boolean;
  onToggleScan: () => void;
  onToggleLorcanaScan: () => void;
  disabled?: boolean;
}

/**
 * Camera control buttons component
 * Provides play/pause button and MTG/Lorcana toggle
 */
const CameraControls: React.FC<CameraControlsProps> = ({
  isScanning,
  isLorcanaScan,
  onToggleScan,
  onToggleLorcanaScan,
  disabled = false
}) => {
  
  const handleToggleScan = useCallback(() => {
    if (disabled) return;
    Logger.debug(`CameraControls: Toggle scan - ${isScanning ? 'pausing' : 'resuming'}`);
    onToggleScan();
  }, [onToggleScan, isScanning, disabled]);
  
  const handleToggleLorcanaScan = useCallback(() => {
    if (disabled) return;
    
    Logger.debug(`CameraControls: Toggle scan mode - switching to ${isLorcanaScan ? 'MTG' : 'Lorcana'} mode`);
    onToggleLorcanaScan();
    
    // Set the native scan mode
    CameraService.setLorcanaScanMode(!isLorcanaScan)
      .then(success => {
        if (!success) {
          Logger.warn('Failed to toggle Lorcana scan mode');
        }
      })
      .catch(error => {
        Logger.error('Error toggling Lorcana scan mode', error);
      });
  }, [onToggleLorcanaScan, isLorcanaScan, disabled]);
  
  return (
    <View style={styles.cameraControls}>
      <TouchableOpacity
        style={[styles.controlButton, disabled && styles.disabledButton]}
        onPress={handleToggleScan}
        disabled={disabled}
      >
        <Icon 
          name={isScanning ? 'pause-circle' : 'play-circle'} 
          size={32} 
          color="#fff" 
        />
        <Text style={styles.buttonText}>
          {isScanning ? 'Pause' : 'Resume'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.controlButton, disabled && styles.disabledButton]}
        onPress={handleToggleLorcanaScan}
        disabled={disabled}
      >
        <Icon 
          name={isLorcanaScan ? 'cards' : 'cards-outline'} 
          size={32} 
          color="#fff" 
        />
        <Text style={styles.buttonText}>
          {isLorcanaScan ? 'MTG Mode' : 'Lorcana Mode'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cameraControls: {
    position: 'absolute',
    left: 20,
    top: 20,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: 16,
    zIndex: 10,
  },
  controlButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    width: 60,
  },
  buttonText: {
    color: 'white',
    marginTop: 4,
    fontSize: 12,
  },
  disabledButton: {
    opacity: 0.5,
  }
});

// Use memo to prevent unnecessary re-renders
export default memo(CameraControls); 