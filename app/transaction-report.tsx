import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FocusedScreenTransition } from "@/components/screen-transition";

export default function TransactionReportScreen() {
  return (
    <FocusedScreenTransition style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Báo cáo giao dịch</Text>
          <View style={styles.spacer} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Báo cáo dòng tiền ròng</Text>
          <Text style={styles.description}>Phân tích tỷ lệ thu, chi và phân bổ giao dịch theo nhóm hạng mục.</Text>
        </View>
      </ScrollView>
    </FocusedScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f7f8fa", flex: 1 },
  content: { padding: 18 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    marginTop: 20,
  },
  back: { color: "#252a33", fontSize: 34 },
  title: { color: "#171a21", fontSize: 21, fontWeight: "800" },
  spacer: { width: 24 },
  card: { backgroundColor: "#fff", borderColor: "#e5e8ed", borderRadius: 14, borderWidth: 1, padding: 18 },
  cardTitle: { color: "#252a33", fontSize: 18, fontWeight: "800" },
  description: { color: "#737984", fontSize: 14, lineHeight: 21, marginTop: 8 },
});
