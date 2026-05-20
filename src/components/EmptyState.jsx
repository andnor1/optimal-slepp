import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Line, G, Ellipse } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

const T = {
  bg: '#060914', surface: '#0C1220', elevated: '#111A2E',
  accent: '#5EE7B7', accentLo: 'rgba(94,231,183,.12)',
  text: '#E2EAF4', sub: '#7A96B8', muted: '#3A4F6A',
  border: 'rgba(255,255,255,.06)',
};

function MoonIllustration() {
  return (
    <Svg width={96} height={96} viewBox="0 0 96 96">
      <Circle cx={48} cy={48} r={44} fill={T.elevated} />
      <Circle cx={48} cy={48} r={28} fill={`${T.accent}18`} stroke={`${T.accent}40`} strokeWidth={1} />
      <Circle cx={48} cy={48} r={14} fill={`${T.accent}30`} />
      <Path
        d="M 48 22 Q 58 32 58 44 Q 58 58 48 64 Q 62 60 66 48 Q 70 36 62 26 Z"
        fill={`${T.accent}50`}
      />
      <Circle cx={34} cy={34} r={3} fill={T.accent} opacity={0.4} />
      <Circle cx={64} cy={40} r={2} fill={T.accent} opacity={0.25} />
      <Circle cx={38} cy={62} r={1.5} fill={T.accent} opacity={0.35} />
      <Circle cx={60} cy={60} r={1} fill={T.accent} opacity={0.2} />
    </Svg>
  );
}

function ChartIllustration() {
  return (
    <Svg width={96} height={96} viewBox="0 0 96 96">
      <Circle cx={48} cy={48} r={44} fill={T.elevated} />
      <Line x1={20} y1={72} x2={76} y2={72} stroke={T.muted} strokeWidth={1} strokeOpacity={0.6} />
      <Path
        d="M 24 64 Q 34 44 44 52 Q 54 60 64 36 Q 68 28 72 32"
        stroke={T.accent} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M 24 64 Q 34 44 44 52 Q 54 60 64 36 Q 68 28 72 32 L 72 72 L 24 72 Z"
        fill={`${T.accent}12`}
      />
      <Circle cx={24} cy={64} r={3.5} fill={T.accent} />
      <Circle cx={44} cy={52} r={3.5} fill={T.accent} />
      <Circle cx={64} cy={36} r={3.5} fill={T.accent} />
      <Circle cx={72} cy={32} r={3.5} fill={T.accent} />
    </Svg>
  );
}

function AlarmIllustration() {
  return (
    <Svg width={96} height={96} viewBox="0 0 96 96">
      <Circle cx={48} cy={48} r={44} fill={T.elevated} />
      <Circle cx={48} cy={52} r={26} fill={`${T.accent}15`} stroke={`${T.accent}50`} strokeWidth={2} />
      <Path d="M 48 36 L 48 52 L 58 62" stroke={T.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={48} cy={52} r={3} fill={T.accent} />
      <Path d="M 28 28 Q 24 22 30 18" stroke={T.accent} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.6} />
      <Path d="M 68 28 Q 72 22 66 18" stroke={T.accent} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.6} />
    </Svg>
  );
}

const ICONS = { moon: MoonIllustration, chart: ChartIllustration, alarm: AlarmIllustration };

export function EmptyState({ icon = 'moon', title, subtitle, ctaLabel, onCta }) {
  const Illustration = ICONS[icon] ?? MoonIllustration;

  const handleCta = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCta?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.illustrationWrap}>
        <Illustration />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {ctaLabel && onCta ? (
        <TouchableOpacity onPress={handleCta} style={styles.btn} activeOpacity={0.85}>
          <Text style={styles.btnText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  illustrationWrap: {
    width: 96, height: 96, marginBottom: 28,
    shadowColor: '#5EE7B7', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 24,
  },
  title: {
    fontSize: 17, fontWeight: '700', color: T.text,
    marginBottom: 10, textAlign: 'center',
  },
  subtitle: {
    fontSize: 13, color: T.sub, textAlign: 'center',
    lineHeight: 21, marginBottom: 28, maxWidth: 280,
  },
  btn: {
    paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14,
    backgroundColor: T.accent, alignItems: 'center',
    shadowColor: T.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  btnText: { fontSize: 14, fontWeight: '700', color: '#060914' },
});
