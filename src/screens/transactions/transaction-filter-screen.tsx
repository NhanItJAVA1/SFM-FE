import { Typography } from '@/theme/typography';
import { AppText as Text } from '@/components/app-text';
import { useMemo, useState } from "react";
import { ImageBackground, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ArrowLeft, ChevronDown, Headset, Home, LayoutGrid } from "lucide-react-native";
import { getCategoryVisual } from '@/components/category-icon';

import type { Category } from "@/api/categoriesApi";
import type { FinancialAccount } from "@/api/financialAccountApi";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { ScreenGradientBackground } from "@/components/screen-gradient-background";
import type { AppTheme } from "@/theme/appTheme";

export type TransactionFilters = {
  month: string | null;
  accountId: number | null;
  categoryId: number | null;
};

export const emptyTransactionFilters: TransactionFilters = { month: null, accountId: null, categoryId: null };
const background = require("../../../assets/expo.icon/Assets/Serene Blue Abstract Gradient Wallpaper.png");

export function getTransactionMonthRange(month: string | null) {
  if (!month) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null;
  const days = new Date(year, monthNumber, 0).getDate();
  return { fromDate: `${month}-01`, toDate: `${month}-${String(days).padStart(2, "0")}` };
}

export function TransactionFilterScreen({
  visible, initialFilters, accounts, categories, onClose, onApply, onHome, onSupport,
}: {
  visible: boolean;
  initialFilters: TransactionFilters;
  accounts: FinancialAccount[];
  categories: Category[];
  onClose: () => void;
  onApply: (filters: TransactionFilters) => void;
  onHome: () => void;
  onSupport: () => void;
}) {
  const theme = useAppTheme();
  const isDark = useThemeMode() === "dark";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [draft, setDraft] = useState(initialFilters);
  const [wasVisible, setWasVisible] = useState(visible);
  const [monthCount, setMonthCount] = useState(5);
  const [referenceDate] = useState(() => new Date());

  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(initialFilters);
      const [year, month] = initialFilters.month?.split("-").map(Number) ?? [];
      const selectedOffset = (referenceDate.getFullYear() - year) * 12 + referenceDate.getMonth() + 1 - month;
      setMonthCount(Number.isFinite(selectedOffset) ? Math.max(5, selectedOffset + 1) : 5);
    }
  }

  const months = Array.from({ length: monthCount }, (_, offset) => {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`,
    };
  });
  const hasFilters = draft.month !== null || draft.accountId !== null || draft.categoryId !== null;

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaProvider style={styles.screen}>
        <ScreenGradientBackground darkOnly />
        {!isDark ? <View pointerEvents="none" style={styles.background}>
          <ImageBackground source={background} imageStyle={styles.backgroundImage} style={StyleSheet.absoluteFill} />
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id="filterBackgroundFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.screen} stopOpacity={0} />
                <Stop offset="1" stopColor={theme.screen} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#filterBackgroundFade)" />
          </Svg>
        </View> : null}
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Quay lại sổ giao dịch" onPress={onClose} style={styles.backButton}>
              <ArrowLeft size={22} color={theme.text} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>Bộ lọc Lịch sử giao dịch</Text>
            <View style={styles.headerTools}>
              <Pressable accessibilityRole="button" accessibilityLabel="Trợ lý AI" onPress={onSupport} style={styles.toolButton}>
                <Headset size={20} color={theme.text} />
              </Pressable>
              <View style={styles.toolDivider} />
              <Pressable accessibilityRole="button" accessibilityLabel="Về Tổng quan" onPress={onHome} style={styles.toolButton}>
                <Home size={20} color={theme.text} />
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Theo thời gian</Text>
              <View style={styles.grid}>
                {[{ value: null, label: "Tất cả" }, ...months].map((option) => (
                  <Pressable
                    key={option.value ?? "all"}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: draft.month === option.value }}
                    onPress={() => setDraft((current) => ({ ...current, month: option.value }))}
                    style={[styles.tile, draft.month === option.value && styles.tileSelected]}
                  >
                    <Text style={styles.tileText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => setMonthCount((count) => count + 6)} style={styles.showMore}>
                <Text style={styles.showMoreText}>Xem thêm</Text><ChevronDown size={17} color={theme.primary} />
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Theo tài khoản/ví</Text>
              <View style={styles.grid}>
                {[{ id: null, name: "Tất cả" }, ...accounts].map((account) => (
                  <Pressable
                    key={account.id ?? "all"}
                    accessibilityRole="radio"
                    accessibilityLabel={`Ví: ${account.name}`}
                    accessibilityState={{ checked: draft.accountId === account.id }}
                    onPress={() => setDraft((current) => ({ ...current, accountId: account.id }))}
                    style={[styles.tile, styles.accountTile, draft.accountId === account.id && styles.tileSelected]}
                  >
                    <Text numberOfLines={3} style={styles.tileText}>{account.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Theo danh mục</Text>
              <View style={[styles.grid, styles.serviceGrid]}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel="Danh mục: Tất cả"
                  accessibilityState={{ checked: draft.categoryId === null }}
                  onPress={() => setDraft((current) => ({ ...current, categoryId: null }))}
                  style={[styles.serviceTile, draft.categoryId === null && styles.tileSelected]}
                >
                  <LayoutGrid size={25} color={theme.primary} />
                  <Text style={styles.serviceText}>Tất cả</Text>
                </Pressable>
                {categories.map((category) => {
                  const { Icon, color } = getCategoryVisual(category);
                  return (
                    <Pressable
                      key={category.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`Danh mục: ${category.name}`}
                      accessibilityState={{ checked: draft.categoryId === category.id }}
                      onPress={() => setDraft((current) => ({ ...current, categoryId: category.id }))}
                      style={[styles.serviceTile, draft.categoryId === category.id && styles.tileSelected]}
                    >
                      <Icon size={25} color={color} strokeWidth={2} />
                      <Text numberOfLines={3} style={styles.serviceText}>{category.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable disabled={!hasFilters} accessibilityRole="button" onPress={() => setDraft(emptyTransactionFilters)} style={[styles.clearButton, !hasFilters && styles.clearDisabled]}>
              <Text style={[styles.clearText, !hasFilters && styles.clearTextDisabled]}>Xóa bộ lọc</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onApply(draft)} style={styles.applyButton}>
              <Text style={styles.applyText}>Áp dụng</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.screen, flex: 1 },
    safeArea: { flex: 1 },
    background: { position: "absolute", left: 0, right: 0, top: 0, height: 190, overflow: "hidden" },
    backgroundImage: { opacity: 0.18 },
    header: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 },
    backButton: { alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 19, backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth },
    title: { ...Typography.title, color: theme.text, flex: 1 },
    headerTools: { alignItems: "center", flexDirection: "row", borderRadius: 22, backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth },
    toolButton: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
    toolDivider: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: theme.borderStrong },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 32 },
    section: { marginBottom: 30 },
    sectionTitle: { ...Typography.section, color: theme.text, marginBottom: 14 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
    serviceGrid: { justifyContent: "flex-start", columnGap: "1.33%" },
    tile: { width: "32%", minHeight: 64, paddingHorizontal: 5, paddingVertical: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.card, borderRadius: 8, borderWidth: 1.5, borderColor: "transparent" },
    accountTile: { minHeight: 76 },
    tileSelected: { backgroundColor: theme.primaryPressed, borderColor: theme.primary },
    tileText: { color: theme.text, fontSize: 13, lineHeight: 19, textAlign: "center" },
    showMore: { alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, minHeight: 44, marginTop: 8 },
    showMoreText: { color: theme.primary, fontSize: 14, fontWeight: '600' },
    serviceTile: { width: "24%", minHeight: 104, paddingHorizontal: 4, paddingVertical: 14, gap: 10, alignItems: "center", backgroundColor: theme.card, borderRadius: 8, borderWidth: 1.5, borderColor: "transparent" },
    serviceText: { color: theme.text, fontSize: 12, lineHeight: 18, textAlign: "center" },
    footer: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.sheet, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
    clearButton: { alignItems: "center", justifyContent: "center", flex: 1, minHeight: 48, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.primaryPressed },
    clearDisabled: { backgroundColor: theme.cardAlt },
    clearText: { color: theme.primary, fontSize: 16, fontWeight: '600' },
    clearTextDisabled: { color: theme.textSubtle, opacity: 0.55 },
    applyButton: { alignItems: "center", justifyContent: "center", flex: 1, minHeight: 48, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.primary },
    applyText: { ...Typography.button, color: theme.textInverse },
  });
}
