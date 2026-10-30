import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { restoreAuthSession } from '@/stores/persistedAuthSession';
import { restoreThemeMode } from '@/stores/themePreference';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function RootLayout() {
  const theme = useAppTheme();
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  useEffect(() => {
    async function hydrateSession() {
      await Promise.all([restoreThemeMode(), restoreAuthSession()]);
      setIsRestoringSession(false);
    }

    hydrateSession();
  }, []);

  if (isRestoringSession) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.screen }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.screen } }} />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
