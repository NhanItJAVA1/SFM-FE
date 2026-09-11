import { StyleSheet, Text, View } from 'react-native';

export default function SettingsScreen() {
  return <View style={styles.container}><Text style={styles.title}>Settings</Text><Text>Configure your app preferences.</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 8 },
});