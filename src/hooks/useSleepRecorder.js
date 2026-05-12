// ─────────────────────────────────────────────────────────────────────────────
// useSleepRecorder
// Records audio + accelerometer all night via expo-av / expo-sensors.
// Optionally reads heart rate from Apple Health every 5 minutes.
// Sample format: { t, rms, movement, heartRate?, heartRateVar? }
//   heartRate    — average BPM in the last 6-min HealthKit window
//   heartRateVar — variance of raw readings within that window (HRV proxy)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import { Accelerometer } from 'expo-sensors';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nowMin, analyseNightRecording } from '../engine/sleepEngine';
import { Storage } from '../utils/storage';
import {
  isHealthAvailable,
  requestHealthPermissions,
  readHeartRateSamples,
  writeSleepAnalysis,
} from '../utils/healthKit';

const SAMPLE_INTERVAL_MS = 10000; // 10 s
const HR_POLL_EVERY      = 30;    // every 30 samples = 5 min
const HR_WINDOW_MS       = 360000; // query last 6 min from HealthKit
const STORAGE_KEY        = 'sleep_recording_samples';

export function useSleepRecorder() {
  const [isRecording,   setIsRecording]   = useState(false);
  const [samples,       setSamples]       = useState([]);
  const [depth,         setDepth]         = useState(0.5);
  const [analysis,      setAnalysis]      = useState(null);
  const [micPermission, setMicPermission] = useState(null);
  const [healthReady,   setHealthReady]   = useState(false);
  const [activeSignals, setActiveSignals] = useState(['microphone', 'accelerometer']);

  const recordingRef = useRef(null);
  const tickRef      = useRef(null);
  const samplesRef   = useRef([]);
  const accelSubRef  = useRef(null);
  const accelBufRef  = useRef([]);  // rolling 2Hz magnitude buffer (~20 s)
  const hrRef        = useRef(null);    // last known HR average (BPM)
  const hrVarRef     = useRef(null);    // last known within-window HR variance

  // ── Permissions on mount ───────────────────────────────────────────────────
  useEffect(() => {
    Audio.requestPermissionsAsync().then(({ status }) => {
      setMicPermission(status === 'granted');
    });
    if (isHealthAvailable()) {
      requestHealthPermissions().then(granted => {
        if (granted) {
          setHealthReady(true);
          setActiveSignals(['microphone', 'accelerometer', 'heartRate']);
        }
      });
    }
    return () => { accelSubRef.current?.remove(); };
  }, []);

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!micPermission) return false;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Resume samples if app was restarted mid-night
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const prev = JSON.parse(stored);
        samplesRef.current = prev;
        setSamples(prev);
      } else {
        samplesRef.current = [];
        setSamples([]);
      }

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.LOW_QUALITY,
        isMeteringEnabled: true,
      });
      await rec.startAsync();
      recordingRef.current = rec;
      await activateKeepAwakeAsync('sleep-recorder');

      // Start accelerometer at 2 Hz
      accelBufRef.current = [];
      hrRef.current    = null;
      hrVarRef.current = null;
      Accelerometer.setUpdateInterval(500);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const mag = Math.sqrt(x * x + y * y + z * z);
        accelBufRef.current.push(mag);
        if (accelBufRef.current.length > 40) accelBufRef.current.shift();
      });

      // 10-second tick
      tickRef.current = setInterval(async () => {
        try {
          const status = await recordingRef.current?.getStatusAsync();
          if (!status?.isRecording) return;

          // ── Microphone RMS ──
          const dB  = status.metering ?? -60;
          const rms = Math.pow(10, dB / 20);

          // ── Movement: short-term variance of accelerometer magnitude ──
          const mags = [...accelBufRef.current];
          let movement = null;
          if (mags.length >= 4) {
            const avg = mags.reduce((a, b) => a + b, 0) / mags.length;
            const v   = mags.reduce((a, b) => a + (b - avg) ** 2, 0) / mags.length;
            movement = Math.min(1, Math.sqrt(v) * 100);
          }

          // ── Heart rate: poll Apple Health every 5 min ──
          // Apple Watch writes HR approximately every 5 min during sleep.
          // We query a 6-min window to ensure we catch each new reading.
          if (healthReady && samplesRef.current.length % HR_POLL_EVERY === 0) {
            const endISO   = new Date().toISOString();
            const startISO = new Date(Date.now() - HR_WINDOW_MS).toISOString();
            readHeartRateSamples(startISO, endISO).then(hrs => {
              if (hrs.length === 0) return;
              const vals = hrs.map(s => s.value);
              const avg  = vals.reduce((a, b) => a + b, 0) / vals.length;
              // Within-window variance: proxy for beat-to-beat HR variability
              const variance = vals.length > 1
                ? vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length
                : 0;
              hrRef.current    = avg;
              hrVarRef.current = variance;
            }).catch(() => {});
          }

          const sample = {
            t: nowMin(),
            rms,
            movement,
            heartRate:    hrRef.current,
            heartRateVar: hrVarRef.current,
          };
          samplesRef.current = [...samplesRef.current, sample];
          setSamples([...samplesRef.current]);

          // Persist every 60 s (6 samples)
          if (samplesRef.current.length % 6 === 0) {
            await AsyncStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(samplesRef.current.slice(-720)),
            );
          }

          // Live depth estimate for smart-wake checker (RMS-based)
          const recent   = samplesRef.current.slice(-20).map(s => s.rms);
          const avg      = recent.reduce((a, b) => a + b, 0) / recent.length;
          const variance = recent.reduce((acc, v) => acc + (v - avg) ** 2, 0) / recent.length;
          setDepth(Math.min(1, avg * 80 + Math.sqrt(variance) * 120));
        } catch (_) {}
      }, SAMPLE_INTERVAL_MS);

      setIsRecording(true);
      return true;
    } catch (err) {
      console.warn('Recording failed:', err);
      return false;
    }
  }, [micPermission, healthReady]);

  // ── Stop recording + analyse ───────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    clearInterval(tickRef.current);
    try { await recordingRef.current?.stopAndUnloadAsync(); } catch (_) {}
    deactivateKeepAwake('sleep-recorder');
    recordingRef.current = null;

    accelSubRef.current?.remove();
    accelSubRef.current  = null;
    accelBufRef.current  = [];
    hrRef.current        = null;
    hrVarRef.current     = null;

    setIsRecording(false);

    const result = analyseNightRecording(samplesRef.current);
    setAnalysis(result);
    if (result) {
      await Storage.saveLastAnalysis(result);

      // Add a log entry with quality so calibrateFromLog can use quality feedback.
      // source:'recording' lets the analyse screen distinguish these from manual logs.
      const existing = await Storage.getLog();
      const logEntry = {
        id:         Date.now(),
        sleepStart: result.sleepStart,
        sleepEnd:   result.sleepEnd,
        quality:    result.quality,
        source:     'recording',
        loggedAt:   Date.now(),
      };
      await Storage.saveLog([...existing, logEntry]);

      // Write sleep analysis back to Apple Health / Health Connect.
      if (healthReady) {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        writeSleepAnalysis(result, midnight.toISOString()).catch(() => {});
      }
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
    return result;
  }, [healthReady]);

  return {
    isRecording, samples, depth, analysis, micPermission,
    activeSignals, healthReady,
    startRecording, stopRecording,
  };
}
