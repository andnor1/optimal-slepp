// ─────────────────────────────────────────────────────────────────────────────
// useSmartAlarm
// Schedules expo-notifications alarms and handles smart wake logic.
// Smart wake: triggers alarm early when sleep depth > threshold in window.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { nowMin, minToTime, sleepDepthFromRMS } from '../engine/sleepEngine';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useSmartAlarm() {
  const [alarms,       setAlarms]       = useState([]);
  const [ringing,      setRinging]      = useState(false);
  const [currentAlarm, setCurrentAlarm] = useState(null);
  const soundRef  = useRef(null);
  const tickRef   = useRef(null);
  const volumeRef = useRef(0.02);

  // ── Request notification permission ────────────────────────────────────
  useEffect(() => {
    Notifications.requestPermissionsAsync();
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      stopAlarm();
    });
    return () => sub.remove();
  }, []);

  // ── Schedule an alarm ───────────────────────────────────────────────────
  const scheduleAlarm = useCallback(async (alarm) => {
    if (alarm.notifId) {
      await Notifications.cancelScheduledNotificationAsync(alarm.notifId).catch(() => {});
    }
    const fireDate = new Date();
    fireDate.setHours(Math.floor((alarm.fireAt % 1440) / 60));
    fireDate.setMinutes(alarm.fireAt % 60);
    fireDate.setSeconds(0);
    if (fireDate < new Date()) fireDate.setDate(fireDate.getDate() + 1);

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Optimal Slepp – time to wake up',
        body: alarm.label,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: { date: fireDate },
    });
    return { ...alarm, notifId };
  }, []);

  // ── Smart wake tick ──────────────────────────────────────────────────────
  const checkSmartWake = useCallback((rmsHistory) => {
    const now   = nowMin();
    const depth = sleepDepthFromRMS(rmsHistory);
    const LIGHT_SLEEP_THRESHOLD = 0.65;

    setAlarms(prev => {
      let changed = false;
      const updated = prev.map(a => {
        if (!a.fired && !a.smartFired && a.smartWakeEnabled
            && now >= a.smartWakeStart && now <= a.fireAt
            && depth >= LIGHT_SLEEP_THRESHOLD) {
          changed = true;
          triggerAlarm({ ...a, label: `Smart Wake · ${minToTime(now)}` });
          return { ...a, smartFired: true, fired: true };
        }
        return a;
      });
      return changed ? updated : prev;
    });
  }, []);

  // ── Trigger alarm sound ─────────────────────────────────────────────────
  const triggerAlarm = useCallback(async (alarm) => {
    setRinging(true);
    setCurrentAlarm(alarm);
    volumeRef.current = 0.02;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/alarm.mp3'),
      { isLooping: true, volume: volumeRef.current },
    );
    soundRef.current = sound;
    await sound.playAsync();

    // Ramp volume 0.02 → 1.0 over 3 minutes
    tickRef.current = setInterval(async () => {
      volumeRef.current = Math.min(1.0, volumeRef.current + (1.0 - 0.02) / 180);
      await soundRef.current?.setVolumeAsync(volumeRef.current).catch(() => {});
      if (volumeRef.current > 0.5) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }, 1000);
  }, []);

  // ── Stop alarm ───────────────────────────────────────────────────────────
  const stopAlarm = useCallback(async () => {
    clearInterval(tickRef.current);
    await soundRef.current?.stopAsync().catch(() => {});
    await soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    setRinging(false);
    setCurrentAlarm(null);
    volumeRef.current = 0.02;
  }, []);

  return { alarms, setAlarms, ringing, currentAlarm, scheduleAlarm, checkSmartWake, triggerAlarm, stopAlarm };
}
