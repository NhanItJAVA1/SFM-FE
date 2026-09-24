import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export default function OAuthRedirectScreen() {
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
    <View style={styles.container}>
      <ActivityIndicator color="#31c452" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#020204',
    flex: 1,
    justifyContent: 'center',
  },
});
