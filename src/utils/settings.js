import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'user_settings_v1';

export const DEFAULT_SETTINGS = {
  // Notifications & Alerts
  smartAlarm:           true,
  bedtimeReminder:      false,
  bedtimeReminderMins:  30,    // 15 / 30 / 45 / 60
  dailySleepTip:        true,
  weeklyReport:         false,

  // Sleep Recording
  nightRecording:       false,
  smartWakeWindow:      30,    // 15 / 20 / 30 / 45 / 60 min
  recordingQuality:     'medium', // 'low' | 'medium' | 'high'

  // Health & Data
  appleHealthSync:      false,
  saveToAppleHealth:    false,

  // Display
  animations:           true,
  showMelatoninRing:    true,
  showRecoveryScore:    true,
  clockFormat24h:       true,

  // Sleep Goals
  targetSleepHours:     7.5,   // 6 / 7 / 7.5 / 8 / 9
  irregularSchedule:    false,
};

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
