// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE SCREEN  –  sleep windows + calculation
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import TimePicker from '../../src/components/TimePicker';
import DatePicker  from '../../src/components/DatePicker';
import {
  toMin, minToTime, minToDate, formatDur,
  optimizeSleep, calibrateFromLog, parseWindow, localDate,
} from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';

const T = {
  bg:'#060914', surface:'#0C1220', elevated:'#111A2E',
  border:'rgba(255,255,255,.06)',
  accent:'#5EE7B7', accentLo:'rgba(94,231,183,.12)',
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

// ─── Label helper (used for ANCHOR) ──────────────────────────────────────────
function FieldLabel({ children }) {
  return <Text style={s.fieldLabel}>{children}</Text>;
}

function Card({ children, accentColor, style }) {
  return (
    <View style={[s.card, accentColor && { borderLeftWidth: 3, borderLeftColor: accentColor }, style]}>
      {children}
    </View>
  );
}

function Pill({ children, color = T.accent }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:5,
      backgroundColor:`${color}18`, borderWidth:1, borderColor:`${color}30`,
      borderRadius:8, paddingVertical:3, paddingHorizontal:10 }}>
      <View style={{ width:5, height:5, borderRadius:3, backgroundColor:color }} />
      <Text style={{ fontSize:11, color, fontWeight:'500' }}>{children}</Text>
    </View>
  );
}

// Snakkes syklus-sirkel
function QArc({ value }) {
  const col = value >= 75 ? T.accent : value >= 50 ? T.blue : T.gold;
  const r = 20, cx = 26, circ = 2 * Math.PI * r;
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
      <Svg width={52} height={52} style={{ transform:[{ rotate:'-90deg' }] }}>
        <Circle cx={cx} cy={cx} r={r} fill="none" stroke={T.elevated} strokeWidth={4} />
        <Circle cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth={4}
          strokeDasharray={`${(value/100)*circ} ${circ}`} strokeLinecap="round" />
      </Svg>
      <View>
        <Text style={{ fontSize:20, fontWeight:'700', color:col, lineHeight:24 }}>{value}%</Text>
        <Text style={{ fontSize:10, color:T.muted, letterSpacing:1 }}>QUALITY</Text>
      </View>
    </View>
  );
}

function TimeBar({ sleepStart, sleepEnd, winStart, winEnd }) {
  const span = winEnd - winStart;
  const leftPct  = Math.max(0, ((sleepStart - winStart) / span) * 100);
  const widthPct = Math.max(0, ((sleepEnd   - sleepStart) / span) * 100);
  return (
    <View style={{ marginBottom:14 }}>
      <View style={{ height:5, backgroundColor:T.elevated, borderRadius:3, overflow:'hidden' }}>
        <View style={{
          position:'absolute', left:`${leftPct}%`, width:`${widthPct}%`,
          height:'100%', borderRadius:3, backgroundColor:T.accent,
        }} />
      </View>
      <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:4 }}>
        <Text style={s.mono9}>{minToTime(winStart)}</Text>
        <Text style={s.mono9}>{minToTime(winEnd)}</Text>
      </View>
    </View>
  );
}

const ANCHOR_OPTIONS = [
  { value:'none',     label:'Auto – Melatonin Optimized' },
  { value:'bedtime',  label:'Fixed Bedtime (from start time)' },
  { value:'waketime', label:'Fixed Wake Time (to end time)' },
];

function AnchorPicker({ value, onChange }) {
  return (
    <View style={{ flexDirection:'row', gap:6, flexWrap:'wrap', marginTop:4 }}>
      {ANCHOR_OPTIONS.map(opt => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[s.anchorBtn, value === opt.value && s.anchorBtnActive]}>
          <Text style={[s.anchorBtnText, value === opt.value && { color: T.accent }]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function PlanScreen() {
  const [windows,  setWindows]  = useState([]);
  const [lwd,      setLwd]      = useState(localDate(0));
  const [lwt,      setLwt]      = useState('08:00');
  const [results,  setResults]  = useState([]);
  const [calib,    setCalib]    = useState({ dlmoShift:0, amplitude:1.0 });
  const [expanded, setExpanded] = useState({});

  useFocusEffect(useCallback(() => {
    (async () => {
      const [storedLog, storedWin, lastWoke] = await Promise.all([
        Storage.getLog(),
        Storage.getWindows(),
        Storage.getLastWoke(),
      ]);
      const c = calibrateFromLog(storedLog);
      setCalib(c);
      if (storedWin?.length) setWindows(storedWin);
      if (lastWoke) { setLwd(lastWoke.date); setLwt(lastWoke.time); }
    })();
  }, []));

  const addWindow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const w = { id: Date.now(), date: localDate(1), startTime:'22:00', endTime:'06:00', anchor:'none' };
    const next = [...windows, w];
    setWindows(next);
    Storage.saveWindows(next);
  };

  const removeWindow = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = windows.filter(x => x.id !== id);
    setWindows(next);
    Storage.saveWindows(next);
  };

  const updateWindow = (id, field, val) => {
    const next = windows.map(x => x.id === id ? { ...x, [field]: val } : x);
    setWindows(next);
    Storage.saveWindows(next);
  };

  const calculate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Storage.saveLastWoke(lwd, lwt);
    const lastWokeMin = toMin(lwd, lwt);
    const parsed = windows.map(parseWindow);
    const res = optimizeSleep(parsed, lastWokeMin, calib);
    setResults(res);
    setExpanded({});
  };

  const total = results.filter(r => !r.skip).reduce((s, r) => s + r.duration, 0);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Text style={s.title}>Sleep Schedule</Text>

        {/* ── Last Woke Up ── */}
        <Text style={s.sectionLabel}>Last Woke Up</Text>
        <Card style={{ marginBottom:16 }}>
          <View style={{ flexDirection:'row', gap:12 }}>
            <DatePicker label="DATE" value={lwd} onChange={setLwd} />
            <TimePicker label="TIME" value={lwt} onChange={setLwt} />
          </View>
        </Card>

        {/* ── Sleep Windows ── */}
        <Text style={s.sectionLabel}>Sleep Windows</Text>
        <Text style={s.sectionHint}>
          When can you sleep? The app picks the optimal time within each window.
        </Text>

        {windows.map((w, idx) => (
          <Card key={w.id} style={{ marginBottom:12 }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <View style={s.windowIndex}>
                  <Text style={s.windowIndexText}>{idx + 1}</Text>
                </View>
                <Text style={{ fontSize:13, color:T.sub }}>{friendlyDate(w.date)}</Text>
              </View>
              <TouchableOpacity onPress={() => removeWindow(w.id)} hitSlop={12}>
                <Text style={{ fontSize:22, color:T.muted, lineHeight:26 }}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection:'row', gap:10, marginBottom:12 }}>
              <DatePicker label="DATE" value={w.date}      onChange={v => updateWindow(w.id,'date',v)} />
              <TimePicker label="FROM" value={w.startTime} onChange={v => updateWindow(w.id,'startTime',v)} />
              <TimePicker label="TO"   value={w.endTime}   onChange={v => updateWindow(w.id,'endTime',v)} />
            </View>

            <FieldLabel>ANCHOR</FieldLabel>
            <AnchorPicker value={w.anchor || 'none'} onChange={v => updateWindow(w.id,'anchor',v)} />
          </Card>
        ))}

        <TouchableOpacity onPress={addWindow} style={s.addWindowBtn}>
          <Text style={s.addWindowBtnText}>+ Add Sleep Window</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={calculate}
          disabled={windows.length === 0}
          style={[s.primaryBtn, windows.length === 0 && s.primaryBtnDisabled]}>
          <Text style={[s.primaryBtnText, windows.length === 0 && { color: T.muted }]}>
            Calculate Sleep Plan
          </Text>
        </TouchableOpacity>

        {/* ── Resultater ── */}
        {results.length > 0 && (
          <>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:28, marginBottom:14 }}>
              <Text style={{ fontSize:14, fontWeight:'600', color:T.text }}>Your Sleep Schedule</Text>
              <Pill>{formatDur(total)} total</Pill>
            </View>

            {results.map((r, i) => {
              const ws = minToTime(r.win.startMin);
              const we = minToTime(r.win.endMin);
              if (r.skip) return (
                <Card key={i} accentColor={T.muted} style={{ marginBottom:10 }}>
                  <Text style={s.mono9}>WINDOW {i+1} · {ws}–{we}</Text>
                  <Text style={{ fontSize:13, color:T.sub, marginTop:4 }}>{r.reason}</Text>
                </Card>
              );

              const open = !!expanded[i];
              return (
                <Card key={i} accentColor={T.accent} style={{ marginBottom:10 }}>
                  <Text style={[s.mono9, { marginBottom:4 }]}>
                    WINDOW {i+1} · {friendlyDate(r.win.date)} · {ws}–{we}
                  </Text>
                  <Text style={s.bigTime}>
                    {minToTime(r.sleepStart)}
                    <Text style={{ color:T.muted, fontWeight:'300' }}> → </Text>
                    {minToTime(r.sleepEnd)}
                  </Text>

                  <TimeBar
                    sleepStart={r.sleepStart} sleepEnd={r.sleepEnd}
                    winStart={r.win.startMin} winEnd={r.win.endMin} />

                  <View style={{ flexDirection:'row', gap:10, marginBottom:14 }}>
                    {[
                      ['DURATION',     formatDur(r.duration), T.accent],
                      ['CYCLES',       `${r.cycles}×90m`,     T.text],
                      ['AWAKE BEFORE', `${r.hoursAwake}h`,    T.sub],
                    ].map(([l, v, c]) => (
                      <View key={l} style={s.statBox}>
                        <Text style={s.statLabel}>{l}</Text>
                        <Text style={[s.statValue, { color:c }]}>{v}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <QArc value={r.quality} />
                    <Pill color={r.melOnset > 60 ? T.accent : r.melOnset > 30 ? T.gold : T.red}>
                      {r.melOnset > 60 ? 'Night' : r.melOnset > 30 ? 'Partial' : 'Day'} · {r.melOnset}%
                    </Pill>
                  </View>

                  <TouchableOpacity
                    onPress={() => setExpanded(d => ({ ...d, [i]: !d[i] }))}
                    style={s.debugToggle}>
                    <Text style={{ fontSize:12, color:T.sub }}>Why this?</Text>
                    <Text style={{ fontSize:12, color:T.muted }}>{open ? '▲' : '▾'}</Text>
                  </TouchableOpacity>

                  {open && (
                    <View style={s.debugBox}>
                      <Text style={s.debugLine}>
                        <Text style={{ color:T.text }}>Target: </Text>
                        {r.debug.rawTargetH}h ({r.hoursAwake}h awake)
                      </Text>
                      {r.debug.windowConstraint && (
                        <Text style={[s.debugLine, { color:T.gold }]}>
                          ⚠ Window limits to {r.debug.windowMaxH}h
                        </Text>
                      )}
                      <Text style={s.debugLine}>
                        <Text style={{ color:T.text }}>Melatonin: </Text>
                        {r.melOnset}% {r.melOnset > 60 ? '— night ✓' : r.melOnset > 30 ? '— partial' : '— day, target adjusted'}
                      </Text>
                      <Text style={s.debugLine}>
                        <Text style={{ color:T.text }}>Budget left: </Text>
                        {r.debug.budgetLeft}h
                      </Text>
                    </View>
                  )}
                </Card>
              );
            })}
          </>
        )}

        <View style={{ height:32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex:1, backgroundColor:T.bg },
  scroll: { paddingHorizontal:16 },
  title:  { fontSize:26, fontWeight:'800', color:T.text, paddingTop:20, marginBottom:20 },
  sectionLabel: { fontSize:13, fontWeight:'600', color:T.sub, marginBottom:6 },
  sectionHint:  { fontSize:12, color:T.muted, marginBottom:14, lineHeight:20 },
  card: {
    backgroundColor:T.surface, borderWidth:1, borderColor:T.border,
    borderRadius:20, padding:18, marginBottom:12,
  },
  fieldLabel: {
    fontSize:10, fontWeight:'600', color:T.muted,
    letterSpacing:1, marginBottom:6,
  },
  inputBox: {
    backgroundColor:T.elevated, borderWidth:1, borderColor:T.border,
    borderRadius:12, paddingVertical:11, paddingHorizontal:14,
  },
  inputText: { fontSize:14, color:T.text },
  windowIndex: {
    width:26, height:26, borderRadius:8, backgroundColor:T.elevated,
    alignItems:'center', justifyContent:'center',
  },
  windowIndexText: { fontSize:11, fontWeight:'700', color:T.sub },
  anchorBtn: {
    paddingVertical:6, paddingHorizontal:10, borderRadius:8,
    borderWidth:1, borderColor:T.border, backgroundColor:T.elevated,
    marginBottom:4,
  },
  anchorBtnActive: { borderColor:`${T.accent}50`, backgroundColor:T.accentLo },
  anchorBtnText: { fontSize:11, color:T.muted },
  addWindowBtn: {
    paddingVertical:14, borderRadius:16, borderWidth:1,
    borderColor:T.muted, borderStyle:'dashed',
    alignItems:'center', marginBottom:16,
  },
  addWindowBtnText: { fontSize:14, color:T.muted },
  primaryBtn: {
    paddingVertical:15, borderRadius:16,
    backgroundColor:T.accent, alignItems:'center', marginBottom:8,
  },
  primaryBtnDisabled: { backgroundColor:T.elevated },
  primaryBtnText: { fontSize:15, fontWeight:'700', color:'#060914' },
  bigTime: { fontSize:28, fontWeight:'700', letterSpacing:-1, color:T.text, marginBottom:8 },
  mono9: { fontSize:9, color:T.muted, letterSpacing:0.5 },
  statBox: {
    flex:1, backgroundColor:T.bg, borderRadius:10, padding:10,
  },
  statLabel: { fontSize:9, color:T.muted, letterSpacing:1, marginBottom:2, fontWeight:'500' },
  statValue: { fontSize:16, fontWeight:'700', color:T.text },
  debugToggle: {
    flexDirection:'row', justifyContent:'space-between',
    padding:9, backgroundColor:T.elevated, borderRadius:10,
  },
  debugBox: {
    backgroundColor:T.elevated, borderBottomLeftRadius:10, borderBottomRightRadius:10,
    padding:12, marginTop:1,
  },
  debugLine: { fontSize:12, color:T.sub, lineHeight:22 },
});
