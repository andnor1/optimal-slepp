import { useState, useRef, useCallback } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

export function useToast() {
  const [msg, setMsg] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const anim = useRef(null);

  const show = useCallback((message) => {
    setMsg(message);
    if (anim.current) anim.current.stop();
    anim.current = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    anim.current.start();
  }, [opacity]);

  return { msg, opacity, show };
}

export function Toast({ msg, opacity }) {
  if (!msg) return null;
  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      <Text style={styles.text}>{msg}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', bottom: 108, left: 20, right: 20,
    backgroundColor: '#1C2A3A', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(224,92,92,.4)',
    paddingVertical: 13, paddingHorizontal: 18,
    alignItems: 'center', zIndex: 999,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  text: { color: '#E05C5C', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
