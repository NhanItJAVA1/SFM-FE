import { Typography } from '@/theme/typography';
import { AppText as Text } from '@/components/app-text';
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { FocusedScreenTransition } from "@/components/screen-transition";
import { ScreenGradientBackground } from "@/components/screen-gradient-background";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";

export default function TransactionReportScreen() {
  const theme = useAppTheme();
  const isDark = useThemeMode() === "dark";
  return (
    <FocusedScreenTransition style={[styles.screen, isDark && { backgroundColor: theme.screen }]}>
      <ScreenGradientBackground darkOnly />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.back, isDark && { color: theme.textSoft }]}>‹</Text>
          </Pressable>
          <Text style={[styles.title, isDark && { color: theme.text }]}>Báo cáo giao dịch</Text>
          <View style={styles.spacer} />
        </View>
        <View style={[styles.card, isDark && { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, isDark && { color: theme.textSoft }]}>Báo cáo dòng tiền ròng</Text>
          <Text style={[styles.description, isDark && { color: theme.textMuted }]}>Phân tích tỷ lệ thu, chi và phân bổ giao dịch theo nhóm hạng mục.</Text>
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
  title: { ...Typography.title, color: "#171a21" },
  spacer: { width: 24 },
  card: { backgroundColor: "#fff", borderColor: "#e5e8ed", borderRadius: 14, borderWidth: 1, padding: 18 },
  cardTitle: { color: "#252a33", fontSize: 18, fontWeight: '600' },
  description: { color: "#737984", fontSize: 14, lineHeight: 21, marginTop: 8 },
});
