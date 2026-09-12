import { StyleSheet, Text, View } from 'react-native';

export default function BudgetsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ngân sách</Text>
      <Text style={styles.subtitle}>Theo dõi ngân sách sẽ hiển thị ở đây.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: '#161b22', fontSize: 30, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#68707d', fontSize: 15 },
});
