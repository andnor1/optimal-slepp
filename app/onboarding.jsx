// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING FLOW  –  6 steps with progress bar and animation
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  Dimensions, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import TimePicker from '../src/components/TimePicker';
import { localDate } from '../src/engine/sleepEngine';
import { Storage } from '../src/utils/storage';

const T = {
  bg:'#060914', surface:'#0C1220', elevated:'#111A2E',
  border:'rgba(255,255,255,.06)',
  accent:'#5EE7B7', accentLo:'rgba(94,231,183,.12)',
  gold:'#F0B952',
  blue:'#4FA3E0',
  text:'#E2EAF4', sub:'#7A96B8', muted:'#3A4F6A',
};

const { height: SCREEN_H } = Dimensions.get('window');

const STEPS = [
  {
    id:'welcome',
    icon:'🌙',
    title:'Welcome to\nOptimal Slepp',
    sub:'Sleep optimization for those who don\'t sleep at the same time every day.',
    cta:'Get started',
  },
  {
    id:'problem',
    icon:'😵',
    title:'Shift work disrupts\nyour sleep',
    sub:'When you switch between day and night shifts, your body loses its rhythm. You lie down but can\'t sleep – or sleep too much and still feel tired.',
    cta:'Continue',
  },
  {
    id:'solution',
    icon:'🧬',
    title:'The app uses\nmelatonin data',
    sub:'We model your body\'s melatonin curve and calculate exactly when and how long you should sleep – based on your sleep windows and history.',
    cta:'Continue',
  },
  {
    id:'learns',
    icon:'📈',
    title:'Gets better\nover time',
    sub:'Log your sleep after each session. After 3+ nights the app calibrates your personal phase and amplitude.',
    cta:'Continue',
  },
  {
    id:'name',
    icon:'👋',
    title:'What\'s your name?',
    sub:'Optional – only used for the greeting on the home screen.',
    cta:'Continue',
    input:'name',
  },
  {
    id:'woke',
    icon:'⏰',
    title:'When did you wake up\ntoday?',
    sub:'This is the starting point for your first sleep schedule.',
    cta:'Start app',
    input:'time',
  },
];

const LEARN_MILESTONES = [
  [T.accent, '3+ nights',  'Personal melatonin phase estimated'],
  [T.blue,   '7+ nights',  'Good calibration of sleep pattern'],
  [T.gold,   '30+ nights', 'Precise individual sleep model'],
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [woke, setWoke] = useState('08:00');

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const prog    = step / (STEPS.length - 1);

  const animateTransition = (callback) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue:0, duration:150, useNativeDriver:true }),
      Animated.timing(slideAnim, { toValue:-20, duration:150, useNativeDriver:true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue:1, duration:250, useNativeDriver:true }),
        Animated.timing(slideAnim, { toValue:0, duration:250, useNativeDriver:true }),
      ]).start();
    });
  };

  const goNext = async () => {
    if (isLast) {
      // Save and navigate
      await Storage.setOnboarded();
      if (name.trim()) await Storage.saveUsername(name.trim());
      const today = localDate(0);
      await Storage.saveLastWoke(today, woke);
      router.replace('/(tabs)/plan');
      return;
    }
    animateTransition(() => setStep(s => s + 1));
  };

  const goBack = () => {
    if (step === 0) return;
    animateTransition(() => setStep(s => s - 1));
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex:1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Progress bar ── */}
        <View style={s.progressTrack}>
          <Animated.View style={[s.progressFill, { width:`${prog * 100}%` }]} />
        </View>

        {/* ── Back ── */}
        <View style={s.topBar}>
          {step > 0 && (
            <TouchableOpacity onPress={goBack} hitSlop={12}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Content ── */}
        <Animated.View style={[s.content, { opacity:fadeAnim, transform:[{ translateY:slideAnim }] }]}>
          <Text style={s.icon}>{current.icon}</Text>
          <Text style={s.stepTitle}>{current.title}</Text>
          <Text style={s.stepSub}>{current.sub}</Text>

          {current.id === 'learns' && (
            <View style={{ marginBottom:28 }}>
              {LEARN_MILESTONES.map(([col, lbl, desc]) => (
                <View key={lbl} style={s.milestoneRow}>
                  <View style={[s.milestoneDot, { backgroundColor:col }]} />
                  <Text style={{ fontSize:13 }}>
                    <Text style={{ fontWeight:'600', color:col }}>{lbl} </Text>
                    <Text style={{ color:T.sub }}>{desc}</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}

          {current.input === 'name' && (
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={goNext}
              placeholder="Your name"
              placeholderTextColor={T.muted}
              style={s.nameInput}
            />
          )}

          {current.input === 'time' && (
            <View style={{ marginBottom:8 }}>
              <TimePicker value={woke} onChange={setWoke} />
            </View>
          )}
        </Animated.View>

        {/* ── Bottom ── */}
        <View style={s.bottom}>
          {/* Dots */}
          <View style={s.dotsRow}>
            {STEPS.map((_, i) => (
              <View key={i} style={[s.dot, i === step && s.dotActive]} />
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity onPress={goNext} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>
              {isLast ? '🚀 Start the app' : current.cta}
            </Text>
          </TouchableOpacity>

          {step === 0 && (
            <Text style={s.disclaimer}>No account needed · Everything stored locally</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:T.bg },
  progressTrack: {
    height:3, backgroundColor:T.elevated, marginHorizontal:0,
  },
  progressFill: {
    height:'100%',
    backgroundColor:T.accent,
    borderRadius:2,
  },
  topBar: {
    paddingHorizontal:20, paddingVertical:12, minHeight:44, justifyContent:'center',
  },
  backBtn: { fontSize:14, color:T.sub },
  content: {
    flex:1, paddingHorizontal:28, paddingBottom:20, justifyContent:'center',
  },
  icon: {
    fontSize:72, lineHeight:80, marginBottom:32,
  },
  stepTitle: {
    fontSize:32, fontWeight:'800', letterSpacing:-1.2,
    color:T.text, marginBottom:16, lineHeight:38,
  },
  stepSub: {
    fontSize:16, color:T.sub, lineHeight:26, marginBottom:32,
  },
  milestoneRow: {
    flexDirection:'row', alignItems:'center', gap:12, marginBottom:12,
  },
  milestoneDot: {
    width:8, height:8, borderRadius:4, flexShrink:0,
  },
  nameInput: {
    fontSize:18, color:T.text,
    backgroundColor:T.surface, borderRadius:16,
    paddingVertical:14, paddingHorizontal:18,
    borderWidth:1, borderColor:T.border, marginBottom:8,
  },
  bottom: {
    paddingHorizontal:24, paddingBottom:48,
  },
  dotsRow: {
    flexDirection:'row', justifyContent:'center', gap:6, marginBottom:24,
  },
  dot: {
    width:6, height:6, borderRadius:3, backgroundColor:T.muted,
  },
  dotActive: {
    width:20, backgroundColor:T.accent,
  },
  primaryBtn: {
    paddingVertical:15, borderRadius:16,
    backgroundColor:T.accent, alignItems:'center',
    shadowColor:T.accent, shadowOffset:{ width:0, height:8 },
    shadowOpacity:0.25, shadowRadius:16, elevation:8,
  },
  primaryBtnText: {
    fontSize:15, fontWeight:'700', color:'#060914',
  },
  disclaimer: {
    fontSize:12, color:T.muted, textAlign:'center', marginTop:14,
  },
});
