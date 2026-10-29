import { BottomPopup, BottomPopupSheet } from "@/components/bottom-popup";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenGradientBackground } from "@/components/screen-gradient-background";
import { ArrowDown, ArrowDownToLine, ArrowUp, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, Funnel, Landmark, LayoutGrid, ReceiptText, Search, SlidersHorizontal, Sparkles, Wallet, X } from "lucide-react-native";

import { FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";
import { categoriesApi, type Category } from "@/api/categoriesApi";
import type { AIAnomaly } from "@/api/aiApi";
import { CategorySpendingResponse, Transaction, TransactionType, transactionsApi } from "@/api/transactionsApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { useAIAnalysis } from "@/hooks/use-ai-analysis";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useTransactionFeed } from "@/hooks/use-transaction-feed";
import { requestSpendingStatsFromTransactions } from "@/stores/spendingStatsNavigation";
import type { AppTheme } from "@/theme/appTheme";
import { emptyTransactionFilters, getTransactionMonthRange, TransactionFilterScreen, type TransactionFilters } from "@/screens/transactions/transaction-filter-screen";
import { calendarDay, getAnomalyWindow } from "@/screens/transactions/anomaly-window";
type AnomalyDateFilter = string;
type AnomalyFilters = { category: string; date: AnomalyDateFilter; reason: string };

function matchesAnomalyFilters(anomaly: AIAnomaly, filters: AnomalyFilters) {
  const categoryKey = anomaly.categoryId === null ? "uncategorized" : String(anomaly.categoryId);
  return (
    (filters.category === "all" || categoryKey === filters.category) &&
    (filters.date === "all" || anomaly.date.slice(0, 7) === filters.date) &&
    (filters.reason === "all" || anomaly.reasonCodes?.includes(filters.reason))
  );
}

const anomalyReasonLabels: Record<string, string> = {
  HIGH_VS_CATEGORY_MEDIAN: "Cao trong danh mục",
  HIGH_CATEGORY_ROBUST_Z: "Lệch khỏi danh mục",
  LARGE_SHARE_OF_BALANCE: "Chi lớn so với số dư hiện tại",
  LIMITED_HISTORY: "Chưa đủ dữ liệu",
};

function useTransactionStyles() {
  const theme = useAppTheme();

  return useMemo(() => createStyles(theme), [theme]);
}

function formatMoney(amount: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", { currency, maximumFractionDigits: 0, style: "currency" }).format(amount).replace(/\s*₫$/, "đ");
}

function isPositive(type: TransactionType) {
  return type === "Income" || type === "TransferIn";
}

export default function TransactionsScreen() {
  const theme = useAppTheme();
  const styles = useTransactionStyles();
  const [filters, setFilters] = useState<TransactionFilters>(emptyTransactionFilters);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const listRef = useRef<FlatList<Transaction>>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const { transactions, totalCount, isLoading, isRefreshing, isLoadingMore, error: transactionError, loadMoreError, hasMore, reload, loadMore } = useTransactionFeed({
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    ...getTransactionMonthRange(filters.month),
  });
  const selectedAccountId = filters.accountId;
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [isUtilitiesOpen, setIsUtilitiesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [monthlySpending, setMonthlySpending] = useState<CategorySpendingResponse | null>(null);
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);
  const [anomalyCategoryFilter, setAnomalyCategoryFilter] = useState("all");
  const [anomalyDateFilter, setAnomalyDateFilter] = useState<AnomalyDateFilter>("all");
  const [anomalyReasonFilter, setAnomalyReasonFilter] = useState("all");
  const [showAllAnomalies, setShowAllAnomalies] = useState(false);
  const [isAnomalyFilterOpen, setIsAnomalyFilterOpen] = useState(false);
  const { analysis, isLoading: isAnalysisLoading, error: analysisError, refresh: refreshAI } = useAIAnalysis();
  const anomalyWindow = useMemo(() => getAnomalyWindow(analysis?.metadata.asOf, analysis?.metadata.periodDays), [analysis]);

  const loadMonthlySpending = useCallback(async () => {
    try {
      const response = await transactionsApi.categorySpending();
      setMonthlySpending(response.data);
    } catch (error) {
      console.warn("Không tải được tổng quan chi tiêu tháng", error);
    }
  }, []);

  const loadFilterCategories = useCallback(async () => {
    try {
      const response = await categoriesApi.list();
      setCategories(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.warn("Không tải được danh mục bộ lọc", error);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await financialAccountApi.list();
      setAccounts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.warn("Không tải được danh sách ví", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshAI();
      void loadAccounts();
    }, [loadAccounts, refreshAI]),
  );

  useFocusEffect(
    useCallback(() => {
      void loadMonthlySpending();
      void loadFilterCategories();
    }, [loadFilterCategories, loadMonthlySpending]),
  );

  const anomalies = useMemo(
    () => (analysis?.anomalySummary.assessments ?? [])
      .filter((row): row is AIAnomaly => row.status === "anomaly")
      .filter((anomaly) => {
      const day = calendarDay(anomaly.date);
      return anomalyWindow === null || (day !== null && day >= anomalyWindow.start && day <= anomalyWindow.end);
    }),
    [analysis, anomalyWindow],
  );
  const anomalyCategories = useMemo(() => {
    const categories = new Map<string, string>();

    anomalies.forEach((anomaly) => {
      const key = anomaly.categoryId === null ? "uncategorized" : String(anomaly.categoryId);
      categories.set(key, anomaly.category || "Chưa phân loại");
    });

    return [...categories.entries()].sort((left, right) => left[1].localeCompare(right[1], "vi"));
  }, [anomalies]);
  const anomalyReasons = useMemo(
    () => [...new Set(anomalies.flatMap((anomaly) => anomaly.reasonCodes ?? []))].sort(),
    [anomalies],
  );
  const filteredAnomalies = useMemo(() => {
    return anomalies
      .filter((anomaly) => matchesAnomalyFilters(anomaly, { category: anomalyCategoryFilter, date: anomalyDateFilter, reason: anomalyReasonFilter }))
      .filter((anomaly) => !searchQuery.trim() || [anomaly.category, String(anomaly.amount), ...(anomaly.reasonCodes ?? []).map((code) => anomalyReasonLabels[code] ?? code)].some((text) => text.toLocaleLowerCase("vi").includes(searchQuery.trim().toLocaleLowerCase("vi"))))
      .sort((left, right) => (right.anomalyScore ?? 0) - (left.anomalyScore ?? 0) || right.amount - left.amount);
  }, [anomalies, anomalyCategoryFilter, anomalyDateFilter, anomalyReasonFilter, searchQuery]);
  const anomalyIds = useMemo(
    () => new Set(anomalies.flatMap((anomaly) => anomaly.transactionId === null ? [] : [anomaly.transactionId])),
    [anomalies],
  );

  const filteredTransactions = useMemo(() => {
    return (transactions ?? [])
      .filter((transaction) => {
        if (!transaction?.transactionDate) {
          return false;
        }

        const date = new Date(transaction.transactionDate);
        const matchesAccount = selectedAccountId === null || transaction.accountId === selectedAccountId;
        const matchesCategory = filters.categoryId === null || transaction.categoryId === filters.categoryId;
        const query = searchQuery.trim().toLocaleLowerCase("vi");
        const matchesSearch = !query || [transaction.description, transaction.categoryName, String(transaction.amount)]
          .some((value) => value?.toLocaleLowerCase("vi").includes(query));

        if (Number.isNaN(date.getTime()) || !matchesAccount || !matchesCategory || !matchesSearch) {
          return false;
        }

        return filters.month === null || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === filters.month;
      })
      .sort((left, right) => {
        const dateDifference = new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();

        return dateDifference || right.id - left.id;
      });
  }, [filters, searchQuery, selectedAccountId, transactions]);

  const selectedAccount = (accounts ?? []).find((account) => account.id === selectedAccountId);
  const currency = selectedAccount?.currency ?? (accounts ?? [])[0]?.currency ?? "VND";
  const currentMonth = new Date().getMonth() + 1;
  const overviewMonth = monthlySpending?.currentPeriod.month ?? currentMonth;
  const spendingDifference = monthlySpending ? monthlySpending.totalAmount - monthlySpending.compareTotalAmount : null;
  const listFilterCount = Number(filters.month !== null) + Number(filters.accountId !== null) + Number(filters.categoryId !== null);
  const openMonthlyOverview = () => {
    requestSpendingStatsFromTransactions();
    router.navigate("/(tabs)/user");
  };
  const visibleAnomalyCount = anomalies.length;
  const displayedTransactionCount = showAnomaliesOnly ? filteredAnomalies.length : filteredTransactions.length;
  const activeFilterCount = [anomalyCategoryFilter, anomalyDateFilter, anomalyReasonFilter].filter((value) => value !== "all").length;
  const activeFilterLabels = [
    anomalyCategoryFilter !== "all" ? anomalyCategories.find(([key]) => key === anomalyCategoryFilter)?.[1] : null,
    anomalyDateFilter !== "all" ? anomalyWindow?.months.find((month) => month.value === anomalyDateFilter)?.label : null,
    anomalyReasonFilter !== "all" ? anomalyReasonLabels[anomalyReasonFilter] ?? anomalyReasonFilter : null,
  ].filter(Boolean).join(" · ");

  return (
    <FocusedScreenTransition reanimateOnFocus={false}>
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenGradientBackground />
        <FlatList
          ref={listRef}
          data={showAnomaliesOnly || isLoading ? [] : filteredTransactions}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => (
            <TransactionListItem
              transaction={item}
              showMonth={index === 0 || getTransactionMonth(item.transactionDate) !== getTransactionMonth(filteredTransactions[index - 1].transactionDate)}
              isAnomaly={anomalyIds.has(item.id)}
              currency={currency}
            />
          )}
          onEndReached={() => { if (!showAnomaliesOnly && !searchQuery.trim()) void loadMore(); }}
          onEndReachedThreshold={0.4}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          onScroll={({ nativeEvent }) => {
            const visible = nativeEvent.contentOffset.y > 500;
            setShowScrollToTop((current) => current === visible ? current : visible);
          }}
          scrollEventThrottle={100}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void reload({ refresh: true });
                void loadAccounts();
                void loadMonthlySpending();
                void loadFilterCategories();
                void refreshAI();
              }}
              tintColor={theme.primary}
            />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<>
          <View style={styles.ledgerTop}>
            <View style={styles.searchToolbar}>
              <View style={styles.searchField}>
                <Search size={20} color={theme.textMuted} />
                <TextInput
                  accessibilityLabel="Tìm kiếm giao dịch"
                  placeholder="Tìm kiếm giao dịch"
                  placeholderTextColor={theme.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
                {searchQuery ? (
                  <Pressable accessibilityLabel="Xóa tìm kiếm" hitSlop={8} onPress={() => setSearchQuery("")}>
                    <X size={16} color={theme.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Bộ lọc giao dịch" onPress={() => {
                Keyboard.dismiss();
                if (showAnomaliesOnly) setIsAnomalyFilterOpen(true);
                else setIsAccountPickerOpen(true);
              }} style={styles.toolbarButton}>
                <Funnel size={21} color={theme.text} />
                {(showAnomaliesOnly ? activeFilterCount : listFilterCount) > 0 ? <View style={styles.toolbarBadge}><Text style={styles.toolbarBadgeText}>{showAnomaliesOnly ? activeFilterCount : listFilterCount}</Text></View> : null}
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Tiện ích giao dịch" onPress={() => setIsUtilitiesOpen(true)} style={styles.toolbarButton}>
                <LayoutGrid size={21} color={theme.text} />
              </Pressable>
            </View>
            <View style={styles.monthOverview}>
              <Pressable accessibilityRole="button" onPress={openMonthlyOverview} style={styles.overviewHeading}>
                <Text style={styles.overviewTitle}>Tổng quan tháng {overviewMonth}</Text>
                <View style={styles.overviewArrow}><ChevronRight size={20} color={theme.primary} /></View>
              </Pressable>
              <View style={styles.overviewMetrics}>
                <Pressable onPress={openMonthlyOverview} style={styles.overviewMetric}>
                  <Text style={styles.overviewMetricLabel}>Tổng chi</Text>
                  <View style={styles.overviewAmountRow}>
                    <Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7} style={styles.overviewMetricValue}>
                      {monthlySpending ? formatMoney(monthlySpending.totalAmount) : "--"}
                    </Text>
                    <ChevronRight size={14} color={theme.textMuted} />
                  </View>
                </Pressable>
                <Pressable onPress={openMonthlyOverview} style={styles.overviewMetric}>
                  <Text style={styles.overviewMetricLabel}>So với cùng kỳ</Text>
                  <View style={styles.overviewAmountRow}>
                    {spendingDifference !== null ? (
                      spendingDifference > 0 ? <ArrowUp size={16} color={theme.warning} /> : spendingDifference < 0 ? <ArrowDown size={16} color={theme.goodText} /> : null
                    ) : null}
                    <Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7} style={[styles.overviewMetricValue, { color: spendingDifference !== null && spendingDifference > 0 ? theme.warning : theme.goodText }]}>
                      {spendingDifference !== null ? formatMoney(Math.abs(spendingDifference)) : "--"}
                    </Text>
                    <ChevronRight size={14} color={theme.textMuted} />
                  </View>
                </Pressable>
              </View>
              <Pressable onPress={() => router.navigate("/(tabs)/budgets")} style={styles.budgetPrompt}>
                <Text style={styles.budgetPromptText}>Bạn muốn tiết kiệm tiền hơn?</Text>
                <Text style={styles.budgetPromptAction}>Đặt ngân sách</Text>
              </Pressable>
            </View>
          </View>

          <View accessibilityRole="tablist" style={styles.ledgerTabs}>
            {[{ label: "Tất cả giao dịch", selected: !showAnomaliesOnly, value: false }, { label: "Bất thường", selected: showAnomaliesOnly, value: true }].map((tab) => (
              <Pressable key={tab.label} accessibilityRole="tab" accessibilityState={{ selected: tab.selected }} onPress={() => setShowAnomaliesOnly(tab.value)} style={[styles.ledgerTab, tab.selected && styles.ledgerTabSelected]}>
                <Text style={[styles.ledgerTabText, tab.selected && styles.ledgerTabTextSelected]}>
                  {tab.label}{tab.value ? <> · <Text style={{ color: theme.dangerText, fontWeight: "700" }}>{visibleAnomalyCount}</Text></> : null}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{showAnomaliesOnly ? "Giao dịch bất thường" : "Giao dịch gần đây"}</Text>
            <Text style={styles.sectionMeta}>
              {showAnomaliesOnly ? `${displayedTransactionCount} giao dịch` : `${displayedTransactionCount}/${totalCount}`}
            </Text>
          </View>
          {showAnomaliesOnly ? (
            <View>
              <Text style={styles.analysisPeriod}>{anomalyWindow ? `${anomalyWindow.days} ngày · ${anomalyWindow.label}` : "Chưa có mốc thời gian phân tích"}</Text>
              {(analysis?.anomalySummary?.anomalyCount ?? 0) > anomalies.length ? <Text style={styles.analysisPeriod}>Đã nhận {anomalies.length}/{analysis?.anomalySummary?.anomalyCount} giao dịch được AI đánh dấu</Text> : null}
              <View style={styles.anomalyToolbar}>
                <Text style={styles.anomalyResultCount}>{filteredAnomalies.length} giao dịch</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={activeFilterCount ? `Bộ lọc, ${activeFilterCount} điều kiện đang chọn` : "Bộ lọc giao dịch bất thường"}
                  onPress={() => { Keyboard.dismiss(); setIsAnomalyFilterOpen(true); }}
                  style={styles.anomalyFilterButton}
                >
                  <SlidersHorizontal size={18} color={theme.text} />
                  {activeFilterCount > 0 ? <Text style={styles.anomalyFilterBadge}>{activeFilterCount}</Text> : null}
                </Pressable>
              </View>
              {activeFilterCount > 0 ? (
                <View style={styles.anomalyActiveFilters}>
                  <Text style={styles.anomalyActiveFilterText}>{activeFilterLabels}</Text>
                  <Pressable
                    accessibilityLabel="Xóa bộ lọc"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => {
                      setAnomalyCategoryFilter("all");
                      setAnomalyDateFilter("all");
                      setAnomalyReasonFilter("all");
                      setShowAllAnomalies(false);
                    }}
                  >
                    <X size={16} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : null}
              {!analysis && isAnalysisLoading ? <TransactionSkeleton /> : filteredAnomalies.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>{!analysis ? "Chưa có kết quả phân tích" : activeFilterCount || searchQuery.trim() ? "Không có giao dịch phù hợp" : "Chưa có giao dịch được đánh dấu"}</Text>
                  <Text style={styles.emptyText}>{!analysis ? (analysisError?.message || "Cập nhật phân tích tại Tổng quan.") : analysis.anomalySummary.status === "insufficient_data" ? "Chưa đủ lịch sử để đánh giá giao dịch bất thường." : analysis.anomalySummary.status === "partial" ? `${analysis.anomalySummary.insufficientCount} khoản chưa đủ dữ liệu. Chưa có cảnh báo mạnh trong bộ lọc hiện tại.` : anomalyWindow ? `Trong kỳ ${anomalyWindow.label}.` : "Chưa có dữ liệu bất thường trong kết quả AI."}</Text>
                </View>
              ) : (
                (showAllAnomalies ? filteredAnomalies : filteredAnomalies.slice(0, 5)).map((anomaly) => (
                  <AnomalyRow key={anomaly.transactionId ?? `${anomaly.date}-${anomaly.amount}`} anomaly={anomaly} />
                ))
              )}
              {filteredAnomalies.length > 5 ? (
                <Pressable onPress={() => setShowAllAnomalies((show) => !show)} style={styles.showMoreAnomalies}>
                  <Text style={styles.showMoreAnomaliesText}>
                    {showAllAnomalies ? "Thu gọn" : `Xem thêm ${filteredAnomalies.length - 5} giao dịch`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          </>}
          ListEmptyComponent={!showAnomaliesOnly ? isLoading ? <TransactionSkeleton /> : !transactionError ? <EmptyState /> : null : null}
          ListFooterComponent={!showAnomaliesOnly ? (
            <View style={styles.feedFooter}>
              {isLoadingMore ? <ActivityIndicator accessibilityLabel="Đang tải thêm giao dịch" color={theme.primary} /> : transactionError || loadMoreError ? <>
                <Text style={styles.emptyText}>{transactionError || loadMoreError}</Text>
                <Pressable accessibilityRole="button" onPress={() => transactionError ? void reload() : void loadMore({ retry: true })} style={styles.feedRetry}>
                  <Text style={styles.feedRetryText}>Thử lại</Text>
                </Pressable>
              </> : hasMore && searchQuery.trim() ? <Pressable accessibilityRole="button" onPress={() => void loadMore()} style={styles.feedRetry}><Text style={styles.feedRetryText}>Tải thêm giao dịch</Text></Pressable> : !isLoading && !hasMore && transactions.length > 0 ? <Text style={styles.sectionMeta}>Đã hiển thị tất cả giao dịch</Text> : null}
            </View>
          ) : null}
        />
        {showScrollToTop && !isAccountPickerOpen && !isUtilitiesOpen && !isAnomalyFilterOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lên đầu danh sách"
            accessibilityHint="Cuộn về đầu để chọn tháng hoặc đổi bộ lọc"
            onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
            style={({ pressed }) => [styles.scrollToTop, pressed && { opacity: 0.8 }]}
          >
            <ArrowUp size={22} color={theme.textInverse} strokeWidth={2} />
          </Pressable>
        ) : null}
        <TransactionFilterScreen
          visible={isAccountPickerOpen}
          initialFilters={filters}
          accounts={accounts}
          categories={categories}
          onClose={() => setIsAccountPickerOpen(false)}
          onApply={(nextFilters) => {
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
            setFilters(nextFilters);
            setIsAccountPickerOpen(false);
          }}
          onHome={() => { setIsAccountPickerOpen(false); router.navigate("/(tabs)/home"); }}
          onSupport={() => { setIsAccountPickerOpen(false); router.push("/ai-chat"); }}
        />
        <BottomPopup visible={isUtilitiesOpen} onRequestClose={() => setIsUtilitiesOpen(false)}>
          <View style={styles.filterModal}>
            <Pressable accessibilityLabel="Đóng tiện ích" onPress={() => setIsUtilitiesOpen(false)} style={StyleSheet.absoluteFill} />
            <BottomPopupSheet style={styles.filterSheet}>
              <View style={styles.filterHandle} />
              <View style={styles.filterSheetHeader}>
                <Text style={styles.filterSheetTitle}>Tiện ích giao dịch</Text>
                <Pressable accessibilityLabel="Đóng" onPress={() => setIsUtilitiesOpen(false)} style={styles.filterIconButton}><X size={20} color={theme.textMuted} /></Pressable>
              </View>
              <View style={styles.filterSheetContent}>
                <Pressable style={styles.utilityRow} onPress={() => { setIsUtilitiesOpen(false); openMonthlyOverview(); }}>
                  <ChartNoAxesCombined color={theme.primary} size={22} /><Text style={styles.utilityLabel}>Tổng quan tháng {overviewMonth}</Text><ChevronRight color={theme.textMuted} size={18} />
                </Pressable>
                <Pressable style={styles.utilityRow} onPress={() => { setIsUtilitiesOpen(false); router.navigate("/(tabs)/budgets"); }}>
                  <Wallet color={theme.primary} size={22} /><Text style={styles.utilityLabel}>Ngân sách</Text><ChevronRight color={theme.textMuted} size={18} />
                </Pressable>
                <Pressable style={styles.utilityRow} onPress={() => { setIsUtilitiesOpen(false); setShowAnomaliesOnly((value) => !value); }}>
                  <Sparkles color={theme.warning} size={22} /><Text style={styles.utilityLabel}>{showAnomaliesOnly ? "Tất cả giao dịch" : "Giao dịch bất thường"}</Text><ChevronRight color={theme.textMuted} size={18} />
                </Pressable>
              </View>
              <View style={styles.sheetBottomSpace} />
            </BottomPopupSheet>
          </View>
        </BottomPopup>
          <AnomalyFilterSheet
            visible={isAnomalyFilterOpen}
            months={anomalyWindow?.months ?? []}
            periodLabel={anomalyWindow?.label}
            anomalies={anomalies}
            categories={anomalyCategories}
            reasons={anomalyReasons}
            initialFilters={{ category: anomalyCategoryFilter, date: anomalyDateFilter, reason: anomalyReasonFilter }}
            onClose={() => setIsAnomalyFilterOpen(false)}
            onApply={(filters) => {
              setAnomalyCategoryFilter(filters.category);
              setAnomalyDateFilter(filters.date);
              setAnomalyReasonFilter(filters.reason);
              setShowAllAnomalies(false);
              setIsAnomalyFilterOpen(false);
            }}
          />
      </SafeAreaView>
    </FocusedScreenTransition>
  );
}

function AnomalyFilterSheet({
  visible,
  months,
  periodLabel,
  anomalies,
  categories,
  reasons,
  initialFilters,
  onClose,
  onApply,
}: {
  visible: boolean;
  months: { value: string; label: string }[];
  periodLabel?: string;
  anomalies: AIAnomaly[];
  categories: [string, string][];
  reasons: string[];
  initialFilters: AnomalyFilters;
  onClose: () => void;
  onApply: (filters: AnomalyFilters) => void;
}) {
  const theme = useAppTheme();
  const styles = useTransactionStyles();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initialFilters);
  const [section, setSection] = useState<keyof AnomalyFilters | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(initialFilters);
      setSection(null);
    }
  }
  const groups = [
    { key: "category" as const, label: "Danh mục", options: [{ value: "all", label: "Tất cả danh mục" }, ...categories.map(([value, label]) => ({ value, label }))] },
    { key: "date" as const, label: "Tháng phân tích", options: [{ value: "all", label: "Toàn bộ kỳ phân tích" }, ...months] },
    { key: "reason" as const, label: "Lý do", options: [{ value: "all", label: "Mọi lý do" }, ...reasons.map((value) => ({ value, label: anomalyReasonLabels[value] ?? value }))] },
  ];
  const activeGroup = groups.find((group) => group.key === section);
  const resultCount = anomalies.filter((anomaly) => matchesAnomalyFilters(anomaly, draft)).length;

  return (
    <BottomPopup transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.filterModal}>
        <Pressable accessibilityLabel="Đóng bộ lọc" onPress={onClose} style={StyleSheet.absoluteFill} />
        <BottomPopupSheet accessibilityViewIsModal style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.filterHandle} />
          <View style={styles.filterSheetHeader}>
            {activeGroup ? (
              <Pressable accessibilityLabel="Quay lại bộ lọc" onPress={() => setSection(null)} style={styles.filterIconButton}>
                <ChevronLeft size={22} color={theme.text} />
              </Pressable>
            ) : <View style={styles.filterIconButton} />}
            <Text accessibilityRole="header" style={styles.filterSheetTitle}>{activeGroup?.label ?? "Bộ lọc bất thường"}</Text>
            <Pressable accessibilityLabel="Đóng bộ lọc" onPress={onClose} style={styles.filterIconButton}>
              <X size={20} color={theme.textMuted} />
            </Pressable>
          </View>
          {periodLabel ? <Text style={styles.analysisPeriod}>{periodLabel}</Text> : null}
          <ScrollView style={styles.filterSheetScroll} contentContainerStyle={styles.filterSheetContent}>
            {activeGroup ? activeGroup.options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: draft[activeGroup.key] === option.value }}
                onPress={() => {
                  setDraft((current) => ({ ...current, [activeGroup.key]: option.value }));
                  setSection(null);
                }}
                style={styles.filterOptionRow}
              >
                <Text style={[styles.filterOptionText, draft[activeGroup.key] === option.value && { color: theme.primary }]}>{option.label}</Text>
                {draft[activeGroup.key] === option.value ? <Check size={20} color={theme.primary} /> : <View style={styles.filterCheckSpace} />}
              </Pressable>
            )) : groups.map((group) => (
              <Pressable key={group.key} onPress={() => setSection(group.key)} style={styles.filterOptionRow}>
                <View style={styles.filterRowCopy}>
                  <Text style={styles.filterRowLabel}>{group.label}</Text>
                  <Text style={styles.filterRowValue}>{group.options.find((option) => option.value === draft[group.key])?.label}</Text>
                </View>
                <ChevronRight size={18} color={theme.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.filterSheetFooter}>
            <Pressable onPress={() => { setDraft({ category: "all", date: "all", reason: "all" }); setSection(null); }} style={styles.filterReset}>
              <Text style={styles.filterResetText}>Đặt lại</Text>
            </Pressable>
            <Pressable onPress={() => onApply(draft)} style={styles.filterApply}>
              <Text style={styles.filterApplyText}>Xem {resultCount} giao dịch</Text>
            </Pressable>
          </View>
        </BottomPopupSheet>
      </View>
    </BottomPopup>
  );
}

function AnomalyRow({ anomaly }: { anomaly: AIAnomaly }) {
  const styles = useTransactionStyles();
  const anomalyDate = new Date(anomaly.date);
  const dateLabel = Number.isNaN(anomalyDate.getTime())
    ? anomaly.date
    : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", year: "numeric" }).format(anomalyDate);

  return (
    <View style={styles.anomalyRow}>
      <View style={styles.anomalyRowHeader}>
        <View style={styles.anomalyRowCopy}>
          <Text style={styles.anomalyRowCategory}>{anomaly.category || "Chưa phân loại"}</Text>
          <Text style={styles.anomalyRowDate}>{dateLabel} · #{anomaly.transactionId ?? "—"}</Text>
        </View>
        <Text style={styles.anomalyRowAmount}>{formatMoney(anomaly.amount)}</Text>
      </View>
      <View style={styles.anomalyRowFooter}>
        <Text style={styles.anomalyRowReasons}>
          {(anomaly.reasonCodes ?? []).slice(0, 2).map((reason) => anomalyReasonLabels[reason] ?? reason).join(" · ") || "Được AI đánh dấu bất thường"}
        </Text>
        {anomaly.anomalyScore !== null ? <Text style={styles.anomalyScore}>Điểm {anomaly.anomalyScore.toFixed(2)}</Text> : null}
      </View>
    </View>
  );
}

function getTransactionMonth(date: string) {
  const value = new Date(date);
  return `${value.getFullYear()}-${value.getMonth()}`;
}

function TransactionListItem({
  isAnomaly,
  showMonth,
  transaction,
  currency,
}: {
  isAnomaly: boolean;
  showMonth: boolean;
  transaction: Transaction;
  currency: string;
}) {
  const theme = useAppTheme();
  const styles = useTransactionStyles();
  const date = transaction.transactionDate;
  const positive = isPositive(transaction.type);
  const transfer = transaction.type === "TransferIn" || transaction.type === "TransferOut";
  const Icon = positive ? ArrowDownToLine : transfer ? Landmark : ReceiptText;
  const iconColor = positive ? theme.goodText : transfer ? theme.avatar : theme.warning;

  return (
    <View style={styles.dayGroup}>
      {showMonth ? <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>
          Tháng {String(new Date(date).getMonth() + 1).padStart(2, "0")}/{new Date(date).getFullYear()}
        </Text>
      </View> : null}
        <View key={transaction.id} style={styles.transactionRow}>
          <View style={styles.transactionIcon}>
            <Icon color={iconColor} size={24} strokeWidth={1.8} />
          </View>
          <View style={styles.transactionCopy}>
            <View style={styles.transactionTitleRow}>
              <Text numberOfLines={3} style={styles.transactionTitle}>{transaction.description || transaction.categoryName || (positive ? "Nhận tiền" : "Chi tiêu")}</Text>
            </View>
            <Text style={styles.transactionDescription}>{new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(transaction.transactionDate))} - {new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(transaction.transactionDate))}</Text>
            {isAnomaly ? <Text style={styles.anomalyTagText}>Bất thường</Text> : null}
          </View>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={1}
            style={[
              styles.transactionAmount,
              { color: positive ? theme.goodText : theme.text },
            ]}
          >
            {positive ? "+" : "-"}
            {formatMoney(transaction.amount, currency)}
          </Text>
        </View>
    </View>
  );
}

function EmptyState() {
  const styles = useTransactionStyles();

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Chưa có giao dịch</Text>
      <Text style={styles.emptyText}>Các giao dịch trong kỳ sẽ hiển thị ở đây.</Text>
    </View>
  );
}

function TransactionSkeleton() {
  const styles = useTransactionStyles();

  return (
    <View style={styles.skeletonGroup}>
      <View style={styles.skeletonHeader} />
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={styles.skeletonRow}>
          <View style={styles.skeletonIcon} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLineShort} />
          </View>
          <View style={styles.skeletonAmount} />
        </View>
      ))}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollToTop: { position: "absolute", right: 20, bottom: 20, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary, zIndex: 5, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 5 },
    feedFooter: { alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 20 },
    feedRetry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
    feedRetryText: { color: theme.primary, fontSize: 14, fontWeight: "600" },
    ledgerTabs: { flexDirection: "row", marginHorizontal: 12, marginTop: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
    ledgerTab: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderBottomWidth: 2, borderBottomColor: "transparent" },
    ledgerTabSelected: { borderBottomColor: theme.primary },
    ledgerTabText: { fontSize: 14, lineHeight: 20, color: theme.textMuted, fontWeight: "500", textAlign: "center" },
    ledgerTabTextSelected: { color: theme.primary, fontWeight: "700" },
    analysisPeriod: { color: theme.textMuted, fontSize: 12, lineHeight: 18, marginHorizontal: 16, marginBottom: 8 },
    screen: { backgroundColor: theme.screen, flex: 1 },
    content: { paddingBottom: 88 },
    ledgerTop: { paddingTop: 16, paddingBottom: 4 },
    searchToolbar: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 16 },
    searchField: { alignItems: "center", flexDirection: "row", flex: 1, minWidth: 0, gap: 8, minHeight: 44, paddingHorizontal: 12, backgroundColor: theme.inputBackground, borderRadius: 24 },
    searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: theme.text, paddingVertical: 10 },
    toolbarButton: { alignItems: "center", justifyContent: "center", height: 44, width: 44, borderRadius: 22, backgroundColor: theme.card, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
    toolbarBadge: { position: "absolute", right: -2, top: -2, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary },
    toolbarBadgeText: { color: theme.textInverse, fontSize: 10, fontWeight: "700" },
    monthOverview: { backgroundColor: theme.card, borderRadius: 8, marginHorizontal: 12, padding: 12 },
    overviewHeading: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 8 },
    overviewTitle: { color: theme.text, fontSize: 18, fontWeight: "700", flex: 1 },
    overviewArrow: { alignItems: "center", justifyContent: "center", width: 28, height: 28, backgroundColor: theme.primaryPressed, borderRadius: 14 },
    overviewMetrics: { flexDirection: "row", gap: 8 },
    overviewMetric: { flex: 1, minWidth: 0, borderRadius: 8, borderColor: theme.border, borderWidth: 1, padding: 10, minHeight: 64, justifyContent: "center" },
    overviewMetricLabel: { color: theme.textMuted, fontSize: 13, marginBottom: 6 },
    overviewAmountRow: { alignItems: "center", flexDirection: "row", gap: 3 },
    overviewMetricValue: { color: theme.text, fontSize: 15, fontWeight: "700", flexShrink: 1 },
    budgetPrompt: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, backgroundColor: theme.primaryPressed, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8, borderRadius: 8 },
    budgetPromptText: { color: theme.textSoft, fontSize: 12, lineHeight: 18, flexShrink: 1 },
    budgetPromptAction: { color: theme.primary, fontSize: 13, lineHeight: 18, fontWeight: "700" },
    utilityRow: { alignItems: "center", flexDirection: "row", minHeight: 64, gap: 12, borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
    utilityLabel: { color: theme.text, fontSize: 14, flex: 1 },
    sheetBottomSpace: { height: 32 },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      marginBottom: 14,
      marginTop: 22,
    },
    sectionTitle: { color: theme.text, fontSize: 20, fontWeight: "700", flexShrink: 1 },
    sectionMeta: { color: theme.textMuted, fontSize: 12 },
    skeletonGroup: {
      backgroundColor: theme.listSurface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 10,
      overflow: "hidden",
      paddingHorizontal: 14,
    },
    skeletonHeader: {
      backgroundColor: theme.cardAlt,
      borderRadius: 6,
      height: 14,
      marginVertical: 14,
      width: "48%",
    },
    skeletonRow: {
      alignItems: "center",
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      minHeight: 64,
    },
    skeletonIcon: {
      backgroundColor: theme.cardAlt,
      borderRadius: 18,
      height: 36,
      marginRight: 11,
      width: 36,
    },
    skeletonCopy: { flex: 1, gap: 8 },
    skeletonLineWide: { backgroundColor: theme.cardAlt, borderRadius: 5, height: 12, width: "68%" },
    skeletonLineShort: { backgroundColor: theme.cardAlt, borderRadius: 5, height: 10, width: "42%" },
    skeletonAmount: { backgroundColor: theme.cardAlt, borderRadius: 5, height: 12, width: 72 },
    anomalyBanner: {
      alignItems: "center",
      backgroundColor: theme.warningBackground,
      borderColor: theme.warning,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginBottom: 10,
      marginHorizontal: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    anomalyBannerIcon: { color: theme.warning, fontSize: 16 },
    anomalyBannerCopy: { flex: 1, gap: 6 },
    anomalyBannerText: { color: theme.warning, flex: 1, fontSize: 12, fontWeight: "800", lineHeight: 17 },
    anomalyBannerButton: { alignItems: "center", flexDirection: "row", gap: 4, alignSelf: "flex-start" },
    anomalyBannerButtonText: { color: theme.warning, fontSize: 12, fontWeight: "900" },
    anomalyBannerButtonArrow: { color: theme.warning, fontSize: 18, fontWeight: "900", lineHeight: 18 },
    anomalyToolbar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10, marginHorizontal: 16 },
    anomalyResultCount: { color: theme.textMuted, fontSize: 12, fontWeight: "600" },
    anomalyFilterButton: { alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, minWidth: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10 },
    anomalyFilterBadge: { color: theme.primary, fontSize: 12, fontWeight: "800" },
    anomalyActiveFilters: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 14, marginHorizontal: 16 },
    anomalyActiveFilterText: { color: theme.textMuted, fontSize: 12, lineHeight: 18, flex: 1 },
    filterModal: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.overlay },
    filterSheet: { backgroundColor: theme.sheet, borderTopLeftRadius: 8, borderTopRightRadius: 8, maxHeight: "80%" },
    filterHandle: { alignSelf: "center", backgroundColor: theme.borderStrong, borderRadius: 2, width: 32, height: 4, marginTop: 10, marginBottom: 6 },
    filterSheetHeader: { alignItems: "center", flexDirection: "row", paddingHorizontal: 12, paddingBottom: 8, borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
    filterSheetTitle: { color: theme.text, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
    filterIconButton: { alignItems: "center", justifyContent: "center", width: 44, height: 44 },
    filterSheetScroll: { flexShrink: 1 },
    filterSheetContent: { paddingHorizontal: 20 },
    filterOptionRow: { alignItems: "center", flexDirection: "row", gap: 16, minHeight: 62, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    filterRowCopy: { flex: 1, gap: 5 },
    filterRowLabel: { color: theme.textMuted, fontSize: 12 },
    filterRowValue: { color: theme.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
    filterOptionText: { color: theme.text, fontSize: 14, lineHeight: 21, flex: 1 },
    filterCheckSpace: { width: 20, height: 20 },
    filterSheetFooter: { alignItems: "center", flexDirection: "row", gap: 16, paddingTop: 18, paddingHorizontal: 20 },
    filterReset: { alignItems: "center", justifyContent: "center", minWidth: 64, minHeight: 48 },
    filterResetText: { color: theme.textMuted, fontSize: 14, fontWeight: "600" },
    filterApply: { alignItems: "center", justifyContent: "center", flex: 1, minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: theme.primary, borderRadius: 8 },
    filterApplyText: { color: theme.textInverse, fontSize: 14, fontWeight: "700", textAlign: "center" },
    anomalyRow: { backgroundColor: theme.listSurface, borderBottomColor: theme.listDivider, borderBottomWidth: StyleSheet.hairlineWidth, padding: 16 },
    anomalyRowHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10 },
    anomalyRowCopy: { flex: 1 },
    anomalyRowCategory: { color: theme.text, fontSize: 13, fontWeight: "800" },
    anomalyRowDate: { color: theme.textMuted, fontSize: 10, marginTop: 3 },
    anomalyRowAmount: { color: theme.warning, fontSize: 13, fontWeight: "900" },
    anomalyRowFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 9 },
    anomalyRowReasons: { color: theme.textSubtle, flex: 1, fontSize: 10, lineHeight: 14 },
    anomalyScore: { color: theme.warning, fontSize: 10, fontWeight: "800" },
    showMoreAnomalies: { alignItems: "center", paddingVertical: 12 },
    showMoreAnomaliesText: { color: theme.primary, fontSize: 12, fontWeight: "800" },
    dayGroup: {
      backgroundColor: theme.listSurface,
      paddingHorizontal: 12,
      paddingTop: 4,
    },
    dayHeader: {
      alignItems: "center",
      backgroundColor: theme.listHeader,
      borderRadius: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    dayTitle: { color: theme.textSoft, fontSize: 15, fontWeight: "700" },
    transactionRow: {
      alignItems: "flex-start",
      borderBottomColor: theme.listDivider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingVertical: 18,
      paddingHorizontal: 2,
      minHeight: 96,
    },
    transactionIcon: {
      alignItems: "center",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      height: 40,
      justifyContent: "center",
      marginRight: 10,
      width: 40,
    },
    transactionCopy: { flex: 1, minWidth: 0 },
    transactionTitleRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    transactionTitle: { color: theme.textSoft, fontSize: 14, lineHeight: 21, fontWeight: "600", flex: 1 },
    transactionDescription: { color: theme.textMuted, fontSize: 11, lineHeight: 16, marginTop: 7 },
    anomalyTagText: { color: theme.warning, fontSize: 10, fontWeight: "700", marginTop: 4 },
    transactionAmount: { fontSize: 15, lineHeight: 21, fontWeight: "700", marginLeft: 8, maxWidth: "38%", textAlign: "right" },
    empty: {
      alignItems: "center",
      backgroundColor: theme.listSurface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      padding: 28,
    },
    emptyTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
    emptyText: { color: theme.textSubtle, fontSize: 12, marginTop: 6 },
  });
}
