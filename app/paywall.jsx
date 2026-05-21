// ─────────────────────────────────────────────────────────────────────────────
// PAYWALL – Optimal Slepp Premium
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '../src/hooks/useSubscription';

const T = {
  bg:'#060914', surface:'#0C1220', elevated:'#111A2E',
  border:'rgba(255,255,255,.06)',
  accent:'#5EE7B7', accentLo:'rgba(94,231,183,.08)',
  gold:'#F0B952',   goldLo:'rgba(240,185,82,.08)',
  blue:'#4FA3E0',
  text:'#E2EAF4', sub:'#7A96B8', muted:'#3A4F6A',
};

const FEATURES = [
  { icon: '🎙️', title: 'Night Recording & Analysis',    desc: 'Microphone-based sleep stage detection' },
  { icon: '⏰', title: 'Smart Alarm',                   desc: 'Wake at the lightest sleep phase in your window' },
  { icon: '🍎', title: 'Apple Health Sync',             desc: 'Read heart rate, write sleep data to Health' },
  { icon: '📊', title: 'Advanced Statistics',           desc: 'Weekly score, sleep debt, full trend analysis' },
  { icon: '🧠', title: 'AI Sleep Coaching',             desc: 'Personalised daily tips + weekly challenges' },
  { icon: '✈️', title: 'Jetlag Calculator',             desc: 'Day-by-day phase-shift adaptation plan' },
  { icon: '📂', title: 'Unlimited History',             desc: 'Free plan limited to last 30 nights' },
  { icon: '🔮', title: 'Sleep Insights',                desc: 'AI-generated patterns and recommendations' },
];

const PLANS = [
  { id: 'monthly', label: 'Monthly', price: '$4.99', period: '/month', badge: null,         rcId: '$rc_monthly' },
  { id: 'annual',  label: 'Annual',  price: '$29.99', period: '/year', badge: 'Best Value', rcId: '$rc_annual'  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const { offerings, purchase, restore, isPremium } = useSubscription();
  const [selected,  setSelected]  = useState('annual');
  const [busy,      setBusy]      = useState(false);
  const [restoring, setRestoring] = useState(false);

  const getPackage = useCallback((rcId) => {
    if (!offerings?.current) return null;
    return offerings.current.availablePackages.find(p => p.packageType === rcId || p.identifier === rcId) ?? null;
  }, [offerings]);

  const handlePurchase = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const plan = PLANS.find(p => p.id === selected);
    const pkg  = getPackage(plan.rcId);
    setBusy(true);
    const res = await purchase(pkg);
    setBusy(false);
    if (res.success || isPremium) {
      Alert.alert('Welcome to Premium! 🎉', 'All features are now unlocked.', [
        { text: 'Let\'s go!', onPress: () => router.back() },
      ]);
    } else if (!res.cancelled && res.error) {
      Alert.alert('Purchase failed', res.error);
    }
  }, [selected, getPackage, purchase, isPremium, router]);

  const handleRestore = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    const res = await restore();
    setRestoring(false);
    if (res.success) {
      Alert.alert('Purchases restored!', 'Premium is now active.', [
        { text: 'Great!', onPress: () => router.back() },
      ]);
    } else {
      Alert.alert('No purchases found', 'If you believe this is an error, contact support.');
    }
  }, [restore, router]);

  return (
    <SafeAreaView style={s.safe} edges={['top','bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroEmoji}>✨</Text>
          <Text style={s.heroTitle}>Optimal Slepp{'\n'}Premium</Text>
          <Text style={s.heroSub}>Science-backed sleep optimisation — unlocked</Text>
        </View>

        {/* Feature list */}
        <View style={s.featuresCard}>
          {FEATURES.map((f, i) => (
            <View key={f.title} style={[s.featureRow, i < FEATURES.length - 1 && s.featureDivider]}>
              <Text style={s.featureIcon}>{f.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
              <Text style={s.checkmark}>✓</Text>
            </View>
          ))}
        </View>

        {/* Plan picker */}
        <Text style={s.sectionLabel}>CHOOSE YOUR PLAN</Text>
        <View style={s.planRow}>
          {PLANS.map(plan => {
            const active = selected === plan.id;
            return (
              <TouchableOpacity
                key={plan.id}
                style={[s.planCard, active && s.planCardActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelected(plan.id);
                }}
                activeOpacity={0.8}
              >
                {plan.badge && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{plan.badge}</Text>
                  </View>
                )}
                <Text style={[s.planLabel, active && { color: T.gold }]}>{plan.label}</Text>
                <Text style={[s.planPrice, active && { color: T.text }]}>{plan.price}</Text>
                <Text style={s.planPeriod}>{plan.period}</Text>
                {plan.id === 'annual' && (
                  <Text style={s.planSaving}>Save 50%</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Trial note */}
        <Text style={s.trialNote}>
          7-day free trial — cancel anytime before it ends
        </Text>

        {/* CTA */}
        <TouchableOpacity
          style={[s.ctaBtn, busy && { opacity: 0.6 }]}
          onPress={handlePurchase}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy
            ? <ActivityIndicator color="#060914" />
            : <Text style={s.ctaText}>Start 7-Day Free Trial</Text>
          }
        </TouchableOpacity>

        {/* Maybe Later */}
        <TouchableOpacity style={s.laterBtn} onPress={() => router.back()}>
          <Text style={s.laterText}>Maybe Later</Text>
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity style={s.restoreBtn} onPress={handleRestore} disabled={restoring}>
          {restoring
            ? <ActivityIndicator color={T.sub} size="small" />
            : <Text style={s.restoreText}>Restore Purchases</Text>
          }
        </TouchableOpacity>

        {/* Legal */}
        <View style={s.legal}>
          <TouchableOpacity onPress={() => Linking.openURL('https://optimalslepp.app/terms')}>
            <Text style={s.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={s.legalSep}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://optimalslepp.app/privacy')}>
            <Text style={s.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.legalNote}>
          Payment will be charged to your Apple ID account. Subscription automatically renews unless
          cancelled at least 24 hours before the end of the current period.
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: T.elevated, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: T.sub, fontSize: 13, fontWeight: '600' },

  scroll: { paddingHorizontal: 20, paddingBottom: 16 },

  hero:       { alignItems: 'center', paddingVertical: 28 },
  heroEmoji:  { fontSize: 52, marginBottom: 14 },
  heroTitle:  { fontSize: 32, fontWeight: '800', color: T.text, textAlign: 'center', lineHeight: 38, marginBottom: 10 },
  heroSub:    { fontSize: 15, color: T.sub, textAlign: 'center' },

  featuresCard: {
    backgroundColor: T.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  featureDivider: { borderBottomWidth: 1, borderBottomColor: T.border },
  featureIcon:    { fontSize: 20, width: 28, textAlign: 'center' },
  featureTitle:   { fontSize: 13, fontWeight: '600', color: T.text, marginBottom: 2 },
  featureDesc:    { fontSize: 11, color: T.muted },
  checkmark:      { fontSize: 14, color: T.accent, fontWeight: '700' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: T.muted,
    letterSpacing: 1.2, marginBottom: 12,
  },
  planRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  planCard: {
    flex: 1, backgroundColor: T.surface, borderRadius: 16,
    borderWidth: 2, borderColor: T.border,
    padding: 16, alignItems: 'center',
    minHeight: 120, justifyContent: 'center',
  },
  planCardActive: { borderColor: T.gold, backgroundColor: T.goldLo },
  badge: {
    backgroundColor: T.gold, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 8,
  },
  badgeText:  { fontSize: 10, fontWeight: '800', color: '#060914' },
  planLabel:  { fontSize: 12, color: T.sub, fontWeight: '600', marginBottom: 4 },
  planPrice:  { fontSize: 22, fontWeight: '800', color: T.sub, marginBottom: 2 },
  planPeriod: { fontSize: 11, color: T.muted },
  planSaving: { fontSize: 10, color: T.accent, fontWeight: '700', marginTop: 4 },

  trialNote: { fontSize: 12, color: T.muted, textAlign: 'center', marginBottom: 18 },

  ctaBtn: {
    backgroundColor: T.gold,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  ctaText: { fontSize: 17, fontWeight: '800', color: '#060914' },

  laterBtn:    { alignItems: 'center', marginBottom: 18 },
  laterText:   { fontSize: 14, color: T.sub },

  restoreBtn:  { alignItems: 'center', marginBottom: 24 },
  restoreText: { fontSize: 13, color: T.blue },

  legal:    { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 10 },
  legalLink: { fontSize: 12, color: T.blue },
  legalSep:  { fontSize: 12, color: T.muted },
  legalNote: { fontSize: 10, color: T.muted, textAlign: 'center', lineHeight: 16 },
});
