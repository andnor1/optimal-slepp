import { NativeModules, Platform } from 'react-native';

// Graceful degradation: no-op when native module is unavailable (Expo Go / web)
const { SleepHealthWriter } = NativeModules;

/**
 * Write sleep phase samples to Apple Health (iOS) / Health Connect (Android).
 *
 * @param {Array<{startISO: string, endISO: string, phase: 'deep'|'light'|'rem'|'awake'}>} samples
 * @returns {Promise<boolean>}
 */
export async function writeSleepSamples(samples) {
  if (!SleepHealthWriter) return false;
  try {
    return await SleepHealthWriter.writeSleepSamples(samples);
  } catch (_) {
    return false;
  }
}

/**
 * Request write permission for SleepAnalysis (iOS) / SleepSession (Android).
 * On iOS, HealthKit write auth is requested silently (no UI shown if already granted).
 * @returns {Promise<boolean>}
 */
export async function requestSleepWritePermission() {
  if (!SleepHealthWriter) return false;
  try {
    return await SleepHealthWriter.requestSleepWritePermission();
  } catch (_) {
    return false;
  }
}
