// ─────────────────────────────────────────────────────────────────────────────
// ANALYSIS SCREEN  –  sleep history, statistics and quick log
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Alert, Share, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import ViewShot from 'react-native-view-shot';
import { EmptyState } from '../../src/components/EmptyState';
import Svg, { Circle, Path, Line, Text as SvgText } from 'react-native-svg';
import TimePicker from '../../src/components/TimePicker';
import DatePicker  from '../../src/components/DatePicker';
import {
  toMin, minToTime, minToDate, formatDur,
  melatoninLevel, calibrateFromLog, localDate,
  weeklyScore, sleepInsights,
} from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';
import { loadSettings, DEFAULT_SETTINGS } from '../../src/utils/settings';
import { useSubscription } from '../../src/hooks/useSubscription';
import PremiumGate from '../../src/components/PremiumGate';

const T = {
  bg:'#060914', surface:'#0C1220', elevated:'#111A2E',
  border:'rgba(255,255,255,.06)',
  accent:'#5EE7B7',
  gold:'#F0B952',
  blue:'#4FA3E0',
  red:'#E05C5C',
  text:'#E2EAF4', sub:'#7A96B8', muted:'#3A4F6A',
};

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function friendlyDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}`;
}

const PHASE_META = {
  deep:  { color: '#1E3A8A', label: 'Deep Sleep' },
  light: { color: '#4FA3E0', label: 'Light Sleep' },
  rem:   { color: '#5EE7B7', label: 'REM' },
  awake: { color: '#E05C5C', label: 'Awake' },
};

// ─── Sleep graph (SVG hypnogram) ──────────────────────────────────────────────
function SleepGraph({ analysis }) {
  const [svgWidth, setSvgWidth] = useState(0);
  const GH   = 130; // graph height
  const AH   = 22;  // axis height
  const PAD  = { l: 6, r: 6, t: 8, b: 0 };

  if (!analysis?.phases?.length) return null;

  // Downsample: cap at ~150 points for render performance
  const all  = analysis.phases;
  const step = Math.max(1, Math.floor(all.length / 150));
  const pts  = all.filter((_, i) => i % step === 0);
  if (pts.length < 2) return null;

  const tMin  = analysis.sleepStart;
  const tMax  = analysis.sleepEnd;
  const tSpan = tMax - tMin || 1;
  const gW    = svgWidth - PAD.l - PAD.r;
  const gH    = GH - PAD.t - PAD.b;
  const base  = PAD.t + gH;

  // depth=0 → deep sleep (near top), depth=1 → awake (near bottom)
  const xs = t  => PAD.l + ((t - tMin) / tSpan) * gW;
  const ys = d  => PAD.t + d * gH;

  // Midpoint-bezier smooth outline
  function curvePath(points) {
    if (points.length < 2) return '';
    let d = `M${xs(points[0].t).toFixed(1)},${ys(points[0].depth).toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const mx = ((xs(points[i].t) + xs(points[i+1].t)) / 2).toFixed(1);
      const my = ((ys(points[i].depth) + ys(points[i+1].depth)) / 2).toFixed(1);
      d += ` Q${xs(points[i].t).toFixed(1)},${ys(points[i].depth).toFixed(1)} ${mx},${my}`;
    }
    const l = points[points.length - 1];
    return d + ` L${xs(l.t).toFixed(1)},${ys(l.depth).toFixed(1)}`;
  }

  // Filled area for a phase group (from curve down to baseline)
  function areaPath(gPts) {
    if (!gPts.length) return '';
    let d = `M${xs(gPts[0].t).toFixed(1)},${base}`;
    d += ` L${xs(gPts[0].t).toFixed(1)},${ys(gPts[0].depth).toFixed(1)}`;
    for (let i = 1; i < gPts.length; i++) {
      d += ` L${xs(gPts[i].t).toFixed(1)},${ys(gPts[i].depth).toFixed(1)}`;
    }
    d += ` L${xs(gPts[gPts.length-1].t).toFixed(1)},${base} Z`;
    return d;
  }

  // Group consecutive same-phase points
  const groups = [];
  if (pts.length > 0) {
    let cur = { phase: pts[0].phase, pts: [pts[0]] };
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].phase === cur.phase) {
        cur.pts.push(pts[i]);
      } else {
        groups.push(cur);
        cur = { phase: pts[i].phase, pts: [pts[i]] };
      }
    }
    groups.push(cur);
  }

  // Hour ticks
  const firstTick = Math.ceil(tMin / 60) * 60;
  const hourTicks = [];
  for (let t = firstTick; t <= tMax; t += 60) hourTicks.push(t);

  // Moon icons at deepest point of each deep group
  const deepMoons = groups
    .filter(g => g.phase === 'deep' && g.pts.length > 0)
    .map(g => g.pts.reduce((a, b) => (a.depth < b.depth ? a : b)));

  return (
    <View onLayout={e => setSvgWidth(e.nativeEvent.layout.width)}>
      {svgWidth > 0 && (
        <Svg width={svgWidth} height={GH + AH}>
          {/* Phase fill areas */}
          {groups.map((g, i) => (
            <Path
              key={i}
              d={areaPath(g.pts)}
              fill={PHASE_META[g.phase].color}
              opacity={0.4}
            />
          ))}

          {/* Smooth outline */}
          <Path
            d={curvePath(pts)}
            fill="none"
            stroke={T.accent}
            strokeWidth={1.5}
          />

          {/* Cycle marker dashes */}
          {(analysis.cycleMarkers || []).map((t, i) => (
            <Line
              key={i}
              x1={xs(t).toFixed(1)} y1={PAD.t}
              x2={xs(t).toFixed(1)} y2={base}
              stroke={T.sub}
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.5}
            />
          ))}

          {/* Moon icons at deep troughs */}
          {deepMoons.map((p, i) => (
            <SvgText
              key={i}
              x={xs(p.t)}
              y={ys(p.depth) - 4}
              fontSize={11}
              textAnchor="middle"
            >
              🌙
            </SvgText>
          ))}

          {/* Baseline */}
          <Line
            x1={PAD.l} y1={base}
            x2={svgWidth - PAD.r} y2={base}
            stroke={T.border}
            strokeWidth={1}
          />

          {/* Hour labels */}
          {hourTicks.map(t => (
            <SvgText
              key={t}
              x={xs(t)}
              y={GH + AH - 4}
              fontSize={9}
              fill={T.muted}
              textAnchor="middle"
            >
              {minToTime(t)}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

// ─── Melatonin ring (SVG) ─────────────────────────────────────────────────────
function MelRing({ shift = 0, amp = 1.0, size = 160 }) {
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
      <Circle cx={nx} cy={ny} r={5} fill={T.accent} />
      <Circle cx={nx} cy={ny} r={10} fill={`${T.accent}30`} />
    </Svg>
  );
}

// ─── Quick log modal ──────────────────────────────────────────────────────────
function QuickLogModal({ visible, onSave, onClose }) {
  const [date,  setDate]  = useState(localDate(0));
  const [start, setStart] = useState('23:00');
  const [end,   setEnd]   = useState('07:00');

  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const s = toMin(date, start);
    let e = toMin(date, end);
    if (e <= s) e += 1440;
    onSave({ id: Date.now(), sleepStart: s, sleepEnd: e, loggedAt: Date.now() });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Log Sleep Session</Text>

          <View style={{ flexDirection:'row', gap:10, marginBottom:20 }}>
            <DatePicker label="DATE"     value={date}  onChange={setDate} />
            <TimePicker label="WENT TO BED" value={start} onChange={setStart} />
            <TimePicker label="WOKE UP"  value={end}   onChange={setEnd} />
          </View>

          <TouchableOpacity onPress={save} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>Save Sleep Session</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function AnalyseScreen() {
  const { isPremium } = useSubscription();
  const [log,          setLog]          = useState([]);
  const [calib,        setCalib]        = useState({ dlmoShift:0, amplitude:1.0, dataPoints:0 });
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [showLog,      setShowLog]      = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [settings,     setSettings]     = useState(DEFAULT_SETTINGS);
  const exportRef = useRef();

  const loadData = useCallback(async () => {
    const [storedLog, analysis, cfg] = await Promise.all([
      Storage.getLog(),
      Storage.getLastAnalysis(),
      loadSettings(),
    ]);
    setLog(storedLog);
    setCalib(calibrateFromLog(storedLog));
    setLastAnalysis(analysis);
    setSettings(cfg);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleSave = async (entry) => {
    const next = [...log, entry].slice(-90);
    await Storage.saveLog(next);
    setLog(next);
    setCalib(calibrateFromLog(next));
  };

  const confirmDelete = (id) => {
    Alert.alert(
      'Delete session',
      'Delete this sleep session?',
      [
        { text: 'Cancel', style:'cancel' },
        {
          text: 'Delete', style:'destructive',
          onPress: async () => {
            const next = log.filter(e => e.id !== id);
            await Storage.saveLog(next);
            setLog(next);
            setCalib(calibrateFromLog(next));
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const uri = await exportRef.current.capture();
      await Share.share({ url: uri, title: 'Weekly Sleep Report' });
    } catch {}
  };

  // ── Weekly stats ──
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7);

  const thisWeek = log.filter(e => new Date(minToDate(e.sleepStart) + 'T12:00:00') >= weekStart);
  const lastWeek = log.filter(e => { const d = new Date(minToDate(e.sleepStart) + 'T12:00:00'); return d >= lastWeekStart && d < weekStart; });
  const thisWeekAvg  = thisWeek.length ? thisWeek.reduce((a,e) => a + (e.sleepEnd - e.sleepStart), 0) / thisWeek.length : 0;
  const lastWeekAvg  = lastWeek.length ? lastWeek.reduce((a,e) => a + (e.sleepEnd - e.sleepStart), 0) / lastWeek.length : 0;

  const allDur = log.map(e => ({ dur: e.sleepEnd - e.sleepStart, date: minToDate(e.sleepStart) }));
  const bestNight  = allDur.length ? allDur.reduce((a,b) => a.dur > b.dur ? a : b) : null;
  const worstNight = allDur.length ? allDur.reduce((a,b) => a.dur < b.dur ? a : b) : null;

  let streak = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].sleepEnd - log[i].sleepStart >= 420) streak++;
    else break;
  }

  // Trend: slope of last 14 nights (min/night)
  const trend14 = log.slice(-14);
  let trend = 0;
  if (trend14.length >= 4) {
    const n = trend14.length, sumX = (n-1)*n/2;
    const sumX2 = (n-1)*n*(2*n-1)/6;
    const sumY = trend14.reduce((a,e) => a + (e.sleepEnd - e.sleepStart), 0);
    const sumXY = trend14.reduce((a,e,i) => a + i*(e.sleepEnd - e.sleepStart), 0);
    trend = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  }

  const weekScore = weeklyScore(thisWeek);
  const insights  = sleepInsights(log);

  if (log.length === 0 && !lastAnalysis) return (
    <SafeAreaView style={s.safe}>
      <View style={s.scroll}>
        <Text style={[s.title, { paddingTop: 20, marginBottom: 8 }]}>Analysis</Text>
        <EmptyState
          icon="chart"
          title="No data yet"
          subtitle="Log some sleep sessions to see patterns and statistics"
          ctaLabel="Log first session"
          onCta={() => setShowLog(true)}
        />
      </View>
      <QuickLogModal visible={showLog} onSave={handleSave} onClose={() => setShowLog(false)} />
    </SafeAreaView>
  );

  // ── Statistikk ──
  const durations  = log.map(e => e.sleepEnd - e.sleepStart);
  const avgDur     = durations.length ? durations.reduce((a,b) => a+b, 0) / durations.length : 0;
  const avgBedtime = log.length ? log.map(e => (e.sleepStart % 1440) / 60).reduce((a,b) => a+b, 0) / log.length : 0;
  const recent7    = log.slice(-7);
  const recent7avg = recent7.length ? recent7.map(e => e.sleepEnd - e.sleepStart).reduce((a,b) => a+b, 0) / recent7.length : 0;
  const chart      = log.slice(-30);
  const maxDur     = chart.length ? Math.max(...chart.map(e => e.sleepEnd - e.sleepStart)) : 1;
  const bedHH      = String(Math.floor(avgBedtime)).padStart(2,'0');
  const bedMM      = String(Math.round((avgBedtime % 1) * 60)).padStart(2,'0');

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >

        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingTop:20, marginBottom:16 }}>
          <Text style={s.title}>Analysis</Text>
          <View style={{ flexDirection:'row', gap:8 }}>
            {log.length > 0 && (
              <TouchableOpacity onPress={handleExport} style={s.logBtn}>
                <Text style={s.logBtnText}>↑ Export</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowLog(true); }}
              style={s.logBtn}>
              <Text style={s.logBtnText}>+ Log session</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Weekly stats ── */}
        {log.length > 0 && (
          <ViewShot ref={exportRef} options={{ format:'png', quality:1 }} style={{ backgroundColor:T.bg }}>
            <View style={[s.card, { marginBottom:16 }]}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <Text style={s.mono10}>THIS WEEK</Text>
                {trend14.length >= 4 && (
                  <Text style={{ fontSize:11, fontWeight:'600',
                    color: trend > 4 ? T.accent : trend < -4 ? T.red : T.gold }}>
                    {trend > 4 ? '↑ Improving' : trend < -4 ? '↓ Declining' : '→ Stable'}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection:'row', gap:10, marginBottom:12 }}>
                {[
                  ['THIS WEEK', formatDur(Math.round(thisWeekAvg)), thisWeekAvg >= settings.targetSleepHours*60 ? T.accent : thisWeekAvg >= settings.targetSleepHours*48 ? T.gold : T.red],
                  ['LAST WEEK', lastWeekAvg ? formatDur(Math.round(lastWeekAvg)) : '–', lastWeekAvg >= settings.targetSleepHours*60 ? T.accent : lastWeekAvg >= settings.targetSleepHours*48 ? T.gold : T.red],
                  ['7H+ STREAK', `${streak}`, streak >= 3 ? T.accent : streak >= 1 ? T.gold : T.muted],
                ].map(([l,v,c]) => (
                  <View key={l} style={s.statBox}>
                    <Text style={s.statLabel}>{l}</Text>
                    <Text style={[s.statValue, { color:c }]}>{v}{l==='7H+ STREAK'&&streak>0?' 🔥':''}</Text>
                  </View>
                ))}
              </View>

              {bestNight && (
                <View style={{ flexDirection:'row', gap:10 }}>
                  <View style={[s.statBox, { flex:1 }]}>
                    <Text style={s.statLabel}>BEST NIGHT</Text>
                    <Text style={[s.statValue, { fontSize:13, color:T.accent }]}>
                      {formatDur(bestNight.dur)} · {friendlyDate(bestNight.date)}
                    </Text>
                  </View>
                  <View style={[s.statBox, { flex:1 }]}>
                    <Text style={s.statLabel}>WORST NIGHT</Text>
                    <Text style={[s.statValue, { fontSize:13, color:T.red }]}>
                      {formatDur(worstNight.dur)} · {friendlyDate(worstNight.date)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </ViewShot>
        )}

        {/* ── Weekly score – premium ── */}
        {!isPremium && (
          <PremiumGate feature="Weekly Sleep Score & advanced statistics" />
        )}
        {isPremium && weekScore && (
          <View style={[s.card, { marginBottom:16 }]}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <Text style={s.mono10}>WEEKLY SLEEP SCORE</Text>
              <View style={{ backgroundColor: weekScore.grade==='A'?`${T.accent}20`:weekScore.grade==='B'?`${T.blue}20`:weekScore.grade==='F'?`${T.red}20`:`${T.gold}20`, borderRadius:8, paddingHorizontal:10, paddingVertical:4 }}>
                <Text style={{ fontSize:18, fontWeight:'800', color: weekScore.grade==='A'?T.accent:weekScore.grade==='B'?T.blue:weekScore.grade==='F'?T.red:T.gold }}>
                  {weekScore.grade}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection:'row', alignItems:'center', gap:14, marginBottom:12 }}>
              <View style={{ position:'relative', width:72, height:72, alignItems:'center', justifyContent:'center' }}>
                <View style={{ position:'absolute', width:72, height:72, borderRadius:36, borderWidth:6, borderColor:T.elevated }} />
                <View style={{ position:'absolute', width:72, height:72, borderRadius:36, borderWidth:6, borderColor:'transparent',
                  borderTopColor: weekScore.score>=70?T.accent:weekScore.score>=45?T.gold:T.red,
                  transform:[{rotate:`${(weekScore.score/100)*360-90}deg`}] }} />
                <Text style={{ fontSize:20, fontWeight:'800', color:T.text }}>{weekScore.score}</Text>
              </View>
              <View style={{ flex:1, gap:6 }}>
                {[
                  ['Duration',    weekScore.durScore,  40],
                  ['Consistency', weekScore.consScore, 30],
                  ['Coverage',    weekScore.covScore,  30],
                ].map(([label, val, max]) => (
                  <View key={label}>
                    <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:2 }}>
                      <Text style={{ fontSize:10, color:T.muted }}>{label}</Text>
                      <Text style={{ fontSize:10, color:T.sub }}>{val}/{max}</Text>
                    </View>
                    <View style={{ height:4, backgroundColor:T.elevated, borderRadius:2, overflow:'hidden' }}>
                      <View style={{ height:'100%', width:`${(val/max)*100}%`, backgroundColor:T.accent, borderRadius:2 }} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── Insights – premium ── */}
        {isPremium && insights.length > 0 && (
          <View style={[s.card, { marginBottom:16, borderLeftWidth:3, borderLeftColor:T.blue }]}>
            <Text style={[s.mono10, { marginBottom:12 }]}>PERSONAL INSIGHTS</Text>
            {insights.map((insight, i) => (
              <View key={i} style={[{ flexDirection:'row', gap:10, alignItems:'flex-start' }, i > 0 && { marginTop:10, paddingTop:10, borderTopWidth:1, borderTopColor:T.border }]}>
                <Text style={{ fontSize:16 }}>💡</Text>
                <Text style={{ fontSize:13, color:T.sub, flex:1, lineHeight:20 }}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Siste innspilte natt – premium ── */}
        {isPremium && lastAnalysis && (
          <View style={[s.card, { marginBottom:16 }]}>
            <Text style={[s.mono10, { marginBottom:12 }]}>LAST RECORDED NIGHT</Text>

            <View style={{ flexDirection:'row', gap:10, marginBottom:14 }}>
              {[
                ['DURATION', formatDur(lastAnalysis.duration), lastAnalysis.duration >= 420 ? T.accent : lastAnalysis.duration >= 300 ? T.gold : T.red],
                ['CYCLES',   String(lastAnalysis.cycles), T.blue],
                ['QUALITY',  `${lastAnalysis.quality}%`, lastAnalysis.quality >= 70 ? T.accent : lastAnalysis.quality >= 50 ? T.gold : T.red],
              ].map(([l, v, c]) => (
                <View key={l} style={s.statBox}>
                  <Text style={s.statLabel}>{l}</Text>
                  <Text style={[s.statValue, { color: c }]}>{v}</Text>
                </View>
              ))}
            </View>

            <SleepGraph analysis={lastAnalysis} />

            <View style={{ flexDirection:'row', justifyContent:'center', flexWrap:'wrap', gap:14, marginTop:12 }}>
              {Object.entries(PHASE_META).map(([phase, { color, label }]) => (
                <View key={phase} style={{ flexDirection:'row', alignItems:'center', gap:5 }}>
                  <View style={{ width:8, height:8, borderRadius:2, backgroundColor:color }} />
                  <Text style={{ fontSize:10, color:T.sub }}>{label}</Text>
                </View>
              ))}
            </View>

            {lastAnalysis.signals?.length > 0 && (
              <Text style={{ fontSize:10, color:T.muted, textAlign:'center', marginTop:8 }}>
                {lastAnalysis.signals.map(s =>
                  s === 'microphone' ? '🎤' : s === 'accelerometer' ? '📱' : '❤️'
                ).join(' + ')}
                {' '}{ { 1:'microphone', 2:'microphone + motion', 3:'all signals' }[lastAnalysis.signals.length] }
              </Text>
            )}
          </View>
        )}

        {/* ── Kalibrering ── */}
        {calib.dataPoints >= 3 && (
          <View style={[s.card, { borderLeftWidth:3, borderLeftColor:T.accent, marginBottom:16 }]}>
            <Text style={[s.mono10, { marginBottom:12 }]}>PERSONAL CALIBRATION</Text>
            <View style={{ flexDirection:'row', gap:10, marginBottom:8 }}>
              {[
                ['NIGHTS',     calib.dataPoints,                                                     T.accent],
                ['DLMO PHASE', `${calib.dlmoShift >= 0 ? '+' : ''}${Math.round(calib.dlmoShift * 10) / 10}h`, T.text],
                ['AMPLITUDE', `${Math.round(calib.amplitude * 100)}%`, calib.amplitude > 0.8 ? T.accent : T.gold],
              ].map(([l, v, c]) => (
                <View key={l} style={s.statBox}>
                  <Text style={s.statLabel}>{l}</Text>
                  <Text style={[s.statValue, { color:c }]}>{v}</Text>
                </View>
              ))}
            </View>
            {calib.dataPoints < 7 && (
              <Text style={{ fontSize:12, color:T.muted }}>
                {7 - calib.dataPoints} nights until good calibration
              </Text>
            )}
          </View>
        )}

        {log.length > 0 && (
          <>
            {/* ── Statistikk-grid ── */}
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:12, marginBottom:16 }}>
              {[
                ['AVG SLEEP',     formatDur(Math.round(avgDur)),     avgDur >= 420 ? T.accent : avgDur >= 300 ? T.gold : T.red],
                ['LAST 7 NIGHTS', formatDur(Math.round(recent7avg)), recent7avg >= 420 ? T.accent : recent7avg >= 300 ? T.gold : T.red],
                ['AVG BEDTIME',   `${bedHH}:${bedMM}`,               T.sub],
                ['LOGGED NIGHTS', String(log.length),                 T.text],
              ].map(([l, v, c]) => (
                <View key={l} style={[s.card, { flex:1, minWidth:'45%', margin:0 }]}>
                  <Text style={s.statLabel}>{l}</Text>
                  <Text style={[s.statValue, { fontSize:22, color:c }]}>{v}</Text>
                </View>
              ))}
            </View>

            {/* ── Søvnlengde-graf ── */}
            <View style={s.card}>
              <Text style={[s.mono10, { marginBottom:14 }]}>
                SLEEP DURATION – LAST {chart.length} NIGHTS
              </Text>
              <View style={{ flexDirection:'row', alignItems:'flex-end', height:80, gap:4 }}>
                {chart.map((e, i) => {
                  const dur = e.sleepEnd - e.sleepStart;
                  const pct = (dur / maxDur) * 100;
                  const col = dur >= 420 ? T.accent : dur >= 300 ? T.gold : T.red;
                  return (
                    <View key={i} style={{ flex:1, alignItems:'center', gap:4 }}>
                      <View style={{
                        width:'100%', height: Math.max(4, (pct / 100) * 72),
                        backgroundColor: col, borderRadius:3, opacity:0.85,
                      }} />
                      <Text style={{ fontSize:8, color:T.muted }}>
                        {minToDate(e.sleepStart).slice(8)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:12 }}>
                {[[T.accent,'7h+ good'],[T.gold,'5-7h ok'],[T.red,'Under 5h']].map(([c,l]) => (
                  <View key={l} style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                    <View style={{ width:8, height:8, borderRadius:4, backgroundColor:c }} />
                    <Text style={{ fontSize:10, color:T.sub }}>{l}</Text>
                  </View>
                ))}
              </View>
              {/* Trend vs recommended */}
              {chart.length >= 4 && (() => {
                const avg30    = chart.reduce((a,e) => a + (e.sleepEnd-e.sleepStart), 0) / chart.length;
                const targetMin = settings.targetSleepHours * 60;
                const vsTarget  = avg30 - targetMin;
                return (
                  <View style={{ marginTop:10, paddingTop:10, borderTopWidth:1, borderTopColor:T.border }}>
                    <Text style={{ fontSize:11, color:T.sub }}>
                      Your {chart.length}-night average: {' '}
                      <Text style={{ fontWeight:'700', color: avg30>=targetMin?T.accent:avg30>=targetMin*0.8?T.gold:T.red }}>
                        {formatDur(Math.round(avg30))}
                      </Text>
                      {'  '}
                      <Text style={{ color: vsTarget>=0?T.accent:T.red }}>
                        {vsTarget>=0?'+':''}{formatDur(Math.abs(Math.round(vsTarget)))} vs goal {settings.targetSleepHours}h
                      </Text>
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* ── Melatonin-ring ── */}
            <View style={s.card}>
              <Text style={[s.mono10, { marginBottom:14 }]}>YOUR MELATONIN CURVE (24H)</Text>
              <View style={{ alignItems:'center', marginBottom:12 }}>
                <MelRing shift={calib.dlmoShift} amp={calib.amplitude} size={160} />
              </View>
              <Text style={{ fontSize:12, color:T.muted, textAlign:'center', lineHeight:20 }}>
                DLMO phase: {calib.dlmoShift >= 0 ? '+' : ''}{Math.round(calib.dlmoShift * 10) / 10}h from standard · Amplitude {Math.round(calib.amplitude * 100)}%
              </Text>
              {calib.amplitude < 0.8 && (
                <Text style={{ fontSize:11, color:T.gold, textAlign:'center', marginTop:4 }}>
                  Irregular sleep pattern dampens melatonin
                </Text>
              )}
            </View>

            {/* ── Søvnlogg ── */}
            <View style={[s.card, { marginBottom:12 }]}>
              <Text style={[s.mono10, { marginBottom:14 }]}>SLEEP LOG</Text>
              {log.slice(-10).reverse().map((e, i) => {
                const dur = e.sleepEnd - e.sleepStart;
                const col = dur >= 420 ? T.accent : dur >= 300 ? T.gold : T.red;
                return (
                  <View key={e.id ?? i} style={[
                    { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
                    i < 9 && { paddingBottom:10, marginBottom:10, borderBottomWidth:1, borderBottomColor:T.border },
                  ]}>
                    <View style={{ flex:1 }}>
                      <Text style={{ fontSize:13, fontWeight:'600', color:T.text }}>
                        {minToTime(e.sleepStart)} → {minToTime(e.sleepEnd)}
                      </Text>
                      <Text style={{ fontSize:11, color:T.muted }}>
                        {friendlyDate(minToDate(e.sleepStart))} · {formatDur(dur)}
                      </Text>
                    </View>
                    <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                      <Text style={{ fontSize:14, fontWeight:'700', color:col }}>
                        {formatDur(dur)}
                      </Text>
                      <TouchableOpacity onPress={() => confirmDelete(e.id)} hitSlop={8}>
                        <Text style={{ fontSize:18, color:T.muted }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height:24 }} />
      </ScrollView>

      <QuickLogModal visible={showLog} onSave={handleSave} onClose={() => setShowLog(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex:1, backgroundColor:T.bg },
  scroll: { paddingHorizontal:16 },
  title:  { fontSize:26, fontWeight:'800', color:T.text },
  mono10: { fontSize:10, color:T.muted, letterSpacing:1, fontWeight:'600' },
  card: {
    backgroundColor:T.surface, borderWidth:1, borderColor:T.border,
    borderRadius:20, padding:18, marginBottom:12,
  },
  statBox: {
    flex:1, backgroundColor:T.elevated, borderRadius:12, padding:12,
  },
  statLabel: { fontSize:9, color:T.muted, letterSpacing:1, marginBottom:4, fontWeight:'500' },
  statValue: { fontSize:16, fontWeight:'700', color:T.text },
  logBtn: {
    paddingVertical:8, paddingHorizontal:14, borderRadius:10,
    backgroundColor:`${T.accent}18`, borderWidth:1, borderColor:`${T.accent}40`,
  },
  logBtnText: { fontSize:12, fontWeight:'600', color:T.accent },
  primaryBtn: {
    paddingVertical:15, borderRadius:16,
    backgroundColor:T.accent, alignItems:'center',
  },
  primaryBtnText: { fontSize:15, fontWeight:'700', color:'#060914' },
  // Modal
  modalBackdrop: {
    flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,.7)',
  },
  modalSheet: {
    backgroundColor:T.surface,
    borderTopLeftRadius:24, borderTopRightRadius:24,
    padding:24, paddingBottom:40,
  },
  modalHandle: {
    width:36, height:4, backgroundColor:T.border,
    borderRadius:2, alignSelf:'center', marginBottom:20, opacity:0.6,
  },
  modalTitle: { fontSize:18, fontWeight:'700', color:T.text, marginBottom:20 },
  fieldLabel: { fontSize:10, fontWeight:'600', color:T.muted, letterSpacing:1, marginBottom:6 },
  inputBox: {
    backgroundColor:T.elevated, borderWidth:1, borderColor:T.border,
    borderRadius:12, paddingVertical:11, paddingHorizontal:14,
  },
  inputText: { fontSize:14, color:T.text },
});
