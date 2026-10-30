import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppTypographyProvider } from "@/components/app-text";
import { useAppFonts } from "@/hooks/use-app-fonts";
import { useAppTheme } from "@/hooks/use-app-theme";
import { restoreAuthSession } from "@/stores/persistedAuthSession";
import { restoreThemeMode } from "@/stores/themePreference";

export default function RootLayout() {
  const theme = useAppTheme();
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontError) {
      console.warn("Unable to load Inter; using system fonts.", fontError);
    }
  }, [fontError]);

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
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
