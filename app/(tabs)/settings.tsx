import { StyleSheet, Text } from 'react-native';

import { FocusedScreenTransition } from '@/components/screen-transition';

export default function SettingsScreen() {
  return (
    <FocusedScreenTransition style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text>Configure your app preferences.</Text>
    </FocusedScreenTransition>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 8 },
});
