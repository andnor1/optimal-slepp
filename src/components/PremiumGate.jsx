import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '../hooks/useSubscription';

const T = {
  surface:'#0C1220', elevated:'#111A2E',
  border:'rgba(255,255,255,.06)',
  accent:'#5EE7B7', accentLo:'rgba(94,231,183,.08)',
  gold:'#F0B952',   goldLo:'rgba(240,185,82,.1)',
  text:'#E2EAF4', sub:'#7A96B8', muted:'#3A4F6A',
};

export default function PremiumGate({ children, feature = 'This feature' }) {
  const { isPremium, loading } = useSubscription();
  const router = useRouter();

  if (loading) return null;
  if (isPremium) return children;

  return (
    <View style={s.card}>
      <Text style={s.lock}>✨</Text>
      <Text style={s.title}>Premium Feature</Text>
      <Text style={s.desc}>{feature} is available with Optimal Slepp Premium.</Text>
      <TouchableOpacity
        style={s.btn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/paywall');
        }}
      >
        <Text style={s.btnText}>Unlock with Premium</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: T.goldLo,
    borderWidth: 1,
    borderColor: `${T.gold}40`,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginVertical: 8,
  },
  lock:  { fontSize: 36, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '700', color: T.gold, marginBottom: 6 },
  desc:  { fontSize: 13, color: T.sub, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  btn: {
    backgroundColor: T.gold,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  btnText: { fontSize: 14, fontWeight: '700', color: '#060914' },
});
