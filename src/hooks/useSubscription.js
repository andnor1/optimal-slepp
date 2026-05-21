import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY  = 'rc_premium_cache_v1';
const CACHE_TTL  = 5 * 60 * 1000; // 5 min
const RC_API_KEY = 'appl_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

let Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch {}

async function getCached() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { value, ts } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL) return value;
  } catch {}
  return null;
}

async function setCache(value) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ value, ts: Date.now() }));
  } catch {}
}

async function checkPremiumLive() {
  if (!Purchases) return false;
  try {
    const ci = await Purchases.getCustomerInfo();
    return !!ci.entitlements.active['premium'];
  } catch {
    return false;
  }
}

export function useSubscription() {
  const [isPremium,  setIsPremium]  = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [offerings,  setOfferings]  = useState(null);

  const refresh = useCallback(async (skipCache = false) => {
    setLoading(true);
    try {
      if (!skipCache) {
        const cached = await getCached();
        if (cached !== null) { setIsPremium(cached); setLoading(false); return; }
      }
      const premium = await checkPremiumLive();
      setIsPremium(premium);
      await setCache(premium);
    } catch {
      setIsPremium(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!Purchases) { setLoading(false); return; }
    try {
      Purchases.configure({ apiKey: RC_API_KEY });
    } catch {}
    refresh();
    Purchases.getOfferings().then(o => setOfferings(o)).catch(() => {});
  }, []);

  const purchase = useCallback(async (pkg) => {
    if (!Purchases || !pkg) return { success: false, error: 'Not available' };
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const ok = !!customerInfo.entitlements.active['premium'];
      if (ok) { setIsPremium(true); await setCache(true); }
      return { success: ok };
    } catch (e) {
      if (e.userCancelled) return { success: false, cancelled: true };
      return { success: false, error: e.message };
    }
  }, []);

  const restore = useCallback(async () => {
    if (!Purchases) return { success: false };
    try {
      const ci = await Purchases.restorePurchases();
      const ok = !!ci.entitlements.active['premium'];
      setIsPremium(ok);
      await setCache(ok);
      return { success: ok };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, []);

  return { isPremium, loading, offerings, refresh, purchase, restore };
}
