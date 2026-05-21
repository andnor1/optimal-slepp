// ─────────────────────────────────────────────────────────────────────────────
// SLEEP HYGIENE COACHING SCREEN
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { calibrateFromLog, localDate } from '../../src/engine/sleepEngine';
import { Storage } from '../../src/utils/storage';
import { earnedBadges } from '../../src/utils/badges';
import { loadSettings } from '../../src/utils/settings';

const T = {
  bg: '#060914', surface: '#0C1220', elevated: '#111A2E',
  border: 'rgba(255,255,255,.06)',
  accent: '#5EE7B7', accentLo: 'rgba(94,231,183,.12)',
  gold: '#F0B952', goldLo: 'rgba(240,185,82,.08)',
  blue: '#4FA3E0', blueLo: 'rgba(79,163,224,.1)',
  red: '#E05C5C',
  text: '#E2EAF4', sub: '#7A96B8', muted: '#3A4F6A',
};

const CATS = {
  light:    { label: 'Light',       icon: '💡', color: T.gold },
  temp:     { label: 'Temperature', icon: '🌡️', color: T.blue },
  caffeine: { label: 'Caffeine',    icon: '☕', color: T.gold },
  exercise: { label: 'Exercise',    icon: '🏃', color: T.accent },
  screens:  { label: 'Screens',     icon: '📱', color: T.blue },
  food:     { label: 'Food',        icon: '🍽️', color: T.gold },
  stress:   { label: 'Stress',      icon: '🧘', color: T.accent },
};

// hours = hours-of-day when this tip is most relevant (0-23)
const ALL_TIPS = [
  // ── Light & Melatonin ──────────────────────────────────────────────────────
  { id:'l1', cat:'light', icon:'💡', title:'Dim the lights',
    hours:[19,20,21,22,23],
    text:'Lower your light intensity 2 hours before bed. Bright overhead lighting delays melatonin onset significantly.',
    why:'The SCN (your circadian clock) uses ambient light intensity as a timing cue. Bright white light above 500 lux can delay DLMO by up to 90 minutes, pushing your sleep window later.' },
  { id:'l2', cat:'light', icon:'📵', title:'Enable blue light filter',
    hours:[18,19,20,21,22],
    text:'Activate Night Shift or similar. Blue-wavelength light is the most potent melatonin suppressor available.',
    why:'Melanopsin-containing retinal cells are maximally sensitive to 480nm (blue) light. Even a screen at arm\'s length can suppress 50% of melatonin production without a filter.' },
  { id:'l3', cat:'light', icon:'☀️', title:'Get morning sunlight',
    hours:[6,7,8,9],
    text:'Step outside for 10–15 minutes within an hour of waking. This anchors your circadian rhythm for the day.',
    why:'Morning light suppresses residual melatonin and advances your circadian phase. It\'s the single most powerful zeitgeber available, reducing sleep onset time the following night.' },
  { id:'l4', cat:'light', icon:'🌅', title:'Switch to warm-toned lamps',
    hours:[18,19,20,21],
    text:'Replace cold-white LEDs with warm (2700K) lamps from 6 PM. Minimal blue wavelengths mean melatonin can rise on schedule.',
    why:'Warm light contains <10% of the blue-wavelength energy of cool white LEDs, causing negligible melanopsin activation while still providing comfortable illumination.' },
  { id:'l5', cat:'light', icon:'🌑', title:'Blackout your bedroom',
    hours:[21,22,23,0],
    text:'Use blackout curtains or a sleep mask. Even faint light through eyelids fragments sleep architecture.',
    why:'Photoreceptors remain partially active during sleep. Ambient light exposure at night reduces slow-wave sleep by 15% and elevates morning cortisol, even without fully waking you.' },

  // ── Temperature ────────────────────────────────────────────────────────────
  { id:'t1', cat:'temp', icon:'🌡️', title:'Set room to 18–20 °C',
    hours:[20,21,22],
    text:'Cool your bedroom to 65–68°F before sleep. A slightly cool room dramatically cuts sleep latency.',
    why:'Core body temperature must drop 1–2°C to initiate deep sleep. A cooler room dissipates heat more efficiently, cutting time-to-sleep by an average of 16 minutes in studies.' },
  { id:'t2', cat:'temp', icon:'🚿', title:'Warm shower before bed',
    hours:[20,21,22],
    text:'A 10-minute warm shower 1–2 hours before bed paradoxically cools your core temperature.',
    why:'Warm water dilates peripheral blood vessels. As you step out, heat dissipates rapidly, dropping core temperature faster than without the shower — accelerating sleep onset.' },
  { id:'t3', cat:'temp', icon:'💧', title:'Cold rinse on waking',
    hours:[6,7,8],
    text:'Splash cold water on your face or take a brief cold shower to accelerate cortisol rise and morning alertness.',
    why:'Cold stimulation triggers norepinephrine release (+300%) and activates the HPA axis, providing clean, caffeine-free alertness and improving focus within minutes.' },
  { id:'t4', cat:'temp', icon:'🧦', title:'Wear socks to bed',
    hours:[21,22,23],
    text:'Keeping feet warm accelerates sleep onset by triggering peripheral vasodilation.',
    why:'Warm feet dilate blood vessels in the extremities, redistributing heat away from the core — the same thermodynamic mechanism as the warm pre-bed shower.' },
  { id:'t5', cat:'temp', icon:'🪟', title:'Ventilate before sleep',
    hours:[20,21,22],
    text:'Open a window for 10 minutes before bed to lower CO₂ and room temperature.',
    why:'A closed bedroom accumulates CO₂ to 1,500–2,500 ppm overnight. Elevated CO₂ increases nighttime awakenings and measurably reduces slow-wave sleep depth.' },

  // ── Caffeine ───────────────────────────────────────────────────────────────
  { id:'c1', cat:'caffeine', icon:'☕', title:'Last coffee before 2 PM',
    hours:[10,11,12,13,14],
    text:'Caffeine\'s 5–6h half-life means a 2 PM coffee still has ~25% potency at midnight. Time your last cup early.',
    why:'Caffeine blocks adenosine receptors. High caffeine at bedtime reduces slow-wave sleep by up to 20% even when you feel you\'ve fallen asleep normally.' },
  { id:'c2', cat:'caffeine', icon:'⏰', title:'Delay morning coffee 90 min',
    hours:[6,7,8],
    text:'Wait 90 minutes post-waking before your first coffee to avoid the afternoon energy crash.',
    why:'Cortisol peaks naturally 30–45 min after waking. Drinking coffee during this window blunts the cortisol response and causes adenosine rebound 3–4 hours later.' },
  { id:'c3', cat:'caffeine', icon:'🫖', title:'Herbal tea after 3 PM',
    hours:[14,15,16,17],
    text:'Chamomile or passionflower tea supports sleep preparation with mild relaxing effects.',
    why:'Chamomile contains apigenin, which binds GABA-A receptors with mild anxiolytic effects — similar pathway as benzodiazepines but far gentler and without dependency risk.' },
  { id:'c4', cat:'caffeine', icon:'💧', title:'Hydrate throughout the day',
    hours:[9,10,11,12,13,14,15],
    text:'Even mild dehydration (2% body weight) measurably degrades mood, cognition, and sleep quality.',
    why:'Dehydration elevates cortisol and constricts blood vessels, reducing the peripheral vasodilation that signals sleep readiness to the hypothalamus.' },
  { id:'c5', cat:'caffeine', icon:'🍷', title:'Skip alcohol tonight',
    hours:[18,19,20,21,22],
    text:'Even 1–2 drinks can reduce REM sleep by 20% and cause early-morning awakening.',
    why:'Alcohol metabolizes into acetaldehyde during sleep — a stimulant compound. The "rebound effect" as alcohol clears causes fragmented sleep and early waking in the second half of the night.' },

  // ── Exercise ───────────────────────────────────────────────────────────────
  { id:'e1', cat:'exercise', icon:'🏃', title:'Finish intense exercise by 6 PM',
    hours:[14,15,16,17,18],
    text:'High-intensity training raises core temperature and cortisol for 3–4 hours. Finish well before bed.',
    why:'Post-exercise cortisol antagonizes melatonin at receptors in the SCN. Elevated body temperature from exercise inhibits the cooling process needed to initiate sleep.' },
  { id:'e2', cat:'exercise', icon:'🧘', title:'Evening yoga or stretching',
    hours:[20,21,22],
    text:'15 minutes of light stretching or yoga activates the parasympathetic nervous system.',
    why:'Slow movement with diaphragmatic breathing stimulates the vagus nerve, reducing heart rate and lowering circulating cortisol by ~15% within 10 minutes.' },
  { id:'e3', cat:'exercise', icon:'🚶', title:'Morning walk for better sleep tonight',
    hours:[6,7,8,9],
    text:'A 20-minute walk combines light exposure and gentle exercise — both advance your circadian phase.',
    why:'Morning exercise increases slow-wave sleep depth the following night by 12%. Combined with natural light, it is the most potent circadian anchor available.' },
  { id:'e4', cat:'exercise', icon:'💪', title:'Consistent exercise improves sleep',
    hours:[11,12,13,14],
    text:'Regular moderate exercise reduces sleep onset by 12 minutes and increases total sleep by 18 minutes on average.',
    why:'Exercise metabolizes into adenosine (the sleep-pressure molecule) in proportion to activity level. More adenosine means stronger sleep drive and deeper slow-wave sleep.' },
  { id:'e5', cat:'exercise', icon:'🏊', title:'Aerobic exercise for sleep quality',
    hours:[9,10,11,12],
    text:'Swimming and cycling show the strongest correlation with improved sleep architecture in research.',
    why:'Aerobic exercise elevates BDNF and serotonin — precursors to melatonin — and increases the percentage of deep sleep by an average of 10% in regular exercisers.' },

  // ── Screens ────────────────────────────────────────────────────────────────
  { id:'s1', cat:'screens', icon:'📴', title:'Phone-free bedroom',
    hours:[21,22,23],
    text:'Keep your phone outside the bedroom. Even anticipating notifications maintains hypervigilance.',
    why:'The "on-call" mental state activates the same threat-monitoring circuits that prevent deep sleep. Silent notifications can raise heart rate and fragment sleep cycles.' },
  { id:'s2', cat:'screens', icon:'🔅', title:'Maximum warm screen tone',
    hours:[18,19,20,21],
    text:'Set your screen to maximum warm tint. This reduces blue light output by up to 60%.',
    why:'Melanopsin cells that control circadian rhythm respond primarily to 470–490nm (blue) light. Warm-tinting filters cut this band significantly while keeping the screen readable.' },
  { id:'s3', cat:'screens', icon:'⏰', title:'Set a screen curfew alarm',
    hours:[20,21,22],
    text:'Set an alarm 30–60 min before your target bedtime: no screens. Use the time for reading or stretching.',
    why:'Active screen use maintains cortical arousal in the prefrontal cortex. A wind-down buffer allows gradual deactivation from the high-stimulus state screens create.' },
  { id:'s4', cat:'screens', icon:'📚', title:'Read a physical book',
    hours:[21,22,23],
    text:'Replace pre-sleep scrolling with a printed book. Reading reduces psychological stress by 68% in 6 minutes (Sussex study).',
    why:'Print reading emits no blue light. Narrative fiction is absorbed with eyes relaxed — no social comparison, no notification loops, no cortisol spike from bad news.' },
  { id:'s5', cat:'screens', icon:'🎧', title:'Audio over video before bed',
    hours:[21,22,23],
    text:'Podcasts and audiobooks are far less arousing than video — you can listen with eyes closed.',
    why:'Visual stimulation engages 40% more cortical area than audio. Switching to audio-only lets you deactivate visually while maintaining a gentle cognitive wind-down.' },

  // ── Food & Drink ───────────────────────────────────────────────────────────
  { id:'f1', cat:'food', icon:'🍽️', title:'Finish dinner 3 hours before bed',
    hours:[17,18,19,20],
    text:'Avoid large meals within 3h of sleep. Digestion raises core temperature and can cause reflux lying down.',
    why:'Insulin response to food elevates metabolic rate for 2–3 hours (thermogenesis), directly competing with the core temperature drop needed to initiate deep sleep.' },
  { id:'f2', cat:'food', icon:'🍌', title:'Tryptophan snack before bed',
    hours:[21,22],
    text:'A small banana, warm milk, or handful of walnuts can support melatonin production.',
    why:'Tryptophan → serotonin → melatonin. Pairing tryptophan with a small carbohydrate helps it cross the blood-brain barrier by reducing competing amino acid levels.' },
  { id:'f3', cat:'food', icon:'🫐', title:'Eat antioxidant-rich foods today',
    hours:[10,11,12,13,14],
    text:'Blueberries, cherries, and walnuts contain melatonin and antioxidants that support sleep quality.',
    why:'Oxidative stress damages mitochondria essential for pineal melatonin synthesis. Dietary antioxidants reduce this damage and support melatonin output throughout the night.' },
  { id:'f4', cat:'food', icon:'💧', title:'Stop liquids 2h before bed',
    hours:[19,20,21,22],
    text:'Reduce fluid intake 2 hours before sleep to prevent nighttime awakenings.',
    why:'A single nocturia awakening can break a 90-minute sleep cycle, substantially reducing the night\'s REM percentage. Strategic fluid timing prevents this disruption.' },
  { id:'f5', cat:'food', icon:'🧂', title:'Low-sodium dinner',
    hours:[17,18,19,20],
    text:'High-sodium meals increase overnight urination and can raise blood pressure, fragmenting sleep.',
    why:'Sodium drives fluid retention and redistribution when lying down, shifting fluid to the kidneys and increasing urine production during the night.' },

  // ── Stress ─────────────────────────────────────────────────────────────────
  { id:'st1', cat:'stress', icon:'🫁', title:'4-7-8 breathing exercise',
    hours:[21,22,23,0],
    text:'Inhale 4 counts, hold 7, exhale 8. Four cycles. Activates the parasympathetic nervous system within 2 minutes.',
    why:'Extended exhale activates baroreceptors and the vagus nerve, dropping heart rate and cortisol. CO₂ buildup during the hold triggers a calming dive reflex.' },
  { id:'st2', cat:'stress', icon:'📝', title:'Journal your worries',
    hours:[20,21,22],
    text:'Write down your top 3 worries and one small action step each. This offloads mental loops before bed.',
    why:'The brain\'s default mode network runs problem-solving loops during sleep onset. Writing externalizes these loops, allowing the prefrontal cortex to "close the file" and rest.' },
  { id:'st3', cat:'stress', icon:'🧠', title:'Body scan meditation',
    hours:[22,23,0],
    text:'Progressively relax each body part from toes to head. Takes 8–10 minutes and measurably reduces time-to-sleep.',
    why:'Progressive muscle relaxation reduces sympathetic arousal, cortisol, and sleep latency by an average of 10 minutes in controlled studies.' },
  { id:'st4', cat:'stress', icon:'🗒️', title:'Write tomorrow\'s to-do list',
    hours:[20,21,22],
    text:'Spend 5 minutes writing specific tasks for tomorrow. Research shows this cuts bedtime rumination by 50%.',
    why:'A 2018 Baylor University study found writing a specific to-do list before bed reduced sleep onset time more effectively than journaling about completed tasks.' },
  { id:'st5', cat:'stress', icon:'🌿', title:'Gratitude practice',
    hours:[21,22,23],
    text:'Think of 3 genuinely good things from today. This cognitive shift measurably reduces cortisol.',
    why:'Gratitude practice reduces amygdala reactivity and increases prefrontal activation — shifting the brain from vigilance mode to the restful state compatible with quality sleep.' },
];

const WEEKLY_CHALLENGES = [
  { icon:'📴', title:'Digital Sunset',     desc:'No screens 1 hour before bed every night this week',     days:7 },
  { icon:'☀️', title:'Morning Light',       desc:'10 min of morning sunlight within 30 min of waking',     days:7 },
  { icon:'🌡️', title:'Cool Your Room',      desc:'Set bedroom to 18–20 °C before sleep every night',       days:7 },
  { icon:'🧘', title:'Wind-Down Ritual',    desc:'10 min of stretching or meditation before bed each night', days:7 },
  { icon:'☕', title:'Caffeine Curfew',      desc:'No caffeine after 2 PM — track it every day this week',   days:7 },
  { icon:'⏰', title:'Consistent Bedtime',  desc:'Go to bed within 30 min of your target time each night',  days:7 },
  { icon:'🏃', title:'Daily Movement',      desc:'At least 20 min of exercise or walking every day',        days:7 },
];

function getCurrentChallenge() {
  const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return WEEKLY_CHALLENGES[weekNum % WEEKLY_CHALLENGES.length];
}

function getTodaysTips(hour, lastQuality) {
  const scored = ALL_TIPS.map(tip => {
    const h = Math.floor(hour);
    let score = tip.hours.includes(h) ? 3 : tip.hours.includes(h - 1) || tip.hours.includes(h + 1) ? 1 : 0;
    if (tip.cat === 'stress' && lastQuality < 50) score += 2;
    if (tip.cat === 'light'  && hour >= 18 && hour <= 23) score += 1;
    if ((tip.cat === 'exercise' || tip.cat === 'caffeine') && hour >= 6 && hour <= 15) score += 1;
    return { ...tip, score };
  });
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const chosen = []; const usedCats = {};
  for (const tip of sorted) {
    if (chosen.length >= 5) break;
    if ((usedCats[tip.cat] || 0) >= 2) continue;
    chosen.push(tip);
    usedCats[tip.cat] = (usedCats[tip.cat] || 0) + 1;
  }
  return chosen;
}

function TipCard({ tip, isDone, onToggleDone }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATS[tip.cat];
  return (
    <View style={[ts.card, isDone && { opacity: 0.55, borderColor: `${T.accent}30` }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 26 }}>{tip.icon}</Text>
        <View style={{ flex: 1 }}>
          <View style={[ts.catPill, { backgroundColor: `${meta.color}18`, alignSelf: 'flex-start', marginBottom: 6 }]}>
            <Text style={{ fontSize: 10, color: meta.color, fontWeight: '600' }}>{meta.icon} {meta.label}</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: isDone ? T.muted : T.text, marginBottom: 5, textDecorationLine: isDone ? 'line-through' : 'none' }}>
            {tip.title}
          </Text>
          <Text style={{ fontSize: 13, color: T.sub, lineHeight: 21 }}>{tip.text}</Text>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpanded(e => !e); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
            <Text style={{ fontSize: 12, color: T.blue }}>Why this matters</Text>
            <Text style={{ fontSize: 11, color: T.muted }}>{expanded ? '▲' : '▾'}</Text>
          </TouchableOpacity>
          {expanded && (
            <View style={ts.whyBox}>
              <Text style={{ fontSize: 12, color: T.sub, lineHeight: 20 }}>{tip.why}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggleDone(tip.id); }}
          style={[ts.doneBtn, isDone && ts.doneBtnActive]}>
          <Text style={{ fontSize: 14, color: isDone ? '#060914' : T.muted }}>✓</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CoachingScreen() {
  const [todaysTips,  setTodaysTips]  = useState([]);
  const [allTips,     setAllTips]     = useState(false);
  const [selCat,      setSelCat]      = useState(null);
  const [done,        setDone]        = useState([]);
  const [streak,      setStreak]      = useState(0);
  const [badges,      setBadges]      = useState([]);
  const [challenge,   setChallenge]   = useState(null);
  const [chalDays,    setChalDays]    = useState(0);
  const [refreshing,  setRefreshing]  = useState(false);

  const loadData = useCallback(async () => {
    const [log, napLog] = await Promise.all([Storage.getLog(), Storage.getNapLog()]);
    const lastQ  = log.length ? (log[log.length - 1].quality ?? 70) : 70;
    const hour   = new Date().getHours() + new Date().getMinutes() / 60;
    setTodaysTips(getTodaysTips(hour, lastQ));

    const state     = await Storage.getCoachingState();
    const today     = localDate(0);
    const yesterday = localDate(-1);
    let currentStreak, currentDone;
    if (state.lastDate === today) {
      currentStreak = state.streak;
      currentDone   = state.done || [];
    } else {
      currentStreak = state.lastDate === yesterday ? state.streak + 1 : 1;
      currentDone   = [];
      await Storage.saveCoachingState({ ...state, streak: currentStreak, lastDate: today, done: [] });
    }
    setStreak(currentStreak);
    setDone(currentDone);
    setBadges(earnedBadges(log, currentStreak, napLog));

    // Weekly challenge
    const chal = getCurrentChallenge();
    setChallenge(chal);
    setChalDays(state.challengeDays ?? 0);

    // Schedule daily notification (once per day, only when setting enabled)
    const [cfg, lastNotifDate] = await Promise.all([
      loadSettings(),
      Storage.getCoachingNotifDate(),
    ]);
    if (cfg.dailySleepTip && lastNotifDate !== today) {
      try {
        await Notifications.requestPermissionsAsync();
        const tipForNotif = getTodaysTips(21, lastQ)[0];
        if (tipForNotif) {
          const fireDate = new Date();
          fireDate.setHours(20, 30, 0, 0);
          if (fireDate < new Date()) fireDate.setDate(fireDate.getDate() + 1);
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `💡 ${tipForNotif.title}`,
              body: tipForNotif.text,
              sound: false,
            },
            trigger: { date: fireDate },
          });
          await Storage.saveCoachingNotifDate(today);
        }
      } catch {}
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const toggleDone = async (id) => {
    const next = done.includes(id) ? done.filter(d => d !== id) : [...done, id];
    setDone(next);
    const state = await Storage.getCoachingState();
    await Storage.saveCoachingState({ ...state, done: next });
  };

  const toggleChallengeDay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const state = await Storage.getCoachingState();
    const today = localDate(0);
    const chalDaysArr = state.challengeDaysArr || [];
    let nextArr;
    if (chalDaysArr.includes(today)) {
      nextArr = chalDaysArr.filter(d => d !== today);
    } else {
      nextArr = [...chalDaysArr, today];
    }
    const newCount = nextArr.length;
    setChalDays(newCount);
    await Storage.saveCoachingState({ ...state, challengeDays: newCount, challengeDaysArr: nextArr });
  };

  const shown = allTips
    ? (selCat ? ALL_TIPS.filter(t => t.cat === selCat) : ALL_TIPS)
    : todaysTips;

  const todayDone = done.filter(id => todaysTips.some(t => t.id === id)).length;

  return (
    <SafeAreaView style={ts.safe}>
      <ScrollView
        contentContainerStyle={ts.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 20, marginBottom: 20 }}>
          <View>
            <Text style={ts.title}>Coaching</Text>
            <Text style={{ fontSize: 13, color: T.sub }}>Daily sleep hygiene tips</Text>
          </View>
          {streak > 0 && (
            <View style={ts.streakBadge}>
              <Text style={{ fontSize: 16 }}>🔥</Text>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: T.gold }}>{streak}</Text>
                <Text style={{ fontSize: 9, color: T.muted, letterSpacing: 0.5 }}>DAYS</Text>
              </View>
            </View>
          )}
        </View>

        {/* Today / All toggle */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[['Today\'s Tips', false], ['All Tips', true]].map(([lbl, val]) => (
            <TouchableOpacity
              key={lbl}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAllTips(val); }}
              style={[ts.toggleBtn, allTips === val && ts.toggleBtnActive]}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: allTips === val ? '#060914' : T.sub }}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category filter */}
        {allTips && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingRight: 20 }}>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelCat(null); }}
                style={[ts.catBtn, !selCat && ts.catBtnActive]}>
                <Text style={{ fontSize: 11, color: !selCat ? T.accent : T.muted }}>All</Text>
              </TouchableOpacity>
              {Object.entries(CATS).map(([key, meta]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelCat(k => k === key ? null : key); }}
                  style={[ts.catBtn, selCat === key && ts.catBtnActive]}>
                  <Text style={{ fontSize: 11, color: selCat === key ? meta.color : T.muted }}>
                    {meta.icon} {meta.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Progress bar */}
        {!allTips && (
          <View style={[ts.card, { marginBottom: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={ts.mono10}>TODAY'S PROGRESS</Text>
              <Text style={{ fontSize: 12, color: todayDone === todaysTips.length && todaysTips.length > 0 ? T.accent : T.sub }}>
                {todayDone}/{todaysTips.length} done
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: T.elevated, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{
                height: '100%', borderRadius: 3, backgroundColor: T.accent,
                width: `${(todayDone / Math.max(1, todaysTips.length)) * 100}%`,
              }} />
            </View>
            {todayDone === todaysTips.length && todaysTips.length > 0 && (
              <Text style={{ fontSize: 12, color: T.accent, marginTop: 8, textAlign: 'center' }}>
                🎉 All tips completed for today!
              </Text>
            )}
          </View>
        )}

        {/* Weekly challenge */}
        {!allTips && challenge && (
          <View style={[ts.card, { marginBottom: 16, borderColor: `${T.blue}40` }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={ts.mono10}>THIS WEEK'S CHALLENGE</Text>
              <Text style={{ fontSize: 10, color: T.blue }}>{chalDays}/7 days</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <Text style={{ fontSize: 28 }}>{challenge.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text, marginBottom: 4 }}>{challenge.title}</Text>
                <Text style={{ fontSize: 12, color: T.sub, lineHeight: 20 }}>{challenge.desc}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
              {Array.from({ length: 7 }, (_, i) => (
                <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < chalDays ? T.blue : T.elevated }} />
              ))}
            </View>
            <TouchableOpacity
              onPress={toggleChallengeDay}
              style={{ paddingVertical: 10, borderRadius: 12, backgroundColor: `${T.blue}18`, borderWidth: 1, borderColor: `${T.blue}40`, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.blue }}>
                {chalDays >= 7 ? '✓ Challenge complete!' : '+ Mark today complete'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Badges */}
        {badges.length > 0 && !allTips && (
          <View style={[ts.card, { marginBottom: 16 }]}>
            <Text style={[ts.mono10, { marginBottom: 12 }]}>EARNED BADGES</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {badges.map(b => (
                <View key={b.id} style={{ alignItems: 'center', gap: 4, minWidth: 64 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: T.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${T.accent}30` }}>
                    <Text style={{ fontSize: 24 }}>{b.icon}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: T.sub, textAlign: 'center' }}>{b.title}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Tip cards */}
        {shown.map(tip => (
          <TipCard key={tip.id} tip={tip} isDone={done.includes(tip.id)} onToggleDone={toggleDone} />
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const ts = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bg },
  scroll: { paddingHorizontal: 16 },
  title:  { fontSize: 26, fontWeight: '800', color: T.text },
  mono10: { fontSize: 10, color: T.muted, letterSpacing: 1, fontWeight: '600' },
  card: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: 20, padding: 18, marginBottom: 12,
  },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(240,185,82,.12)', borderRadius: 14,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(240,185,82,.3)',
  },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: T.elevated, borderWidth: 1, borderColor: T.border,
  },
  toggleBtnActive: { backgroundColor: T.accent, borderColor: T.accent },
  catBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: T.elevated, borderWidth: 1, borderColor: T.border,
  },
  catBtnActive: { borderColor: T.accent, backgroundColor: T.accentLo },
  catPill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6 },
  doneBtn: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.elevated, borderWidth: 1, borderColor: T.border, flexShrink: 0,
  },
  doneBtnActive: { backgroundColor: T.accent, borderColor: T.accent },
  whyBox: { backgroundColor: T.elevated, borderRadius: 10, padding: 12, marginTop: 10 },
});
