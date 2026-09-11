import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return <View style={styles.container}><Text style={styles.title}>Home</Text><Text>Welcome to SFM.</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 8 },
});