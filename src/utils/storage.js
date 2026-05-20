// ─────────────────────────────────────────────────────────────────────────────
// Persistent storage helpers using AsyncStorage
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  LOG:              'sleeplog_v2',
  WINDOWS:          'sleep_windows',
  LAST_WOKE:        'last_woke',
  ONBOARDED:        'onboarded',
  USERNAME:         'username',
  ALARMS:           'active_alarms',
  ALARM_ON:         'alarm_enabled',
  LAST_ANALYSIS:    'last_analysis',
  NAP_LOG:          'nap_log',
  COACHING_STATE:   'coaching_state',
};

export const Storage = {
  // Sleep log (up to 90 entries)
  async getLog() {
    const raw = await AsyncStorage.getItem(KEYS.LOG);
    return raw ? JSON.parse(raw) : [];
  },
  async saveLog(log) {
    await AsyncStorage.setItem(KEYS.LOG, JSON.stringify(log.slice(-90)));
  },

  // Sleep windows
  async getWindows() {
    const raw = await AsyncStorage.getItem(KEYS.WINDOWS);
    return raw ? JSON.parse(raw) : null;
  },
  async saveWindows(windows) {
    await AsyncStorage.setItem(KEYS.WINDOWS, JSON.stringify(windows));
  },

  // Last woke up
  async getLastWoke() {
    const raw = await AsyncStorage.getItem(KEYS.LAST_WOKE);
    return raw ? JSON.parse(raw) : null;
  },
  async saveLastWoke(date, time) {
    await AsyncStorage.setItem(KEYS.LAST_WOKE, JSON.stringify({ date, time }));
  },

  // Onboarding
  async isOnboarded() {
    const raw = await AsyncStorage.getItem(KEYS.ONBOARDED);
    return !!raw;
  },
  async setOnboarded() {
    await AsyncStorage.setItem(KEYS.ONBOARDED, '1');
  },

  // Username
  async getUsername() {
    return (await AsyncStorage.getItem(KEYS.USERNAME)) || '';
  },
  async saveUsername(name) {
    await AsyncStorage.setItem(KEYS.USERNAME, name);
  },

  // Alarms
  async getAlarms() {
    const raw = await AsyncStorage.getItem(KEYS.ALARMS);
    return raw ? JSON.parse(raw) : [];
  },
  async saveAlarms(alarms) {
    await AsyncStorage.setItem(KEYS.ALARMS, JSON.stringify(alarms));
  },
  async getAlarmEnabled() {
    const raw = await AsyncStorage.getItem(KEYS.ALARM_ON);
    return raw === 'true';
  },
  async saveAlarmEnabled(val) {
    await AsyncStorage.setItem(KEYS.ALARM_ON, String(val));
  },

  // Nap log (up to 30 entries)
  async getNapLog() {
    const raw = await AsyncStorage.getItem(KEYS.NAP_LOG);
    return raw ? JSON.parse(raw) : [];
  },
  async saveNapLog(log) {
    await AsyncStorage.setItem(KEYS.NAP_LOG, JSON.stringify(log.slice(-30)));
  },

  // Coaching state { streak, lastDate, done: [tipId, ...] }
  async getCoachingState() {
    const raw = await AsyncStorage.getItem(KEYS.COACHING_STATE);
    return raw ? JSON.parse(raw) : { streak: 0, lastDate: null, done: [] };
  },
  async saveCoachingState(state) {
    await AsyncStorage.setItem(KEYS.COACHING_STATE, JSON.stringify(state));
  },

  // Last recorded night analysis
  async getLastAnalysis() {
    const raw = await AsyncStorage.getItem(KEYS.LAST_ANALYSIS);
    return raw ? JSON.parse(raw) : null;
  },
  async saveLastAnalysis(analysis) {
    await AsyncStorage.setItem(KEYS.LAST_ANALYSIS, JSON.stringify(analysis));
  },
};
