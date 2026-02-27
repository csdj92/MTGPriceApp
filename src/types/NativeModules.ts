import { NativeModules } from 'react-native';

interface LiveOcrType {
  startOcrSession: () => Promise<void>;
  stopOcrSession: () => Promise<void>;
  pauseProcessing: () => Promise<boolean>;
  resumeProcessing: () => Promise<boolean>;
  setLorcanaScanMode: (enabled: boolean) => Promise<boolean>;
  getLorcanaScanMode: () => Promise<boolean>;
  setZoomLevel: (zoomLevel: number) => Promise<number>;
  increaseZoom: () => Promise<number>;
  decreaseZoom: () => Promise<number>;
  getZoomLevel: () => Promise<number>;
  resetZoom: () => Promise<number>;
  getPreviewSize: () => Promise<{ width: number; height: number }>;
}

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LiveOcrFrameEvent {
  frameWidth: number;
  frameHeight: number;
  aoi: NormalizedRect;
  candidateBox: NormalizedRect | null;
  confidence: number;
  state: 'none' | 'searching' | 'locked';
}

interface LiveOcrNativeModules {
  LiveOcr: LiveOcrType;
}

// Check if the native module exists and create a safe proxy
const LiveOcrModule = NativeModules.LiveOcr
  ? NativeModules.LiveOcr
  : createMockLiveOcr();

// Create a mock implementation for when the module is not available
function createMockLiveOcr(): LiveOcrType {
  console.warn('LiveOcr native module not found. Using mock implementation.');
  
  return {
    startOcrSession: () => Promise.resolve(),
    stopOcrSession: () => Promise.resolve(),
    pauseProcessing: () => Promise.resolve(true),
    resumeProcessing: () => Promise.resolve(true),
    setLorcanaScanMode: () => Promise.resolve(true),
    getLorcanaScanMode: () => Promise.resolve(false),
    setZoomLevel: () => Promise.resolve(0),
    increaseZoom: () => Promise.resolve(0),
    decreaseZoom: () => Promise.resolve(0),
    getZoomLevel: () => Promise.resolve(0),
    resetZoom: () => Promise.resolve(0),
    getPreviewSize: () => Promise.resolve({ width: 0, height: 0 }),
  };
}

export { LiveOcrModule };
export type { LiveOcrType, LiveOcrNativeModules }; 
