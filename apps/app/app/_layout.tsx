import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
} from '@expo-google-fonts/barlow-condensed';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { colors } from '../src/theme/tokens';
import { fonts } from '../src/theme/typography';
import { SessionProvider } from '../src/lib/SessionProvider';

// Hold the splash until the fonts are ready, so nothing renders in a fallback system face
// and then reflows once Barlow and Inter land.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    // Hide on error too: a missing font should degrade to system faces, never leave the
    // app stuck behind a splash screen forever.
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.sport },
          headerTintColor: colors.onSport,
          headerTitleStyle: { fontFamily: fonts.headingBold, fontSize: 20 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* admin/ has its own Stack with its own header; without this the group renders
            a second header above it. */}
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="meer/index" options={{ title: 'Meer' }} />
        <Stack.Screen name="meer/schermnaam" options={{ title: 'Schermnaam' }} />
        <Stack.Screen name="login" options={{ title: 'Inloggen' }} />
      </Stack>
    </SessionProvider>
  );
}
