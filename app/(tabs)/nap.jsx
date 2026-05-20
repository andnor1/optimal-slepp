// ─────────────────────────────────────────────────────────────────────────────
// POWER NAP SCREEN
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import {
  melatoninSleepScore, calibrateFromLog, toMin,
} from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';

const T = {
  bg: '#060914', surface: '#0C1220', elevated: '#111A2E',
  border: 'rgba(255,255,255,.06)',
  accent: '#5EE7B7', accentLo: 'rgba(94,231,183,.12)',
  gold: '#F0B952', goldLo: 'rgba(240,185,82,.1)',
  blue: '#4FA3E0',
  red: '#E05C5C', redLo: 'rgba(224,92,92,.1)',
  text: '#E2EAF4', sub: '#7A96B8', muted: '#3A4F6A',
};

const DURATIONS = [
  { label: '10 min', min: 10, emoji: '⚡', desc: 'Energy boost', detail: 'Stays in stage 1–2. No grogginess – instant alertness on wake.' },
  { label: '20 min', min: 20, emoji: '😴', desc: 'Power nap', detail: 'The NASA-validated nap. Doubles alertness for up to 3 hours.' },
  { label: '90 min', min: 90, emoji: '🌙', desc: 'Full cycle', detail: 'One complete sleep cycle with REM. Best for deep recovery.' },
];

export default function NapScreen() {
  const [selIdx,  setSelIdx]  = useState(1);
  const [phase,   setPhase]   = useState('idle'); // 'idle' | 'running' | 'done'
  const [elapsed, setElapsed] = useState(0);
  const [calib,   setCalib]   = useState({ dlmoShift: 0, amplitude: 1.0 });
  const [notifId, setNotifId] = useState(null);

  const napStartRef = useRef(null);
  const timerRef    = useRef(null);

  useFocusEffect(useCallback(() => {
    Storage.getLog().then(log => setCalib(calibrateFromLog(log)));
  }, []));

  useEffect(() => () => clearInterval(timerRef.current), []);

  const hour   = new Date().getHours() + new Date().getMinutes() / 60;
  const score  = melatoninSleepScore(Math.floor(hour), calib.dlmoShift, calib.amplitude);
  const isGood = score >= 30 && score <= 60;
  const isLate = score > 70;

  const dur       = DURATIONS[selIdx];
  const totalSec  = dur.min * 60;
  const remaining = Math.max(0, totalSec - elapsed);
  const progress  = Math.min(1, elapsed / totalSec);

  const startNap = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    napStartRef.current = Date.now();
    setPhase('running');
    setElapsed(0);
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${dur.emoji} Nap complete!`,
          body: `Your ${dur.label} power nap is over. Time to wake up!`,
          sound: true,
        },
        trigger: { seconds: dur.min * 60 },
      });
      setNotifId(id);
    } catch {}
    timerRef.current = setInterval(() => {
      const secs = Math.round((Date.now() - napStartRef.current) / 1000);
      if (secs >= totalSec) {
        clearInterval(timerRef.current);
        setElapsed(totalSec);
        finishNap();
      } else {
        setElapsed(secs);
      }
    }, 1000);
  };

  const finishNap = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('done');
    try {
      const start = new Date(napStartRef.current);
      const dateStr = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
      const timeStr = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;
      const sleepStart = toMin(dateStr, timeStr);
      const log = await Storage.getLog();
      await Storage.saveLog([...log, {
        id: Date.now(), sleepStart, sleepEnd: sleepStart + dur.min, loggedAt: Date.now(), isNap: true,
      }]);
    } catch {}
  };

  const stopNap = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearInterval(timerRef.current);
    if (notifId) {
      await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
      setNotifId(null);
    }
    setPhase('idle');
    setElapsed(0);
  };

  const resetNap = () => { setPhase('idle'); setElapsed(0); };

  const minStr = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secStr = String(remaining % 60).padStart(2, '0');

  const R = 80, CX = 90, CIRC = 2 * Math.PI * R;
  const ringColor = phase === 'done' ? T.accent
    : phase === 'running' ? (dur.min === 90 ? T.blue : dur.min === 10 ? T.gold : T.accent)
    : T.muted;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Power Nap</Text>

        {/* Timing advice */}
        {phase === 'idle' && (
          isLate ? (
            <View style={[s.card, { backgroundColor: T.redLo, borderColor: `${T.red}30`, marginBottom: 16 }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.red, marginBottom: 4 }}>⚠ Late nap warning</Text>
              <Text style={{ fontSize: 12, color: T.sub, lineHeight: 20 }}>
                Melatonin is rising ({score}%). A nap now may delay tonight's sleep. Consider a 10-min nap maximum.
              </Text>
            </View>
          ) : isGood ? (
            <View style={[s.card, { backgroundColor: T.accentLo, borderColor: `${T.accent}30`, marginBottom: 16 }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.accent, marginBottom: 4 }}>✓ Ideal nap window</Text>
              <Text style={{ fontSize: 12, color: T.sub, lineHeight: 20 }}>
                You're in the afternoon dip (melatonin score {score}%). Perfect time for a power nap.
              </Text>
            </View>
          ) : (
            <View style={[s.card, { marginBottom: 16 }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.text, marginBottom: 4 }}>💡 Nap timing</Text>
              <Text style={{ fontSize: 12, color: T.sub, lineHeight: 20 }}>
                Melatonin score now: {score}%. Best nap window is the afternoon dip (score 30–60), typically 13:00–15:00.
              </Text>
            </View>
          )
        )}

        {/* Duration picker */}
        {phase === 'idle' && (
          <View style={[s.card, { marginBottom: 20 }]}>
            <Text style={[s.mono10, { marginBottom: 12 }]}>NAP DURATION</Text>
            <View style={{ gap: 10 }}>
              {DURATIONS.map((d, i) => (
                <TouchableOpacity
                  key={d.min}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelIdx(i); }}
                  style={[s.durBtn, selIdx === i && s.durBtnActive]}>
                  <Text style={{ fontSize: 22, marginRight: 12 }}>{d.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: selIdx === i ? T.accent : T.text }}>
                      {d.label} – {d.desc}
                    </Text>
                    <Text style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{d.detail}</Text>
                  </View>
                  {selIdx === i && <View style={s.checkDot} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Timer ring */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <Svg width={180} height={180}>
            <Circle cx={CX} cy={CX} r={R} fill="none" stroke={T.elevated} strokeWidth={10} />
            <Circle
              cx={CX} cy={CX} r={R} fill="none"
              stroke={ringColor} strokeWidth={10}
              strokeDasharray={`${progress * CIRC} ${CIRC}`}
              strokeLinecap="round"
              transform={`rotate(-90, ${CX}, ${CX})`}
            />
          </Svg>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            {phase === 'done' ? (
              <Text style={{ fontSize: 48 }}>✓</Text>
            ) : (
              <>
                <Text style={{ fontSize: 38, fontWeight: '800', color: T.text, letterSpacing: -1 }}>
                  {minStr}:{secStr}
                </Text>
                <Text style={{ fontSize: 12, color: T.muted }}>
                  {phase === 'running' ? 'remaining' : dur.label}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Action buttons */}
        {phase === 'idle' && (
          <TouchableOpacity onPress={startNap} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>😴 Start {dur.label} Nap</Text>
          </TouchableOpacity>
        )}
        {phase === 'running' && (
          <TouchableOpacity onPress={stopNap} style={[s.primaryBtn, { backgroundColor: T.red }]}>
            <Text style={[s.primaryBtnText, { color: 'white' }]}>⏹ Stop Nap</Text>
          </TouchableOpacity>
        )}
        {phase === 'done' && (
          <View style={{ gap: 12 }}>
            <View style={[s.card, { backgroundColor: T.accentLo, borderColor: `${T.accent}30`, alignItems: 'center', paddingVertical: 24 }]}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🎉</Text>
              <Text style={{ fontSize: 17, fontWeight: '700', color: T.accent, marginBottom: 4 }}>Nap complete!</Text>
              <Text style={{ fontSize: 13, color: T.sub }}>{dur.label} logged to your sleep history.</Text>
            </View>
            <TouchableOpacity onPress={resetNap} style={s.ghostBtn}>
              <Text style={s.ghostBtnText}>Start another nap</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Science note */}
        {phase !== 'running' && (
          <View style={[s.card, { backgroundColor: T.goldLo, borderColor: `${T.gold}30`, marginTop: 24 }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.gold, marginBottom: 8 }}>💡 Science of napping</Text>
            <Text style={{ fontSize: 12, color: T.sub, lineHeight: 20 }}>
              A 20-minute nap improves alertness by 100% and motor performance by 34% (NASA study). The ideal window is the natural afternoon dip — typically 13:00–15:00. Naps after 17:00 can delay nightly sleep onset.
            </Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  title:  { fontSize: 26, fontWeight: '800', color: T.text, marginBottom: 20 },
  mono10: { fontSize: 10, color: T.muted, letterSpacing: 1, fontWeight: '600' },
  card: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: 20, padding: 18,
  },
  durBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.elevated, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: T.border,
  },
  durBtnActive: { borderColor: `${T.accent}50`, backgroundColor: T.accentLo },
  checkDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.accent },
  primaryBtn: {
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: T.accent, alignItems: 'center',
    shadowColor: T.accent, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#060914' },
  ghostBtn: {
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: T.border, alignItems: 'center',
  },
  ghostBtnText: { fontSize: 14, color: T.sub },
});
