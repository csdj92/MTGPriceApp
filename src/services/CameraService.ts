import { NativeEventEmitter } from 'react-native';
import { LiveOcrModule } from '../types/NativeModules';

// Utility for safer native module calls
const safeNativeCall = async <T>(
  fn: () => Promise<T>,
  fallback: T,
  errorMsg: string
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    console.error(errorMsg, error);
    return fallback;
  }
};

// Create emitter only if module exists
const liveOcrEmitter = LiveOcrModule ? new NativeEventEmitter(LiveOcrModule) : null;

export const CameraService = {
  // Session management
  startOcrSession: () => 
    safeNativeCall(
      () => LiveOcrModule.startOcrSession(),
      undefined,
      'Failed to start OCR session'
    ),
  
  stopOcrSession: () => 
    safeNativeCall(
      () => LiveOcrModule.stopOcrSession(),
      undefined,
      'Failed to stop OCR session'
    ),
  
  // Processing control
  pauseProcessing: () => 
    safeNativeCall(
      () => LiveOcrModule.pauseProcessing(),
      false,
      'Failed to pause OCR processing'
    ),
  
  resumeProcessing: () => 
    safeNativeCall(
      () => LiveOcrModule.resumeProcessing(),
      false,
      'Failed to resume OCR processing'
    ),
  
  // Scan mode
  setLorcanaScanMode: (enabled: boolean) => 
    safeNativeCall(
      () => LiveOcrModule.setLorcanaScanMode(enabled),
      false,
      `Failed to set Lorcana scan mode to ${enabled}`
    ),
  
  getLorcanaScanMode: () => 
    safeNativeCall(
      () => LiveOcrModule.getLorcanaScanMode(),
      false,
      'Failed to get Lorcana scan mode'
    ),
  
  // Zoom control
  setZoomLevel: (zoomLevel: number) => 
    safeNativeCall(
      () => LiveOcrModule.setZoomLevel(zoomLevel),
      0,
      `Failed to set zoom level to ${zoomLevel}`
    ),
  
  increaseZoom: () => 
    safeNativeCall(
      () => LiveOcrModule.increaseZoom(),
      0,
      'Failed to increase zoom'
    ),
  
  decreaseZoom: () => 
    safeNativeCall(
      () => LiveOcrModule.decreaseZoom(),
      0,
      'Failed to decrease zoom'
    ),
  
  resetZoom: () => 
    safeNativeCall(
      () => LiveOcrModule.resetZoom(),
      0,
      'Failed to reset zoom'
    ),
  
  getZoomLevel: () => 
    safeNativeCall(
      () => LiveOcrModule.getZoomLevel(),
      0,
      'Failed to get zoom level'
    ),
  
  // Preview size
  getPreviewSize: () => 
    safeNativeCall(
      () => LiveOcrModule.getPreviewSize(),
      { width: 0, height: 0 },
      'Failed to get preview size'
    ),
  
  // Event management
  addOcrListener: (callback: (result: any) => void) => {
    return liveOcrEmitter?.addListener('LiveOcrResult', callback);
  },
  
  addPreviewSizeListener: (callback: (size: { width: number; height: number }) => void) => {
    return liveOcrEmitter?.addListener('PreviewSize', callback);
  }
};

// Export module for direct access in specific cases
export { LiveOcrModule }; 