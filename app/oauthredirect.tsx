import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/hooks/use-app-theme';

WebBrowser.maybeCompleteAuthSession();

export default function OAuthRedirectScreen() {
  const theme = useAppTheme();
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
        return;
      }

      router.replace('/auth/login');
    }, 300);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.screen }]}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
