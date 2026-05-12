// ─────────────────────────────────────────────────────────────────────────────
// ANALYSE-SKJERM  –  søvnhistorikk, statistikk og hurtig-logg
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle, Path, Line, Text as SvgText } from 'react-native-svg';
import TimePicker from '../../src/components/TimePicker';
import DatePicker  from '../../src/components/DatePicker';
import {
  toMin, minToTime, minToDate, formatDur,
  melatoninLevel, calibrateFromLog, localDate,
} from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';

const T = {
  bg:'#060914', surface:'#0C1220', elevated:'#111A2E',
  border:'rgba(255,255,255,.06)',
  accent:'#5EE7B7',
  gold:'#F0B952',
  blue:'#4FA3E0',
  red:'#E05C5C',
  text:'#E2EAF4', sub:'#7A96B8', muted:'#3A4F6A',
};

const DAYS = ['søn','man','tir','ons','tor','fre','lør'];
function friendlyDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}`;
}

const PHASE_META = {
  deep:  { color: '#1E3A8A', label: 'Dyp søvn' },
  light: { color: '#4FA3E0', label: 'Lett søvn' },
  rem:   { color: '#5EE7B7', label: 'REM' },
  awake: { color: '#E05C5C', label: 'Våken' },
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
          <Text style={s.modalTitle}>Logg søvnøkt</Text>

          <View style={{ flexDirection:'row', gap:10, marginBottom:20 }}>
            <DatePicker label="DATO"     value={date}  onChange={setDate} />
            <TimePicker label="LA DEG"   value={start} onChange={setStart} />
            <TimePicker label="STOD OPP" value={end}   onChange={setEnd} />
          </View>

          <TouchableOpacity onPress={save} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>Lagre søvnøkt</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function AnalyseScreen() {
  const [log,          setLog]          = useState([]);
  const [calib,        setCalib]        = useState({ dlmoShift:0, amplitude:1.0, dataPoints:0 });
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [showLog,      setShowLog]      = useState(false);

  const loadData = useCallback(async () => {
    const [storedLog, analysis] = await Promise.all([
      Storage.getLog(),
      Storage.getLastAnalysis(),
    ]);
    setLog(storedLog);
    setCalib(calibrateFromLog(storedLog));
    setLastAnalysis(analysis);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleSave = async (entry) => {
    const next = [...log, entry].slice(-90);
    await Storage.saveLog(next);
    setLog(next);
    setCalib(calibrateFromLog(next));
  };

  const confirmDelete = (id) => {
    Alert.alert(
      'Slett økt',
      'Vil du slette denne søvnøkten?',
      [
        { text: 'Avbryt', style:'cancel' },
        {
          text: 'Slett', style:'destructive',
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

  if (log.length === 0 && !lastAnalysis) return (
    <SafeAreaView style={s.safe}>
      <View style={s.scroll}>
        <Text style={s.title}>Analyse</Text>
        <View style={{ alignItems:'center', paddingVertical:60 }}>
          <Text style={{ fontSize:48, marginBottom:16 }}>📊</Text>
          <Text style={{ fontSize:15, color:T.sub, marginBottom:8 }}>Ingen data ennå</Text>
          <Text style={{ fontSize:13, color:T.muted, textAlign:'center', marginBottom:28, lineHeight:20 }}>
            Logg noen søvnøkter for å se mønstre og statistikk
          </Text>
          <TouchableOpacity onPress={() => setShowLog(true)} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>Logg første økt</Text>
          </TouchableOpacity>
        </View>
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
  const chart      = log.slice(-14);
  const maxDur     = chart.length ? Math.max(...chart.map(e => e.sleepEnd - e.sleepStart)) : 1;
  const bedHH      = String(Math.floor(avgBedtime)).padStart(2,'0');
  const bedMM      = String(Math.round((avgBedtime % 1) * 60)).padStart(2,'0');

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingTop:20, marginBottom:20 }}>
          <Text style={s.title}>Analyse</Text>
          <TouchableOpacity onPress={() => setShowLog(true)} style={s.logBtn}>
            <Text style={s.logBtnText}>+ Logg økt</Text>
          </TouchableOpacity>
        </View>

        {/* ── Siste innspilte natt ── */}
        {lastAnalysis && (
          <View style={[s.card, { marginBottom:16 }]}>
            <Text style={[s.mono10, { marginBottom:12 }]}>SISTE INNSPILTE NATT</Text>

            <View style={{ flexDirection:'row', gap:10, marginBottom:14 }}>
              {[
                ['VARIGHET', formatDur(lastAnalysis.duration), lastAnalysis.duration >= 420 ? T.accent : lastAnalysis.duration >= 300 ? T.gold : T.red],
                ['SYKLUSER', String(lastAnalysis.cycles), T.blue],
                ['KVALITET', `${lastAnalysis.quality}%`, lastAnalysis.quality >= 70 ? T.accent : lastAnalysis.quality >= 50 ? T.gold : T.red],
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
                {' '}{ { 1:'mikrofon', 2:'mikrofon + bevegelse', 3:'alle signaler' }[lastAnalysis.signals.length] }
              </Text>
            )}
          </View>
        )}

        {/* ── Kalibrering ── */}
        {calib.dataPoints >= 3 && (
          <View style={[s.card, { borderLeftWidth:3, borderLeftColor:T.accent, marginBottom:16 }]}>
            <Text style={[s.mono10, { marginBottom:12 }]}>PERSONLIG KALIBRERING</Text>
            <View style={{ flexDirection:'row', gap:10, marginBottom:8 }}>
              {[
                ['NETTER',    calib.dataPoints,                                                    T.accent],
                ['DLMO-FASE', `${calib.dlmoShift >= 0 ? '+' : ''}${Math.round(calib.dlmoShift * 10) / 10}t`, T.text],
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
                {7 - calib.dataPoints} netter til for god kalibrering
              </Text>
            )}
          </View>
        )}

        {log.length > 0 && (
          <>
            {/* ── Statistikk-grid ── */}
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:12, marginBottom:16 }}>
              {[
                ['SNITT SØVN',      formatDur(Math.round(avgDur)),     avgDur >= 420 ? T.accent : avgDur >= 300 ? T.gold : T.red],
                ['SISTE 7 NETTER',  formatDur(Math.round(recent7avg)), recent7avg >= 420 ? T.accent : recent7avg >= 300 ? T.gold : T.red],
                ['SNITT LEGGETID',  `${bedHH}:${bedMM}`,               T.sub],
                ['LOGGEDE NETTER',  String(log.length),                 T.text],
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
                SØVNLENGDE – SISTE {chart.length} NETTER
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
                {[[T.accent,'7t+ god'],[T.gold,'5-7t ok'],[T.red,'Under 5t']].map(([c,l]) => (
                  <View key={l} style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                    <View style={{ width:8, height:8, borderRadius:4, backgroundColor:c }} />
                    <Text style={{ fontSize:10, color:T.sub }}>{l}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Melatonin-ring ── */}
            <View style={s.card}>
              <Text style={[s.mono10, { marginBottom:14 }]}>DIN MELATONIN-KURVE (24T)</Text>
              <View style={{ alignItems:'center', marginBottom:12 }}>
                <MelRing shift={calib.dlmoShift} amp={calib.amplitude} size={160} />
              </View>
              <Text style={{ fontSize:12, color:T.muted, textAlign:'center', lineHeight:20 }}>
                DLMO-fase: {calib.dlmoShift >= 0 ? '+' : ''}{Math.round(calib.dlmoShift * 10) / 10}t fra standard · Amplitude {Math.round(calib.amplitude * 100)}%
              </Text>
              {calib.amplitude < 0.8 && (
                <Text style={{ fontSize:11, color:T.gold, textAlign:'center', marginTop:4 }}>
                  Uregelmessig søvnmønster demper melatonin
                </Text>
              )}
            </View>

            {/* ── Søvnlogg ── */}
            <View style={[s.card, { marginBottom:12 }]}>
              <Text style={[s.mono10, { marginBottom:14 }]}>SØVNLOGG</Text>
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
