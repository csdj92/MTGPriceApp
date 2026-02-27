import { Platform, ToastAndroid } from 'react-native';
import { Logger } from '../utils/logger';

const recentScans = new Map<string, number>();
const SCAN_COOLDOWN_MS = 2000;
const MAX_RECENT_SCANS = 10;

/**
 * Service responsible for OCR text processing and duplicate scan detection.
 */
export const OcrService = {
  /**
   * Preprocess OCR text to improve card name recognition.
   * Cleans up common OCR errors and formatting issues.
   */
  preprocessText(text: string): string {
    if (!text) return '';

    return text.replace(/\s+/g, ' ').trim();
  },

  /**
   * Check if the given normalised text was scanned within the cooldown window.
   * Returns true (duplicate — skip) or false (new scan — proceed).
   * Side effect: registers the text in the recent-scan set when it's new.
   */
  checkDuplicate(normalizedText: string): boolean {
    const now = Date.now();

    for (const [key, timestamp] of recentScans.entries()) {
      if (now - timestamp > SCAN_COOLDOWN_MS) {
        recentScans.delete(key);
      }
    }

    const previousTimestamp = recentScans.get(normalizedText);
    if (previousTimestamp && now - previousTimestamp < SCAN_COOLDOWN_MS) {
      Logger.debug(`[OcrService] Duplicate scan ignored: ${normalizedText}`);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Card already scanned', ToastAndroid.SHORT);
      }
      return true;
    }

    recentScans.set(normalizedText, now);
    if (recentScans.size > MAX_RECENT_SCANS) {
      const oldestKey = recentScans.keys().next().value as string | undefined;
      if (oldestKey) {
        recentScans.delete(oldestKey);
      }
    }

    return false;
  },

  clearRecentScans(): void {
    recentScans.clear();
  },
};
