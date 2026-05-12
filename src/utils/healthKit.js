// ─────────────────────────────────────────────────────────────────────────────
// healthKit.js  –  wrapper for react-native-health (iOS) and
//                  react-native-health-connect (Android)
//
// Both require a native build (npx expo prebuild + EAS Build).
// They will NOT work in Expo Go — this file degrades gracefully when either
// module is absent.
//
// react-native-health is imported here via try/require so the JS bundle
// never crashes on Expo Go or web, even though the package is installed.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import { writeSleepSamples, requestSleepWritePermission } from '../../modules/sleep-health-writer';

let RNHealth = null;
let RNHealthConnect = null;
try { RNHealth = require('react-native-health').default; } catch (_) {}
try { RNHealthConnect = require('react-native-health-connect'); } catch (_) {}

export const isHealthAvailable = () =>
  (Platform.OS === 'ios'     && RNHealth !== null) ||
  (Platform.OS === 'android' && RNHealthConnect !== null);

// ── Request permissions (read + write) ────────────────────────────────────
// Reads: HeartRate, SleepAnalysis, StepCount
// Writes: SleepAnalysis (via SleepHealthWriter module)
export async function requestHealthPermissions() {
  try {
    if (Platform.OS === 'ios' && RNHealth) {
      const readGranted = await new Promise(resolve => {
        RNHealth.initHealthKit(
          {
            permissions: {
              read: [
                RNHealth.Constants.Permissions.HeartRate,
                RNHealth.Constants.Permissions.SleepAnalysis,
                RNHealth.Constants.Permissions.StepCount,
              ],
              write: [
                RNHealth.Constants.Permissions.SleepAnalysis,
              ],
            },
          },
          err => resolve(!err),
        );
      });
      // Also request write via our custom module (covers the HealthKit write dialog)
      if (readGranted) await requestSleepWritePermission();
      return readGranted;
    }
    if (Platform.OS === 'android' && RNHealthConnect) {
      await RNHealthConnect.initialize();
      const granted = await RNHealthConnect.requestPermission([
        { accessType: 'read',  recordType: 'HeartRate' },
        { accessType: 'read',  recordType: 'SleepSession' },
        { accessType: 'read',  recordType: 'Steps' },
        { accessType: 'write', recordType: 'SleepSession' },
      ]);
      return granted;
    }
  } catch (_) {}
  return false;
}

// ── Heart rate samples ─────────────────────────────────────────────────────
// Returns [{iso: string, value: number (bpm)}] sorted ascending, or []
export async function readHeartRateSamples(startISO, endISO) {
  try {
    if (Platform.OS === 'ios' && RNHealth) {
      return new Promise(resolve => {
        RNHealth.getHeartRateSamples(
          { startDate: startISO, endDate: endISO, ascending: true, limit: 200 },
          (err, results) => {
            if (err || !results) return resolve([]);
            resolve(results.map(r => ({ iso: r.startDate, value: Number(r.value) })));
          },
        );
      });
    }
    if (Platform.OS === 'android' && RNHealthConnect) {
      const records = await RNHealthConnect.readRecords('HeartRate', {
        timeRangeFilter: { operator: 'between', startTime: startISO, endTime: endISO },
      });
      return (records || []).flatMap(r =>
        (r.samples || []).map(s => ({ iso: r.time, value: s.beatsPerMinute })),
      );
    }
  } catch (_) {}
  return [];
}

// ── Write sleep analysis to Apple Health / Health Connect ──────────────────
// analysis: return value of analyseNightRecording()
//   { sleepStart, sleepEnd, phases: [{t, depth, phase}] }
// t is minutes-since-midnight; sleepStart/sleepEnd are also minute offsets.
// We reconstruct ISO timestamps using the recording date passed in.
export async function writeSleepAnalysis(analysis, recordingDateISO) {
  if (!analysis?.phases?.length) return false;
  try {
    const base = new Date(recordingDateISO);
    // base is midnight of the sleep date; t values are minutes from that midnight
    const toISO = (minuteOffset) =>
      new Date(base.getTime() + minuteOffset * 60_000).toISOString();

    // Build per-phase intervals from consecutive phase entries
    const phases  = analysis.phases;
    const samples = [];
    for (let i = 0; i < phases.length; i++) {
      const p     = phases[i];
      const next  = phases[i + 1];
      const start = toISO(p.t);
      // Each sample covers until the next sample's t, or sleepEnd for the last one
      const end   = next ? toISO(next.t) : toISO(analysis.sleepEnd ?? p.t + 10);
      samples.push({ startISO: start, endISO: end, phase: p.phase });
    }

    return await writeSleepSamples(samples);
  } catch (_) {
    return false;
  }
}
