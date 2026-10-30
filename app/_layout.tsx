import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { clearAuthSession, restoreAuthSession } from '@/stores/persistedAuthSession';
import { restoreThemeMode } from '@/stores/themePreference';
import { useAppTheme } from '@/hooks/use-app-theme';
import { setApiAuthExpiredHandler } from '@/api/axiosClient';
import { AppTypographyProvider } from '@/components/app-text';
import { useAppFonts } from '@/hooks/use-app-fonts';

export default function RootLayout() {
  const router = useRouter();
  const theme = useAppTheme();
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontError) {
      console.warn('Unable to load Inter; using system fonts.', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    // Expired-session redirects were added for the web admin flow. Keep the
    // previous mobile refresh-token behavior unchanged.
    if (Platform.OS !== 'web') {
      return;
    }

    setApiAuthExpiredHandler(async () => {
      await clearAuthSession();
      router.replace('/auth/login');
    });

    return () => setApiAuthExpiredHandler(null);
  }, [router]);

  useEffect(() => {
    async function hydrateSession() {
      await Promise.all([restoreThemeMode(), restoreAuthSession()]);
      setIsRestoringSession(false);
    }

    hydrateSession();
  }, []);

  if (isRestoringSession || (!fontsLoaded && !fontError)) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.screen }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <AppTypographyProvider ready={fontsLoaded}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.screen } }} />
    </AppTypographyProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
