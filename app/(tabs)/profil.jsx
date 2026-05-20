// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN  –  username, calibration, settings
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Switch, StyleSheet, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { calibrateFromLog } from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';

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

const INFO_ITEMS = [
  ['🧬','Melatonin Model',   'Cosine curve with personal DLMO calibration based on sleep history'],
  ['📈','Calibration',       'After 3+ logged nights your personal phase and amplitude are calculated'],
  ['🔄','Continuous time',   'The algorithm plans the entire period as one timeline, not isolated windows'],
  ['💤','Sleep Cycles',      'Recommended sleep length snaps to 90-minute cycles for optimal sleep architecture'],
];

export default function ProfilScreen() {
  const [name,         setName]         = useState('');
  const [tmpName,      setTmpName]      = useState('');
  const [editing,      setEditing]      = useState(false);
  const [calib,        setCalib]        = useState({ dlmoShift:0, amplitude:1.0, dataPoints:0 });
  const [log,          setLog]          = useState([]);
  const [alarmEnabled, setAlarmEnabled] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [storedLog, n, ae] = await Promise.all([
        Storage.getLog(),
        Storage.getUsername(),
        Storage.getAlarmEnabled(),
      ]);
      setLog(storedLog);
      setCalib(calibrateFromLog(storedLog));
      setName(n);
      setTmpName(n);
      setAlarmEnabled(ae);
    })();
  }, []));

  const saveEditing = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const trimmed = tmpName.trim();
    setName(trimmed);
    setEditing(false);
    await Storage.saveUsername(trimmed);
  };

  const toggleAlarm = async (val) => {
    setAlarmEnabled(val);
    await Storage.saveAlarmEnabled(val);
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
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Profile & Settings</Text>

        {/* ── Profilkort ── */}
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
              <Text style={{ fontSize:12, color:T.muted }}>
                {calib.dataPoints >= 3
                  ? 'Personal model active'
                  : `${calib.dataPoints}/3 nights to calibration`}
              </Text>
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
              ['DLMO',      `${calib.dlmoShift >= 0 ? '+' : ''}${Math.round(calib.dlmoShift * 10) / 10}t`, T.accent],
              ['AMPLITUDE', `${Math.round(calib.amplitude * 100)}%`, calib.amplitude > 0.8 ? T.accent : T.gold],
            ].map(([l, v, c]) => (
              <View key={l} style={s.statBox}>
                <Text style={s.statLabel}>{l}</Text>
                <Text style={[s.statValue, { color:c }]}>{v}</Text>
              </View>
            ))}
          </View>

          {/* ── DLMO peak time ── */}
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

        {/* ── Smart alarm toggle ── */}
        <Card style={{ marginBottom:16 }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
            <View style={{ flex:1, marginRight:16 }}>
              <Text style={{ fontSize:14, fontWeight:'600', color:T.text, marginBottom:2 }}>
                🔔 Smart Alarm Clock
              </Text>
              <Text style={{ fontSize:12, color:T.muted }}>
                Alarm is automatically set to recommended wake time
              </Text>
            </View>
            <Switch
              value={alarmEnabled}
              onValueChange={toggleAlarm}
              trackColor={{ false:T.elevated, true:T.accent }}
              thumbColor="white"
              ios_backgroundColor={T.elevated}
            />
          </View>
        </Card>

        {/* ── Kalibreringsstatus ── */}
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
                <View style={{
                  width:8, height:8, borderRadius:4,
                  backgroundColor: calib.dataPoints >= threshold ? col : T.muted,
                }} />
                <Text style={{ fontSize:13, color: calib.dataPoints >= threshold ? col : T.muted, fontWeight:'600' }}>
                  {lbl}{' '}
                </Text>
                <Text style={{ fontSize:13, color:T.sub, flex:1 }}>{desc}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* ── Om appen ── */}
        <Text style={s.sectionLabel}>About the app</Text>
        {INFO_ITEMS.map(([icon, title, desc]) => (
          <InfoRow key={title} icon={icon} title={title} desc={desc} />
        ))}

        {/* ── Faresone ── */}
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
  dlmoLabel: {
    fontSize:9, color:T.muted, letterSpacing:0.8, fontWeight:'600',
  },
  dlmoTime: {
    fontSize:24, fontWeight:'800', color:T.accent,
  },
  dlmoSub: {
    fontSize:11, color:T.sub, marginTop:3,
  },
  qualityPill: {
    backgroundColor:`${T.blue}22`, borderRadius:8,
    paddingHorizontal:7, paddingVertical:3,
  },
  qualityPillText: {
    fontSize:10, color:T.blue, fontWeight:'600',
  },
});
