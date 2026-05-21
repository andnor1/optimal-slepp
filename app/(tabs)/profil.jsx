// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN  –  username, calibration, settings
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Switch, StyleSheet, Alert, RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { calibrateFromLog } from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';
import { earnedBadges } from '../../src/utils/badges';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/utils/settings';
import { useSubscription } from '../../src/hooks/useSubscription';

// Decimal hour (e.g. 2.75) → "02:45"
function peakStr(h) {
  const hh = ((Math.floor(h) % 24) + 24) % 24;
  const mm  = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2,'0')}:${String(mm % 60).padStart(2,'0')}`;
}

const T = {
  bg:'#060914', surface:'#0C1220', elevated:'#111A2E',
  border:'rgba(255,255,255,.06)',
  accent:'#5EE7B7', accentDim:'#2A6B55',
  gold:'#F0B952',
  blue:'#4FA3E0',
  red:'#E05C5C', redLo:'rgba(224,92,92,.12)',
  text:'#E2EAF4', sub:'#7A96B8', muted:'#3A4F6A',
};

// ─── Shared sub-components ───────────────────────────────────────────────────
function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

function InfoRow({ icon, title, desc }) {
  return (
    <Card style={{ marginBottom:10 }}>
      <View style={{ flexDirection:'row', gap:12 }}>
        <Text style={{ fontSize:22, flexShrink:0 }}>{icon}</Text>
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:13, fontWeight:'600', color:T.text, marginBottom:3 }}>{title}</Text>
          <Text style={{ fontSize:12, color:T.muted, lineHeight:20 }}>{desc}</Text>
        </View>
      </View>
    </Card>
  );
}

// ─── Setting row components ──────────────────────────────────────────────────
function SettingToggle({ label, desc, value, onChange }) {
  return (
    <View style={s.settingRow}>
      <View style={{ flex:1, marginRight:14 }}>
        <Text style={s.settingLabel}>{label}</Text>
        {desc ? <Text style={s.settingDesc}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={v => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(v); }}
        trackColor={{ false:T.elevated, true:T.accent }}
        thumbColor="white"
        ios_backgroundColor={T.elevated}
      />
    </View>
  );
}

function SettingSegment({ label, desc, options, value, onChange, format = v => String(v) }) {
  return (
    <View style={s.settingBlock}>
      <Text style={s.settingLabel}>{label}</Text>
      {desc ? <Text style={[s.settingDesc, { marginBottom:8 }]}>{desc}</Text> : <View style={{ height:8 }} />}
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6 }}>
        {options.map(opt => (
          <TouchableOpacity
            key={String(opt)}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(opt); }}
            style={[s.segBtn, value === opt && s.segBtnActive]}>
            <Text style={{ fontSize:12, fontWeight:'600', color: value === opt ? '#060914' : T.sub }}>
              {format(opt)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function SettingSection({ title, children }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <View style={{ marginBottom:16 }}>
      <Text style={s.settingSectionTitle}>{title}</Text>
      <View style={s.card}>
        {items.filter(Boolean).map((child, i, arr) => (
          <View key={i}>
            {child}
            {i < arr.length - 1 && <View style={s.settingDivider} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Bedtime reminder helpers ────────────────────────────────────────────────
function bedtimeReminderTime(calib, reminderMins) {
  const bedH  = ((21 + (calib.dlmoShift || 0) + 2) % 24 + 24) % 24;
  const total = ((bedH * 60 - reminderMins) % 1440 + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

async function scheduleBedtimeReminder(calib, mins) {
  const existing = await Storage.getBedtimeNotifId();
  if (existing) {
    await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
  }
  const { hour, minute } = bedtimeReminderTime(calib, mins);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '🌙 Bedtime soon',
      body: `Your target bedtime is in ${mins} minutes. Start winding down.`,
      sound: false,
    },
    trigger: { hour, minute, repeats: true },
  }).catch(() => null);
  await Storage.saveBedtimeNotifId(id);
}

async function cancelBedtimeReminder() {
  const id = await Storage.getBedtimeNotifId();
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await Storage.saveBedtimeNotifId(null);
  }
}

async function scheduleWeeklyReport() {
  const existing = await Storage.getWeeklyReportNotifId();
  if (existing) {
    await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
  }
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '📊 Weekly Sleep Report',
      body: "Your weekly sleep insights are ready — open Analysis to see them.",
      sound: false,
    },
    trigger: { weekday: 2, hour: 9, minute: 0, repeats: true }, // Monday 09:00
  }).catch(() => null);
  await Storage.saveWeeklyReportNotifId(id);
}

async function cancelWeeklyReport() {
  const id = await Storage.getWeeklyReportNotifId();
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await Storage.saveWeeklyReportNotifId(null);
  }
}

// ─── Static content ──────────────────────────────────────────────────────────
const INFO_ITEMS = [
  ['🧬', 'Melatonin Model',   'Cosine curve with personal DLMO calibration based on sleep history'],
  ['📈', 'Calibration',       'After 3+ logged nights your personal phase and amplitude are calculated'],
  ['🔄', 'Continuous time',   'The algorithm plans the entire period as one timeline, not isolated windows'],
  ['💤', 'Sleep Cycles',      'Recommended sleep length snaps to 90-minute cycles for optimal sleep architecture'],
];

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function ProfilScreen() {
  const { isPremium } = useSubscription();
  const [name,       setName]       = useState('');
  const [tmpName,    setTmpName]    = useState('');
  const [editing,    setEditing]    = useState(false);
  const [calib,      setCalib]      = useState({ dlmoShift:0, amplitude:1.0, dataPoints:0 });
  const [log,        setLog]        = useState([]);
  const [badges,     setBadges]     = useState([]);
  const [settings,   setSettings]   = useState(DEFAULT_SETTINGS);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [storedLog, n, coachState, napLog, storedSettings] = await Promise.all([
      Storage.getLog(),
      Storage.getUsername(),
      Storage.getCoachingState(),
      Storage.getNapLog(),
      loadSettings(),
    ]);
    setLog(storedLog);
    setCalib(calibrateFromLog(storedLog));
    setName(n);
    setTmpName(n);
    setBadges(earnedBadges(storedLog, coachState?.streak ?? 0, napLog));
    setSettings(storedSettings);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Update a single setting key, save, and handle side effects
  const updateSetting = async (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await saveSettings(next);

    // Side effects
    if (key === 'bedtimeReminder' || key === 'bedtimeReminderMins') {
      const enabled = key === 'bedtimeReminder' ? value : next.bedtimeReminder;
      const mins    = key === 'bedtimeReminderMins' ? value : next.bedtimeReminderMins;
      if (enabled) await scheduleBedtimeReminder(calib, mins);
      else         await cancelBedtimeReminder();
    }
    if (key === 'weeklyReport') {
      if (value) await scheduleWeeklyReport();
      else       await cancelWeeklyReport();
    }
    if (key === 'dailySleepTip' && !value) {
      // Cancel any pending coaching notification
      const notifDate = await Storage.getCoachingNotifDate();
      if (notifDate) {
        await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
        await Storage.saveCoachingNotifDate(null);
      }
    }
  };

  const saveEditing = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const trimmed = tmpName.trim();
    setName(trimmed);
    setEditing(false);
    await Storage.saveUsername(trimmed);
  };

  const confirmClearLog = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Delete sleep history',
      'This deletes all logged sleep sessions and resets the calibration. Cannot be undone.',
      [
        { text:'Cancel', style:'cancel' },
        {
          text:'Delete all', style:'destructive',
          onPress: async () => {
            await Storage.saveLog([]);
            setLog([]);
            setCalib({ dlmoShift:0, amplitude:1.0, dataPoints:0 });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        <Text style={s.title}>Profile & Settings</Text>

        {/* ── Profile card ── */}
        <Card style={{ marginBottom:16 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:14, marginBottom:16 }}>
            <View style={s.avatar}>
              <Text style={{ fontSize:24 }}>🌙</Text>
            </View>
            <View style={{ flex:1 }}>
              {editing ? (
                <TextInput
                  value={tmpName}
                  onChangeText={setTmpName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveEditing}
                  style={s.nameInput}
                  placeholderTextColor={T.muted}
                  placeholder="Your name"
                />
              ) : (
                <Text style={{ fontSize:16, fontWeight:'600', color:T.text }}>
                  {name || 'User'}
                </Text>
              )}
              <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:2 }}>
                <Text style={{ fontSize:12, color:T.muted }}>
                  {calib.dataPoints >= 3
                    ? 'Personal model active'
                    : `${calib.dataPoints}/3 nights to calibration`}
                </Text>
                {isPremium && (
                  <View style={{ backgroundColor:'rgba(240,185,82,.15)', borderRadius:6, paddingHorizontal:6, paddingVertical:2 }}>
                    <Text style={{ fontSize:10, fontWeight:'700', color:'#F0B952' }}>✨ Premium</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={editing ? saveEditing : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditing(true); }}
              style={s.editBtn}>
              <Text style={s.editBtnText}>{editing ? 'Save' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection:'row', gap:10 }}>
            {[
              ['LOGGED',    `${calib.dataPoints} nights`, T.text],
              ['DLMO',      `${calib.dlmoShift >= 0 ? '+' : ''}${Math.round(calib.dlmoShift * 10) / 10}h`, T.accent],
              ['AMPLITUDE', `${Math.round(calib.amplitude * 100)}%`, calib.amplitude > 0.8 ? T.accent : T.gold],
            ].map(([l, v, c]) => (
              <View key={l} style={s.statBox}>
                <Text style={s.statLabel}>{l}</Text>
                <Text style={[s.statValue, { color:c }]}>{v}</Text>
              </View>
            ))}
          </View>

          {calib.dataPoints >= 3 && (
            <View style={s.dlmoBanner}>
              <View style={{ flex:1 }}>
                <Text style={s.dlmoLabel}>YOUR MELATONIN PEAK IS ESTIMATED AT</Text>
                <View style={{ flexDirection:'row', alignItems:'baseline', gap:6, marginTop:2 }}>
                  <Text style={s.dlmoTime}>at {peakStr(calib.dlmoPeakHour)}</Text>
                  {calib.hasQualityData && (
                    <View style={s.qualityPill}>
                      <Text style={s.qualityPillText}>
                        {calib.qualityNights} night{calib.qualityNights !== 1 ? 's' : ''} of quality data
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={s.dlmoSub}>
                  Optimal bedtime at{' '}
                  {peakStr(((calib.dlmoPeakHour - 3) % 24 + 24) % 24)}
                  {'  ·  '}DLMO at {peakStr(((21 + calib.dlmoShift) % 24 + 24) % 24)}
                </Text>
              </View>
              <Text style={{ fontSize:28 }}>🌙</Text>
            </View>
          )}
        </Card>

        {/* ── Calibration status ── */}
        {calib.dataPoints > 0 && (
          <Card style={{ marginBottom:16 }}>
            <Text style={[s.mono10, { marginBottom:12 }]}>CALIBRATION STATUS</Text>
            <View style={{ height:6, backgroundColor:T.elevated, borderRadius:3, overflow:'hidden', marginBottom:8 }}>
              <View style={{
                height:'100%',
                width:`${Math.min(100, (calib.dataPoints / 30) * 100)}%`,
                backgroundColor: calib.dataPoints >= 30 ? T.accent : calib.dataPoints >= 7 ? T.blue : T.gold,
                borderRadius:3,
              }} />
            </View>
            {[
              [3,  T.gold,  '3+ nights',  'Personal melatonin phase estimated'],
              [7,  T.blue,  '7+ nights',  'Good calibration of sleep pattern'],
              [30, T.accent,'30+ nights', 'Precise individual sleep model'],
            ].map(([threshold, col, lbl, desc]) => (
              <View key={lbl} style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:8 }}>
                <View style={{ width:8, height:8, borderRadius:4, backgroundColor: calib.dataPoints >= threshold ? col : T.muted }} />
                <Text style={{ fontSize:13, color: calib.dataPoints >= threshold ? col : T.muted, fontWeight:'600' }}>{lbl} </Text>
                <Text style={{ fontSize:13, color:T.sub, flex:1 }}>{desc}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* ── Achievements ── */}
        {badges.length > 0 && (
          <Card style={{ marginBottom:16 }}>
            <Text style={[s.mono10, { marginBottom:12 }]}>ACHIEVEMENTS</Text>
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:10 }}>
              {badges.map(b => (
                <View key={b.id} style={{ alignItems:'center', gap:4, minWidth:68 }}>
                  <View style={{ width:52, height:52, borderRadius:16, backgroundColor:T.elevated, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:`${T.accent}30` }}>
                    <Text style={{ fontSize:26 }}>{b.icon}</Text>
                  </View>
                  <Text style={{ fontSize:10, color:T.sub, textAlign:'center', maxWidth:68 }}>{b.title}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SETTINGS                                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <Text style={[s.sectionLabel, { marginTop:8, marginBottom:12 }]}>Settings</Text>

        {/* Notifications & Alerts */}
        <SettingSection title="NOTIFICATIONS & ALERTS">
          <SettingToggle
            label="Smart Alarm"
            desc="Wake in light sleep within the smart wake window"
            value={settings.smartAlarm}
            onChange={v => updateSetting('smartAlarm', v)}
          />
          <SettingToggle
            label="Bedtime Reminder"
            desc="Notification before your target bedtime"
            value={settings.bedtimeReminder}
            onChange={v => updateSetting('bedtimeReminder', v)}
          />
          {settings.bedtimeReminder && (
            <SettingSegment
              label="Remind me"
              options={[15, 30, 45, 60]}
              value={settings.bedtimeReminderMins}
              onChange={v => updateSetting('bedtimeReminderMins', v)}
              format={m => `${m} min before`}
            />
          )}
          <SettingToggle
            label="Daily Sleep Tip"
            desc="Evening notification with a personalised hygiene tip"
            value={settings.dailySleepTip}
            onChange={v => updateSetting('dailySleepTip', v)}
          />
          <SettingToggle
            label="Weekly Report"
            desc="Monday morning summary of last week's sleep"
            value={settings.weeklyReport}
            onChange={v => updateSetting('weeklyReport', v)}
          />
        </SettingSection>

        {/* Sleep Recording */}
        <SettingSection title="SLEEP RECORDING">
          <SettingToggle
            label="Enable Night Recording"
            desc="Microphone analysis of sleep depth during the night"
            value={settings.nightRecording}
            onChange={v => updateSetting('nightRecording', v)}
          />
          <SettingSegment
            label="Smart Wake Window"
            desc="How many minutes before alarm to check for light sleep"
            options={[15, 20, 30, 45, 60]}
            value={settings.smartWakeWindow}
            onChange={v => updateSetting('smartWakeWindow', v)}
            format={m => `${m} min`}
          />
          <SettingSegment
            label="Recording Quality"
            desc="Higher quality uses more battery"
            options={['low', 'medium', 'high']}
            value={settings.recordingQuality}
            onChange={v => updateSetting('recordingQuality', v)}
            format={v => v.charAt(0).toUpperCase() + v.slice(1)}
          />
        </SettingSection>

        {/* Health & Data */}
        <SettingSection title="HEALTH & DATA">
          <SettingToggle
            label="Apple Health Sync"
            desc="Read heart rate and movement data from Apple Health"
            value={settings.appleHealthSync}
            onChange={v => updateSetting('appleHealthSync', v)}
          />
          <SettingToggle
            label="Save Sleep to Apple Health"
            desc="Write sleep sessions back to Apple Health"
            value={settings.saveToAppleHealth}
            onChange={v => updateSetting('saveToAppleHealth', v)}
          />
        </SettingSection>

        {/* Display */}
        <SettingSection title="DISPLAY">
          <SettingToggle
            label="Animations"
            desc="Disable for a simpler, static interface"
            value={settings.animations}
            onChange={v => updateSetting('animations', v)}
          />
          <SettingToggle
            label="Show Melatonin Ring"
            desc="Live melatonin level indicator on the home screen"
            value={settings.showMelatoninRing}
            onChange={v => updateSetting('showMelatoninRing', v)}
          />
          <SettingToggle
            label="Show Recovery Score"
            desc="Recovery estimate based on hours since last sleep"
            value={settings.showRecoveryScore}
            onChange={v => updateSetting('showRecoveryScore', v)}
          />
          <SettingToggle
            label="24-hour Clock"
            desc="Use 24h format instead of 12h AM/PM"
            value={settings.clockFormat24h}
            onChange={v => updateSetting('clockFormat24h', v)}
          />
        </SettingSection>

        {/* Sleep Goals */}
        <SettingSection title="SLEEP GOALS">
          <SettingSegment
            label="Target Sleep Duration"
            desc="Used for recommendations and goal tracking"
            options={[6, 7, 7.5, 8, 9]}
            value={settings.targetSleepHours}
            onChange={v => updateSetting('targetSleepHours', v)}
            format={h => `${h}h`}
          />
          <SettingToggle
            label="Irregular Schedule Mode"
            desc="Optimises timing for shift workers and frequent travellers"
            value={settings.irregularSchedule}
            onChange={v => updateSetting('irregularSchedule', v)}
          />
        </SettingSection>

        {/* ── About the app ── */}
        <Text style={[s.sectionLabel, { marginTop:8 }]}>About the app</Text>
        {INFO_ITEMS.map(([icon, title, desc]) => (
          <InfoRow key={title} icon={icon} title={title} desc={desc} />
        ))}

        {/* ── Danger zone ── */}
        {log.length > 0 && (
          <View style={{ marginTop:20, marginBottom:8 }}>
            <TouchableOpacity onPress={confirmClearLog} style={s.dangerBtn}>
              <Text style={s.dangerBtnText}>🗑 Delete all sleep history</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.versionText}>Optimal Slepp · v1.0</Text>
        <View style={{ height:32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex:1, backgroundColor:T.bg },
  scroll: { paddingHorizontal:16 },
  title:  { fontSize:26, fontWeight:'800', color:T.text, paddingTop:20, marginBottom:20 },
  sectionLabel: { fontSize:13, fontWeight:'600', color:T.sub, marginTop:8, marginBottom:10 },
  mono10: { fontSize:10, color:T.muted, letterSpacing:1, fontWeight:'600' },
  card: {
    backgroundColor:T.surface, borderWidth:1, borderColor:T.border,
    borderRadius:20, padding:18, marginBottom:12,
  },
  avatar: {
    width:52, height:52, borderRadius:16,
    backgroundColor:T.accentDim ?? '#1A3A30',
    alignItems:'center', justifyContent:'center',
  },
  nameInput: {
    fontSize:16, fontWeight:'600', color:T.text,
    backgroundColor:T.elevated, borderRadius:10,
    paddingVertical:6, paddingHorizontal:10,
    borderWidth:1, borderColor:T.border,
  },
  editBtn: {
    backgroundColor:T.elevated, borderRadius:10,
    paddingVertical:8, paddingHorizontal:14,
  },
  editBtnText: { fontSize:12, color:T.sub },
  statBox: {
    flex:1, backgroundColor:T.elevated, borderRadius:12, padding:10,
  },
  statLabel: { fontSize:9, color:T.muted, letterSpacing:1, marginBottom:4, fontWeight:'500' },
  statValue: { fontSize:15, fontWeight:'700', color:T.text },
  dangerBtn: {
    paddingVertical:13, borderRadius:14,
    borderWidth:1, borderColor:`${T.red}40`,
    backgroundColor:T.redLo, alignItems:'center',
  },
  dangerBtnText: { fontSize:13, color:T.red },
  versionText: {
    fontSize:11, color:T.muted, textAlign:'center', marginTop:16,
  },
  dlmoBanner: {
    flexDirection:'row', alignItems:'center', gap:12,
    marginTop:14, paddingTop:14,
    borderTopWidth:1, borderTopColor:T.border,
  },
  dlmoLabel: { fontSize:9, color:T.muted, letterSpacing:0.8, fontWeight:'600' },
  dlmoTime:  { fontSize:24, fontWeight:'800', color:T.accent },
  dlmoSub:   { fontSize:11, color:T.sub, marginTop:3 },
  qualityPill: {
    backgroundColor:`${T.blue}22`, borderRadius:8,
    paddingHorizontal:7, paddingVertical:3,
  },
  qualityPillText: { fontSize:10, color:T.blue, fontWeight:'600' },

  // Settings
  settingSectionTitle: {
    fontSize:10, color:T.muted, letterSpacing:1, fontWeight:'700',
    marginBottom:8, marginLeft:4,
  },
  settingRow: {
    flexDirection:'row', alignItems:'center',
    paddingVertical:14,
  },
  settingBlock: {
    paddingVertical:14,
  },
  settingLabel: {
    fontSize:14, fontWeight:'600', color:T.text, marginBottom:2,
  },
  settingDesc: {
    fontSize:12, color:T.muted, lineHeight:18,
  },
  settingDivider: {
    height:1, backgroundColor:T.border, marginHorizontal:-18,
  },
  segBtn: {
    paddingVertical:7, paddingHorizontal:14,
    borderRadius:10, backgroundColor:T.elevated,
    borderWidth:1, borderColor:T.border,
  },
  segBtnActive: {
    backgroundColor:T.accent, borderColor:T.accent,
  },
});
