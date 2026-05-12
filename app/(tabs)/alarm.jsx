// ─────────────────────────────────────────────────────────────────────────────
// ALARM SCREEN – Smart wake with full-night microphone recording
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Animated, { useSharedValue, withRepeat, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { useSleepRecorder } from '../../src/hooks/useSleepRecorder';
import { useSmartAlarm }    from '../../src/hooks/useSmartAlarm';
import { minToTime, formatDur } from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';
import { isHealthAvailable, requestHealthPermissions } from '../../src/utils/healthKit';
import TimePicker from '../../src/components/TimePicker';

const T = {
  bg:'#060914', surface:'#0C1220', elevated:'#111A2E',
  border:'rgba(255,255,255,.06)',
  accent:'#5EE7B7', accentLo:'rgba(94,231,183,.1)',
  gold:'#F0B952',   goldLo:'rgba(240,185,82,.1)',
  blue:'#4FA3E0',
  red:'#E05C5C',    redLo:'rgba(224,92,92,.1)',
  text:'#E2EAF4', sub:'#7A96B8', muted:'#3A4F6A',
};

const PHASE_COLORS = { deep:'#1E3A8A', light:'#4FA3E0', rem:'#5EE7B7', awake:'#E05C5C' };
const SMART_OPTS   = [15, 30, 45];

export default function AlarmScreen() {
  const recorder = useSleepRecorder();
  const alarm    = useSmartAlarm();

  const [newTime,   setNewTime]   = useState('07:00');
  const [smartWake, setSmartWake] = useState(true);
  const [smartMins, setSmartMins] = useState(30);

  // Load persisted alarms on focus
  useFocusEffect(useCallback(() => {
    Storage.getAlarms().then(saved => { if (saved.length) alarm.setAlarms(saved); });
  }, []));

  // Feed live RMS to smart alarm checker
  useEffect(() => {
    if (!recorder.isRecording) return;
    alarm.checkSmartWake(recorder.samples.slice(-20).map(s => s.rms));
  }, [recorder.samples]);

  // Pulse animation when ringing
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = alarm.ringing
      ? withRepeat(withTiming(1.04, { duration: 600 }), -1, true)
      : 1;
  }, [alarm.ringing]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const addAlarm = async () => {
    const [h, m] = newTime.split(':').map(Number);
    const fireAt = h * 60 + m;
    const entry = {
      id: Date.now(),
      fireAt,
      label: `Vekking ${newTime}`,
      smartWakeEnabled: smartWake,
      smartWakeStart: fireAt - smartMins,
      fired: false,
      smartFired: false,
    };
    const scheduled = await alarm.scheduleAlarm(entry);
    const next = [...alarm.alarms, scheduled];
    alarm.setAlarms(next);
    await Storage.saveAlarms(next);
  };

  const removeAlarm = async (id) => {
    const hit = alarm.alarms.find(a => a.id === id);
    if (hit?.notifId) {
      await Notifications.cancelScheduledNotificationAsync(hit.notifId).catch(() => {});
    }
    const next = alarm.alarms.filter(a => a.id !== id);
    alarm.setAlarms(next);
    await Storage.saveAlarms(next);
  };

  const promptHealth = () => {
    if (!isHealthAvailable()) {
      Alert.alert(
        'Apple Health ikke tilgjengelig',
        'Integrasjon med Apple Health krever en native build (EAS Build). Kjør:\n\nnpm install react-native-health\nnpx expo prebuild\n\nAkselerometer er allerede aktivt.',
        [{ text: 'OK' }],
      );
      return;
    }
    requestHealthPermissions().then(granted => {
      Alert.alert(
        granted ? 'Tilgang innvilget' : 'Tilgang avslått',
        granted
          ? 'Pulsmålinger fra Apple Watch vil bli brukt under neste opptak.'
          : 'Gå til Innstillinger → Helse → Optimal Slepp for å gi tilgang.',
        [{ text: 'OK' }],
      );
    });
  };

  const depthPct   = Math.round(recorder.depth * 100);
  const depthColor = recorder.depth > 0.65 ? T.accent : recorder.depth > 0.35 ? T.gold : T.blue;
  const depthLabel = recorder.depth > 0.65 ? 'Lett søvn' : recorder.depth > 0.35 ? 'Mellom' : 'Dyp søvn';

  const SIGNAL_ICONS = { microphone: '🎤', accelerometer: '📱', heartRate: '❤️' };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }}>
      <ScrollView contentContainerStyle={{ padding:20 }}>
        <Text style={{ fontSize:26, fontWeight:'800', color:T.text, marginBottom:4 }}>Vekkerklokke</Text>
        <Text style={{ fontSize:14, color:T.sub, marginBottom:24 }}>Smart oppvåkning med søvnanalyse</Text>

        {/* ── Ringing overlay ── */}
        {alarm.ringing && (
          <Animated.View style={[pulseStyle, { marginBottom:20 }]}>
            <TouchableOpacity
              onPress={alarm.stopAlarm}
              style={{ backgroundColor:T.red, borderRadius:20, padding:24, alignItems:'center' }}>
              <Text style={{ fontSize:32 }}>⏹</Text>
              <Text style={{ fontSize:20, fontWeight:'800', color:'white', marginTop:4 }}>Stopp alarm</Text>
              {alarm.currentAlarm && (
                <Text style={{ fontSize:13, color:'rgba(255,255,255,.7)', marginTop:4 }}>
                  {alarm.currentAlarm.label}
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Legg til alarm ── */}
        <View style={[styles.card, { marginBottom:16 }]}>
          <Text style={{ fontSize:11, color:T.muted, letterSpacing:1, fontWeight:'600', marginBottom:14 }}>
            NY ALARM
          </Text>

          <View style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:16 }}>
            <View style={{ flex:1 }}>
              <TimePicker label="VEKKETID" value={newTime} onChange={setNewTime} />
            </View>
            <TouchableOpacity onPress={addAlarm} style={styles.addBtn}>
              <Text style={{ fontSize:13, fontWeight:'700', color:'#060914' }}>+ Legg til</Text>
            </TouchableOpacity>
          </View>

          {/* Smart wake toggle */}
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: smartWake ? 12 : 0 }}>
            <View>
              <Text style={{ fontSize:13, fontWeight:'600', color:T.text }}>Smart oppvåkning</Text>
              <Text style={{ fontSize:11, color:T.muted, marginTop:2 }}>Vekkes i lett søvn innenfor vinduet</Text>
            </View>
            <Switch
              value={smartWake}
              onValueChange={setSmartWake}
              trackColor={{ false:T.elevated, true:T.accent }}
              thumbColor="white"
              ios_backgroundColor={T.elevated}
            />
          </View>

          {smartWake && (
            <View style={{ flexDirection:'row', gap:8 }}>
              {SMART_OPTS.map(m => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setSmartMins(m)}
                  style={[styles.optBtn, smartMins === m && styles.optBtnActive]}>
                  <Text style={{ fontSize:12, fontWeight:'600', color: smartMins === m ? '#060914' : T.sub }}>
                    {m} min
                  </Text>
                </TouchableOpacity>
              ))}
              <Text style={{ fontSize:11, color:T.muted, alignSelf:'center', marginLeft:4 }}>før alarm</Text>
            </View>
          )}
        </View>

        {/* ── Aktive alarmer ── */}
        {alarm.alarms.length > 0 && (
          <View style={[styles.card, { marginBottom:16 }]}>
            <Text style={{ fontSize:11, color:T.muted, letterSpacing:1, fontWeight:'600', marginBottom:14 }}>
              AKTIVE ALARMER
            </Text>
            {alarm.alarms.map((a, i) => (
              <View
                key={a.id}
                style={[
                  { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
                  i < alarm.alarms.length - 1 && { paddingBottom:12, marginBottom:12, borderBottomWidth:1, borderBottomColor:T.border },
                ]}>
                <View>
                  <Text style={{ fontSize:20, fontWeight:'700', color:T.text }}>
                    {minToTime(a.fireAt)}
                  </Text>
                  <Text style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                    {a.smartWakeEnabled
                      ? `Smart: ${minToTime(a.smartWakeStart)} – ${minToTime(a.fireAt)}`
                      : 'Fast alarm'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeAlarm(a.id)} hitSlop={10}>
                  <View style={{ width:28, height:28, borderRadius:8, backgroundColor:T.redLo, alignItems:'center', justifyContent:'center' }}>
                    <Text style={{ fontSize:16, color:T.red }}>×</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── Søvnopptak ── */}
        <View style={[styles.card, {
          backgroundColor: recorder.isRecording ? T.accentLo : T.surface,
          borderColor: recorder.isRecording ? `${T.accent}40` : T.border,
          marginBottom:16,
        }]}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom: recorder.isRecording ? 16 : 0 }}>
            <View style={{ flex:1, marginRight:12 }}>
              <Text style={{ fontSize:15, fontWeight:'600', color:T.text, marginBottom:4 }}>🎤 Søvnopptak</Text>
              <Text style={{ fontSize:12, color:T.muted, lineHeight:18 }}>
                {recorder.isRecording
                  ? `Tar opp – ${recorder.samples.length} samples (${formatDur(Math.round(recorder.samples.length / 6))} inn i natten)`
                  : 'Start opptak ved leggetid. Mikrofonen analyserer søvndybde hele natten.'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={recorder.isRecording ? recorder.stopRecording : recorder.startRecording}
              style={{
                paddingHorizontal:16, paddingVertical:8, borderRadius:10,
                backgroundColor: recorder.isRecording ? T.redLo : T.accentLo,
                borderWidth:1,
                borderColor: recorder.isRecording ? `${T.red}40` : `${T.accent}40`,
              }}>
              <Text style={{ fontSize:13, fontWeight:'600', color: recorder.isRecording ? T.red : T.accent }}>
                {recorder.isRecording ? 'Stopp' : 'Start'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Active signal sources */}
          {!recorder.isRecording && (
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:12 }}>
              <View style={{ flexDirection:'row', gap:6 }}>
                {recorder.activeSignals.map(sig => (
                  <View key={sig} style={[styles.sigBadge, sig === 'heartRate' && { borderColor:`${T.red}50`, backgroundColor:`${T.red}10` }]}>
                    <Text style={{ fontSize:11 }}>{SIGNAL_ICONS[sig]}</Text>
                    <Text style={{ fontSize:10, color: sig === 'heartRate' ? T.red : T.accent }}>
                      {sig === 'microphone' ? 'Mikrofon' : sig === 'accelerometer' ? 'Bevegelse' : 'Puls'}
                    </Text>
                  </View>
                ))}
              </View>
              {!recorder.healthReady && (
                <TouchableOpacity onPress={promptHealth} style={styles.healthBtn}>
                  <Text style={{ fontSize:11, color:T.sub }}>+ Legg til puls</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {recorder.isRecording && (
            <>
              <Text style={{ fontSize:10, color:T.muted, letterSpacing:1, marginBottom:6 }}>
                SØVNDYBDE  ·  {depthLabel.toUpperCase()}
              </Text>
              <View style={{ height:8, backgroundColor:T.elevated, borderRadius:4, overflow:'hidden', marginBottom:4 }}>
                <View style={{ width:`${depthPct}%`, height:'100%', backgroundColor:depthColor, borderRadius:4 }} />
              </View>
              <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
                <Text style={{ fontSize:9, color:T.muted }}>DYPSØVN</Text>
                <Text style={{ fontSize:9, color:T.muted }}>LETT SØVN</Text>
              </View>

              <View style={{ flexDirection:'row', alignItems:'flex-end', height:30, marginTop:12, gap:2 }}>
                {recorder.samples.slice(-30).map((sm, i) => (
                  <View
                    key={i}
                    style={{
                      flex:1,
                      height: Math.max(4, Math.min(30, sm.rms * 3000)),
                      backgroundColor: depthColor,
                      borderRadius:2,
                      opacity: 0.5 + i * 0.016,
                    }}
                  />
                ))}
              </View>
              <Text style={{ fontSize:9, color:T.muted, marginTop:4 }}>LIVE LYDNIVÅ – SISTE 5 MIN</Text>
            </>
          )}
        </View>

        {/* ── Analyseresultat ── */}
        {recorder.analysis && (
          <View style={[styles.card, { borderColor:`${T.accent}40`, marginBottom:16 }]}>
            <Text style={{ fontSize:11, color:T.muted, letterSpacing:1, fontWeight:'600', marginBottom:12 }}>
              SØVNANALYSE FRA I NATT
            </Text>
            <View style={{ flexDirection:'row', gap:10, marginBottom:14 }}>
              {[
                ['VARIGHET', formatDur(recorder.analysis.duration), T.accent],
                ['SYKLUSER', `${recorder.analysis.cycles}×`,        T.text],
                ['KVALITET', `${recorder.analysis.quality}%`,        recorder.analysis.quality >= 75 ? T.accent : T.gold],
              ].map(([l, v, c]) => (
                <View key={l} style={{ flex:1, backgroundColor:T.elevated, borderRadius:12, padding:12 }}>
                  <Text style={{ fontSize:9, color:T.muted, letterSpacing:1, marginBottom:4 }}>{l}</Text>
                  <Text style={{ fontSize:20, fontWeight:'700', color:c }}>{v}</Text>
                </View>
              ))}
            </View>

            {/* Phase bar chart using p.phase for colors */}
            <Text style={{ fontSize:10, color:T.muted, marginBottom:6 }}>SØVNKURVE (siste natt)</Text>
            <View style={{ flexDirection:'row', alignItems:'flex-end', height:50, gap:1 }}>
              {recorder.analysis.phases.filter((_,i) => i % 12 === 0).map((p, i) => (
                <View
                  key={i}
                  style={{
                    flex:1,
                    height: Math.max(4, (1 - p.depth) * 46 + 4),
                    backgroundColor: PHASE_COLORS[p.phase] ?? T.blue,
                    borderRadius:2,
                    opacity:0.85,
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:4 }}>
              <Text style={{ fontSize:9, color:T.muted }}>{minToTime(recorder.analysis.sleepStart)}</Text>
              <Text style={{ fontSize:9, color:T.muted }}>{minToTime(recorder.analysis.sleepEnd)}</Text>
            </View>
          </View>
        )}

        {/* ── Slik fungerer det ── */}
        <View style={[styles.card, { backgroundColor:T.goldLo, borderColor:`${T.gold}30` }]}>
          <Text style={{ fontSize:13, fontWeight:'600', color:T.gold, marginBottom:8 }}>💡 Slik fungerer det</Text>
          <Text style={{ fontSize:12, color:T.sub, lineHeight:20 }}>
            Start opptak når du legger deg. Mikrofonen sampler lydnivå hvert 10. sekund hele natten. Appen finner søvnsyklusene dine og vekker deg i lett søvn innenfor alarmvinduet. Legg telefonen ved siden av sengen med skjermen ned.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor:T.surface,
    borderWidth:1,
    borderColor:T.border,
    borderRadius:20,
    padding:18,
    marginBottom:12,
  },
  addBtn: {
    paddingVertical:10,
    paddingHorizontal:16,
    borderRadius:12,
    backgroundColor:T.accent,
  },
  optBtn: {
    paddingVertical:6,
    paddingHorizontal:12,
    borderRadius:8,
    backgroundColor:T.elevated,
    borderWidth:1,
    borderColor:T.border,
  },
  optBtnActive: {
    backgroundColor:T.accent,
    borderColor:T.accent,
  },
  sigBadge: {
    flexDirection:'row', alignItems:'center', gap:4,
    paddingVertical:4, paddingHorizontal:8, borderRadius:8,
    backgroundColor:`${T.accent}10`, borderWidth:1, borderColor:`${T.accent}40`,
  },
  healthBtn: {
    paddingVertical:5, paddingHorizontal:10, borderRadius:8,
    backgroundColor:T.elevated, borderWidth:1, borderColor:T.border,
  },
});
