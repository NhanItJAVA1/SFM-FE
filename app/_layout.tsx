import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { restoreAuthSession } from '@/stores/persistedAuthSession';
import { restoreThemeMode } from '@/stores/themePreference';

export default function RootLayout() {
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
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#31c452" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#020204',
    flex: 1,
    justifyContent: 'center',
  },
});
