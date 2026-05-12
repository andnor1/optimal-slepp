// Inline time picker — ingen eksterne pakker
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const T = {
  elevated: '#111A2E', border: 'rgba(255,255,255,.06)',
  accent: '#5EE7B7', text: '#E2EAF4', muted: '#3A4F6A',
};

// value: "HH:MM" string, onChange: (newValue: string) => void
export default function TimePicker({ label, value, onChange }) {
  const [h, m] = value.split(':').map(Number);

  const adjust = (part, delta) => {
    let nh = h, nm = m;
    if (part === 'h') nh = (h + delta + 24) % 24;
    else               nm = (m + delta + 60) % 60;
    onChange(`${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`);
  };

  return (
    <View style={{ flex: 1 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={s.container}>
        {/* Hours */}
        <View style={s.unit}>
          <TouchableOpacity onPress={() => adjust('h', 1)} style={s.btn} hitSlop={8}>
            <Text style={s.arrow}>▲</Text>
          </TouchableOpacity>
          <Text style={s.digit}>{String(h).padStart(2,'0')}</Text>
          <TouchableOpacity onPress={() => adjust('h', -1)} style={s.btn} hitSlop={8}>
            <Text style={s.arrow}>▼</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.colon}>:</Text>

        {/* Minutes */}
        <View style={s.unit}>
          <TouchableOpacity onPress={() => adjust('m', 15)} style={s.btn} hitSlop={8}>
            <Text style={s.arrow}>▲</Text>
          </TouchableOpacity>
          <Text style={s.digit}>{String(m).padStart(2,'0')}</Text>
          <TouchableOpacity onPress={() => adjust('m', -15)} style={s.btn} hitSlop={8}>
            <Text style={s.arrow}>▼</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: {
    fontSize: 10, fontWeight: '600', color: T.muted,
    letterSpacing: 1, marginBottom: 6,
  },
  container: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.elevated, borderWidth: 1, borderColor: T.border,
    borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10,
  },
  unit: { alignItems: 'center', paddingHorizontal: 4 },
  btn: { paddingVertical: 2 },
  arrow: { fontSize: 10, color: T.muted },
  digit: { fontSize: 20, fontWeight: '700', color: T.text, lineHeight: 28 },
  colon: { fontSize: 20, fontWeight: '700', color: T.muted, paddingHorizontal: 2, marginTop: -4 },
});
