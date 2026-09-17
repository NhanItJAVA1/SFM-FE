import { Link, type Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

const scanBillHref = "/(tabs)/scan-bill" as Href;

export default function CreateScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tạo mới</Text>
      <Text style={styles.subtitle}>Chọn nghiệp vụ bạn muốn tạo.</Text>
      <Link href={scanBillHref} style={styles.primaryLink}>
        Quét hóa đơn
      </Link>
      <Link href="/accounts" style={styles.link}>
        Tạo tài khoản
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#161b22", fontSize: 30, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#68707d", fontSize: 15, marginBottom: 18 },
  primaryLink: { color: "#31c452", fontSize: 18, fontWeight: "800", marginBottom: 16 },
  link: { color: "#1f6feb", fontSize: 16, fontWeight: "700" },
});
