import React, { useCallback, memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { CameraService } from '../../services/CameraService';
import { Logger } from '../../utils/logger';

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

export interface ZoomControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  currentZoom?: number;
  maxZoom?: number;
  disabled?: boolean;
}

/**
 * Camera zoom controls component
 * Provides buttons to zoom in, zoom out, and reset zoom
 */
const ZoomControls: React.FC<ZoomControlsProps> = ({ 
  onZoomIn,
  onZoomOut,
  onZoomReset,
  disabled = false
}) => {
  
  const handleZoomIn = useCallback(() => {
    if (disabled) return;
    Logger.debug('ZoomControls: Zoom in');
    
    if (onZoomIn) {
      onZoomIn();
    } else {
      CameraService.increaseZoom().catch(error => {
        Logger.error('Failed to increase zoom', error);
      });
    }
  }, [onZoomIn, disabled]);
  
  const handleZoomOut = useCallback(() => {
    if (disabled) return;
    Logger.debug('ZoomControls: Zoom out');
    
    if (onZoomOut) {
      onZoomOut();
    } else {
      CameraService.decreaseZoom().catch(error => {
        Logger.error('Failed to decrease zoom', error);
      });
    }
  }, [onZoomOut, disabled]);
  
  const handleZoomReset = useCallback(() => {
    if (disabled) return;
    Logger.debug('ZoomControls: Reset zoom');
    
    if (onZoomReset) {
      onZoomReset();
    } else {
      CameraService.resetZoom().catch(error => {
        Logger.error('Failed to reset zoom', error);
      });
    }
  }, [onZoomReset, disabled]);

  return (
    <View style={styles.zoomControls}>
      <TouchableOpacity
        style={[styles.zoomButton, disabled && styles.disabledButton]}
        onPress={handleZoomIn}
        disabled={disabled}
      >
        <Icon name="magnify-plus" size={24} color="#fff" />
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.zoomButton, disabled && styles.disabledButton]}
        onPress={handleZoomOut}
        disabled={disabled}
      >
        <Icon name="magnify-minus" size={24} color="#fff" />
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.zoomButton, disabled && styles.disabledButton]}
        onPress={handleZoomReset}
        disabled={disabled}
      >
        <Icon name="magnify-close" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  zoomControls: {
    position: 'absolute',
    left: 20,
    top: 260,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 24,
    padding: 8,
    zIndex: 10,
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 6,
  },
  disabledButton: {
    opacity: 0.5,
  }
});

// Use memo to prevent unnecessary re-renders
export default memo(ZoomControls); 