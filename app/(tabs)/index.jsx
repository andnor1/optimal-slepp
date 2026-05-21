// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue, withRepeat, withTiming, useAnimatedStyle,
} from 'react-native-reanimated';
import { EmptyState } from '../../src/components/EmptyState';
import {
  toMin, nowMin, minToTime, minToDate, formatDur,
  melatoninLevel,
  optimizeSleep, calibrateFromLog, parseWindow,
} from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';
import { loadSettings, DEFAULT_SETTINGS } from '../../src/utils/settings';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: '#060914', surface: '#0C1220', elevated: '#111A2E',
  border: 'rgba(255,255,255,.06)',
  accent: '#5EE7B7', accentLo: 'rgba(94,231,183,.12)',
  gold: '#F0B952', goldLo: 'rgba(240,185,82,.12)',
  blue: '#4FA3E0',
  red: '#E05C5C',
  text: '#E2EAF4', sub: '#7A96B8', muted: '#3A4F6A',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function friendlyDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}`;
}

// ─── Melatonin ring (SVG) ─────────────────────────────────────────────────────
function MelRing({ shift = 0, amp = 1.0, size = 60 }) {
  const now = new Date().getHours() + new Date().getMinutes() / 60;
  const half = size / 2;

  const points = Array.from({ length: 48 }, (_, i) => {
    const h = i / 2;
    const mel = melatoninLevel(h, shift, amp) / 100;
    const angle = (h / 24) * 2 * Math.PI - Math.PI / 2;
    const r = half * (0.35 + mel * 0.4);
    return [half + r * Math.cos(angle), half + r * Math.sin(angle)];
  });

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + 'Z';

  const nowAngle = (now / 24) * 2 * Math.PI - Math.PI / 2;
  const nowMel = melatoninLevel(Math.floor(now), shift, amp) / 100;
  const nowR = half * (0.35 + nowMel * 0.4);
  const nx = half + nowR * Math.cos(nowAngle);
  const ny = half + nowR * Math.sin(nowAngle);

  return (
    <Svg width={size} height={size}>
      <Circle cx={half} cy={half} r={size * 0.17} fill={T.elevated} />
      <Path d={d} fill={`${T.accent}20`} stroke={T.accent} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={nx} cy={ny} r={4} fill={T.accent} />
      <Circle cx={nx} cy={ny} r={8} fill={`${T.accent}30`} />
    </Svg>
  );
}

// ─── Quality arc (SVG) ───────────────────────────────────────────────────────
function QArc({ value }) {
  const col = value >= 75 ? T.accent : value >= 50 ? T.blue : T.gold;
  const r = 20, cx = 26, circ = 2 * Math.PI * r;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Svg width={52} height={52} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={cx} cy={cx} r={r} fill="none" stroke={T.elevated} strokeWidth={4} />
        <Circle cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth={4}
          strokeDasharray={`${(value / 100) * circ} ${circ}`} strokeLinecap="round" />
      </Svg>
      <View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: col, lineHeight: 24 }}>{value}%</Text>
        <Text style={{ fontSize: 10, color: T.muted, letterSpacing: 1 }}>QUALITY</Text>
      </View>
    </View>
  );
}

// ─── Micro components ─────────────────────────────────────────────────────────
function Card({ children, accentColor, style }) {
  return (
    <View style={[
      styles.card,
      accentColor && { borderLeftWidth: 3, borderLeftColor: accentColor },
      style,
    ]}>
      {children}
    </View>
  );
}

function Pill({ children, color = T.accent }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: `${color}18`, borderWidth: 1, borderColor: `${color}30`,
      borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color, fontWeight: '500' }}>{children}</Text>
    </View>
  );
}

function StatBox({ label, value, color = T.text }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function TimeBar({ sleepStart, sleepEnd, winStart, winEnd }) {
  const span = winEnd - winStart;
  const leftPct = ((sleepStart - winStart) / span) * 100;
  const widthPct = ((sleepEnd - sleepStart) / span) * 100;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ height: 5, backgroundColor: T.elevated, borderRadius: 3, overflow: 'hidden' }}>
        <View style={{
          position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`,
          height: '100%', borderRadius: 3,
          backgroundColor: T.accent,
        }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={styles.mono9}>{minToTime(winStart)}</Text>
        <Text style={styles.mono9}>{minToTime(winEnd)}</Text>
      </View>
    </View>
  );
}

const ALL_HOME_TIPS = [
  { icon:'💡', title:'Dim the lights',      text:'Reduce light now to let melatonin rise naturally. Avoid bright ceiling lights.' },
  { icon:'📱', title:'Put away your screen', text:'Blue light delays DLMO by up to 1.5 hours. Switch to night mode or use Night Shift.' },
  { icon:'☀️', title:'Get morning light',   text:'Morning light sets the circadian clock. Step outside for 10 min within 1h of waking.' },
  { icon:'☕', title:'Caffeine curfew',      text:'Caffeine has a 5–6h half-life. After 2–3 PM it will still be in your system at midnight.' },
  { icon:'😴', title:'Power nap window',    text:'The afternoon dip (13–15h) is a natural mini sleep window. 20 minutes is optimal.' },
  { icon:'🌡️', title:'Cool your room',      text:'A room temperature of 18–20 °C helps your core temperature drop and deepen sleep.' },
  { icon:'🧘', title:'Wind down now',        text:'A 10-minute relaxation routine before bed reduces cortisol and speeds sleep onset.' },
  { icon:'💧', title:'Hydrate before 8 PM', text:'Stop liquids 2h before sleep to prevent nighttime awakenings. Hydrate during the day instead.' },
];

function RotatingTip({ hour, animate = true }) {
  const [idx, setIdx] = useState(0);
  const opacity = useSharedValue(1);
  const tipFadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => {
      opacity.value = withTiming(0, { duration: 400 }, () => {
        opacity.value = withTiming(1, { duration: 400 });
      });
      setIdx(i => (i + 1) % ALL_HOME_TIPS.length);
    }, 30000);
    return () => clearInterval(timer);
  }, [animate]);

  const tip = ALL_HOME_TIPS[idx];
  return (
    <Animated.View style={tipFadeStyle}>
      <Card style={{ backgroundColor: T.goldLo, borderColor: `${T.gold}30`, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 24 }}>{tip.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.gold, marginBottom: 4 }}>{tip.title}</Text>
            <Text style={{ fontSize: 12, color: T.sub, lineHeight: 20 }}>{tip.text}</Text>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const [now,       setNow]       = useState(nowMin());
  const [clock,     setClock]     = useState(new Date());
  const [results,   setResults]   = useState([]);
  const [log,       setLog]       = useState([]);
  const [calib,     setCalib]     = useState({ dlmoShift: 0, amplitude: 1.0 });
  const [username,  setUsername]  = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [settings,   setSettings]   = useState(DEFAULT_SETTINGS);

  // Melatonin ring pulse – only when animations enabled
  const melPulse = useSharedValue(1);
  useEffect(() => {
    if (settings.animations) {
      melPulse.value = withRepeat(withTiming(1.08, { duration: 2200 }), -1, true);
    } else {
      melPulse.value = 1;
    }
  }, [settings.animations]);
  const melPulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: melPulse.value }] }));

  const loadData = useCallback(async () => {
    try {
      const [storedLog, windows, lastWoke, name] = await Promise.all([
        Storage.getLog(),
        Storage.getWindows(),
        Storage.getLastWoke(),
        Storage.getUsername(),
      ]);
      const cfg = await loadSettings();
      setSettings(cfg);
      setLog(storedLog);
      setUsername(name);
      const c = calibrateFromLog(storedLog);
      setCalib(c);
      if (windows?.length && lastWoke) {
        const parsed = windows.map(parseWindow);
        const lastWokeMin = toMin(lastWoke.date, lastWoke.time);
        const res = optimizeSleep(parsed, lastWokeMin, c);
        setResults(res);
      }
    } catch {
      // Storage errors are non-fatal; UI shows empty state
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    const t = setInterval(() => { setNow(nowMin()); setClock(new Date()); }, 60000);
    return () => clearInterval(t);
  }, []);

  const nowHour = clock.getHours();
  const greeting = nowHour < 5 ? 'Good night' : nowHour < 12 ? 'Good morning' : nowHour < 18 ? 'Good day' : 'Good evening';
  const timeStr = `${String(clock.getHours()).padStart(2,'0')}:${String(clock.getMinutes()).padStart(2,'0')}`;

  const nextSleep    = results.find(r => !r.skip && r.sleepStart > now);
  const currentSleep = results.find(r => !r.skip && r.sleepStart <= now && r.sleepEnd >= now);
  const isSleeping   = !!currentSleep;

  const minsToSleep  = nextSleep ? nextSleep.sleepStart - now : null;
  const hoursToSleep = minsToSleep !== null ? Math.floor(minsToSleep / 60) : null;
  const minsRem      = minsToSleep !== null ? minsToSleep % 60 : null;

  const lastEntry     = log.length ? log[log.length - 1] : null;
  const hoursAwakeNow = lastEntry ? (now - lastEntry.sleepEnd) / 60 : null;
  const restScore     = lastEntry ? Math.max(0, Math.min(100, Math.round(100 - (hoursAwakeNow || 0) * 4))) : null;
  const melNow        = melatoninLevel(nowHour, calib.dlmoShift, calib.amplitude);

  const upcoming = results.filter(r => !r.skip).slice(0, 3);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}{username ? `, ${username}` : ''}</Text>
            <Text style={styles.clock}>{timeStr}</Text>
          </View>
        </View>

        {/* ── Hero card ── */}
        {isSleeping ? (
          <Card accentColor={T.accent} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Pill color={T.accent}>Sleeping Now</Pill>
                <Text style={[styles.bigTime, { marginTop: 8 }]}>
                  {minToTime(currentSleep.sleepStart)}
                  <Text style={{ color: T.muted, fontWeight: '300' }}> → </Text>
                  {minToTime(currentSleep.sleepEnd)}
                </Text>
                <Text style={styles.cardSub}>
                  Sleeping until {minToTime(currentSleep.sleepEnd)} · {currentSleep.cycles} cycles
                </Text>
              </View>
              <Text style={{ fontSize: 36 }}>😴</Text>
            </View>
            {/* Progress bar */}
            <View style={{ height: 6, backgroundColor: T.elevated, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{
                height: '100%', borderRadius: 3, backgroundColor: T.accent,
                width: `${Math.max(0, Math.min(100, ((now - currentSleep.sleepStart) / (currentSleep.sleepEnd - currentSleep.sleepStart)) * 100))}%`,
              }} />
            </View>
          </Card>

        ) : nextSleep ? (
          <Card style={{ marginBottom: 16, backgroundColor: T.elevated }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mono10}>NEXT SLEEP</Text>
                <Text style={[styles.bigTime, { marginTop: 6 }]}>{minToTime(nextSleep.sleepStart)}</Text>
                <Text style={styles.cardSub}>
                  {friendlyDate(minToDate(nextSleep.sleepStart))} · {formatDur(nextSleep.duration)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.mono10}>IN</Text>
                <Text style={{ fontSize: 28, fontWeight: '700', color: T.accent, lineHeight: 34, marginTop: 4 }}>
                  {hoursToSleep}h{minsRem ? ` ${minsRem}m` : ''}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatBox label="CYCLES"    value={`${nextSleep.cycles}×90m`} />
              <StatBox label="QUALITY"   value={`${nextSleep.quality}%`}  color={nextSleep.quality >= 75 ? T.accent : T.gold} />
              <StatBox label="MELATONIN" value={`${nextSleep.melOnset}%`} color={nextSleep.melOnset > 60 ? T.accent : T.gold} />
            </View>
          </Card>

        ) : (
          <Card style={{ marginBottom: 16 }}>
            <EmptyState
              icon="moon"
              title="No plan yet"
              subtitle="Add sleep windows to get your personal sleep schedule"
              ctaLabel="Create sleep schedule"
              onCta={() => router.push('/(tabs)/plan')}
            />
          </Card>
        )}

        {/* ── Melatonin + Recovery ── */}
        {(settings.showMelatoninRing || settings.showRecoveryScore) && (
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            {settings.showMelatoninRing && (
              <Card style={{ flex: 1, margin: 0 }}>
                <Text style={[styles.mono10, { marginBottom: 8 }]}>MELATONIN NOW</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: T.accent }}>{melNow}%</Text>
                    <Text style={{ fontSize: 11, color: T.sub }}>{melNow > 60 ? 'Rising' : 'Low'}</Text>
                  </View>
                  <Animated.View style={melPulseStyle}>
                    <MelRing shift={calib.dlmoShift} amp={calib.amplitude} size={56} />
                  </Animated.View>
                </View>
              </Card>
            )}

            {settings.showRecoveryScore && (
              <Card style={{ flex: 1, margin: 0 }}>
                <Text style={[styles.mono10, { marginBottom: 8 }]}>RECOVERY</Text>
                {restScore !== null ? (
                  <View>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: restScore >= 70 ? T.accent : restScore >= 40 ? T.gold : T.red }}>
                      {restScore}%
                    </Text>
                    <Text style={{ fontSize: 11, color: T.sub }}>
                      {restScore >= 70 ? 'Well rested' : restScore >= 40 ? 'Moderate' : hoursAwakeNow !== null ? `${Math.round(hoursAwakeNow)}h since sleep` : ''}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: T.muted }}>Log sleep for score</Text>
                )}
              </Card>
            )}
          </View>
        )}

        {/* ── Kommende søvn ── */}
        {upcoming.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={[styles.cardSub, { marginBottom: 12, fontWeight: '600' }]}>Upcoming Sleep</Text>
            {upcoming.map((r, i) => (
              <View key={i} style={[
                { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
                i < upcoming.length - 1 && { paddingBottom: 10, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: T.border },
              ]}>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: T.text }}>
                    {minToTime(r.sleepStart)} → {minToTime(r.sleepEnd)}
                  </Text>
                  <Text style={{ fontSize: 11, color: T.muted }}>
                    {friendlyDate(minToDate(r.sleepStart))} · {formatDur(r.duration)}
                  </Text>
                </View>
                <Pill color={r.quality >= 75 ? T.accent : T.gold}>{r.quality}%</Pill>
              </View>
            ))}
          </Card>
        )}

        {/* ── Sleep hygiene tip (rotating) ── */}
        <RotatingTip hour={nowHour} animate={settings.animations} />

        {/* ── Hurtig-logg ── */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/analyse');
          }}
          style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>+ Log sleep session quickly</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.bg,
  },
  scroll: {
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 13,
    color: T.sub,
    marginBottom: 2,
  },
  clock: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.5,
    color: T.text,
    lineHeight: 44,
  },
  card: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
  },
  bigTime: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -1,
    color: T.text,
  },
  cardSub: {
    fontSize: 13,
    color: T.sub,
    marginTop: 2,
  },
  mono9: {
    fontSize: 9,
    color: T.muted,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  mono10: {
    fontSize: 10,
    color: T.muted,
    letterSpacing: 1,
    fontWeight: '600',
  },
  statBox: {
    flex: 1,
    backgroundColor: T.bg,
    borderRadius: 10,
    padding: 10,
  },
  statLabel: {
    fontSize: 9,
    color: T.muted,
    letterSpacing: 1,
    marginBottom: 2,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: T.text,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: T.accent,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#060914',
  },
  ghostBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    marginTop: 4,
  },
  ghostBtnText: {
    fontSize: 14,
    color: T.sub,
  },
});
