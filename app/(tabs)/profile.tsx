import { StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
  return <View style={styles.container}><Text style={styles.title}>Profile</Text><Text>Manage your user information.</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 8 },
});
