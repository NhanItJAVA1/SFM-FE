import { StyleSheet, Text, View } from 'react-native';

export default function TransactionsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sổ giao dịch</Text>
      <Text style={styles.subtitle}>Danh sách giao dịch sẽ hiển thị ở đây.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: '#161b22', fontSize: 30, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#68707d', fontSize: 15 },
});
