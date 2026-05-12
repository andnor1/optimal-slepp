// Inline date picker — ingen eksterne pakker
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const T = {
  elevated: '#111A2E', border: 'rgba(255,255,255,.06)',
  accent: '#5EE7B7', text: '#E2EAF4', sub: '#7A96B8', muted: '#3A4F6A',
};

const DAYS = ['søn','man','tir','ons','tor','fre','lør'];
const MONTHS = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
function formatDate(d) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

// value: "YYYY-MM-DD" string, onChange: (newValue: string) => void
export default function DatePicker({ label, value, onChange }) {
  const d = parseDate(value);
  const dayName   = DAYS[d.getDay()];
  const monthName = MONTHS[d.getMonth()];

  const shift = (days) => {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    onChange(formatDate(next));
  };

  return (
    <View style={{ flex: 1 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={s.container}>
        <TouchableOpacity onPress={() => shift(-1)} style={s.arrow} hitSlop={8}>
          <Text style={s.arrowText}>‹</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={s.dayName}>{dayName}</Text>
          <Text style={s.date}>{d.getDate()} {monthName}</Text>
        </View>
        <TouchableOpacity onPress={() => shift(1)} style={s.arrow} hitSlop={8}>
          <Text style={s.arrowText}>›</Text>
        </TouchableOpacity>
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
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.elevated, borderWidth: 1, borderColor: T.border,
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 6,
  },
  arrow: { paddingHorizontal: 4 },
  arrowText: { fontSize: 22, color: T.muted, lineHeight: 26 },
  dayName: { fontSize: 10, color: T.muted, letterSpacing: 1, fontWeight: '600' },
  date:    { fontSize: 15, fontWeight: '700', color: T.text, marginTop: 1 },
});
