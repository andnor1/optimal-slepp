import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Storage } from '../src/utils/storage';

function OnboardingGate() {
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const onboarded = await Storage.isOnboarded();
      const inOnboarding = segments[0] === 'onboarding';
      if (!onboarded && !inOnboarding) {
        router.replace('/onboarding');
      }
    })();
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#060914" />
        <OnboardingGate />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#060914' } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
