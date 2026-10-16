import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";
import type { AIAnomaly } from "@/api/aiApi";
import { Transaction, TransactionType, transactionsApi } from "@/api/transactionsApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { useAIAnalysis } from "@/hooks/use-ai-analysis";
import { useAppTheme } from "@/hooks/use-app-theme";
import { requestSpendingStatsFromTransactions } from "@/stores/spendingStatsNavigation";
import type { AppTheme } from "@/theme/appTheme";

type Period = "all" | "previous" | "current" | "future";
type AnomalyDateFilter = "all" | "7" | "30" | "90";

const anomalyReasonLabels: Record<string, string> = {
  HIGH_VS_USER_MEDIAN: "Cao hơn mức thường",
  HIGH_VS_CATEGORY_MEDIAN: "Cao trong danh mục",
  HIGH_USER_ROBUST_Z: "Lệch khỏi lịch sử",
  HIGH_CATEGORY_ROBUST_Z: "Lệch khỏi danh mục",
  WEEKEND_TRANSACTION: "Cuối tuần",
  UNUSUAL_FEATURE_COMBINATION: "Mẫu chi tiêu lạ",
};

const anomalyDateFilters: { label: string; value: AnomalyDateFilter }[] = [
  { label: "Tất cả ngày", value: "all" },
  { label: "7 ngày", value: "7" },
  { label: "30 ngày", value: "30" },
  { label: "90 ngày", value: "90" },
];

const periodLabels: Record<Period, string> = {
  all: "Tất cả",
  previous: "Tháng trước",
  current: "Tháng này",
  future: "Tương lai",
};

function useTransactionStyles() {
  const theme = useAppTheme();

  return useMemo(() => createStyles(theme), [theme]);
}

function formatMoney(amount: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", { currency, maximumFractionDigits: 0, style: "currency" }).format(amount);
}

function getPeriodRange(period: Period) {
  if (period === "all") {
    return null;
  }

  const now = new Date();
  const offset = period === "previous" ? -1 : period === "future" ? 1 : 0;
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
}

function isPositive(type: TransactionType) {
  return type === "Income" || type === "TransferIn";
}

export default function TransactionsScreen() {
  const theme = useAppTheme();
  const styles = useTransactionStyles();
  const [period, setPeriod] = useState<Period>("all");
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedDataRef = useRef(false);
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);
  const [anomalyCategoryFilter, setAnomalyCategoryFilter] = useState("all");
  const [anomalyDateFilter, setAnomalyDateFilter] = useState<AnomalyDateFilter>("all");
  const [anomalyReasonFilter, setAnomalyReasonFilter] = useState("all");
  const [showAllAnomalies, setShowAllAnomalies] = useState(false);
  const { analysis, refresh: refreshAI } = useAIAnalysis();

  const loadData = useCallback(
    async ({ refresh = false, silent = false } = {}) => {
      try {
        if (refresh) {
          setIsRefreshing(true);
        } else if (!silent) {
          setIsLoading(true);
        }
        const [accountResponse, transactionResponse] = await Promise.all([
          financialAccountApi.list(),
          transactionsApi.list({ accountId: selectedAccountId, page, pageSize: 20 }),
          ...(refresh ? [refreshAI()] : []),
        ]);
        setAccounts(Array.isArray(accountResponse.data) ? accountResponse.data : []);
        setTransactions(Array.isArray(transactionResponse.data.items) ? transactionResponse.data.items : []);
        setTotalCount(transactionResponse.data.totalCount);
        setTotalPages(Math.max(1, transactionResponse.data.totalPages));
        console.log("TRANSACTIONS PAGING:", {
          receivedCount: transactionResponse.data.items.length,
          page: transactionResponse.data.page,
          pageSize: transactionResponse.data.pageSize,
          totalCount: transactionResponse.data.totalCount,
          totalPages: transactionResponse.data.totalPages,
        });
        hasLoadedDataRef.current = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vui lòng thử lại sau.";

        if (silent) {
          console.warn("Không tải được giao dịch", error);
        } else {
          Alert.alert("Không tải được giao dịch", message);
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
        setIsRefreshing(false);
      }
    },
    [page, refreshAI, selectedAccountId],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshAI();
      loadData({ silent: hasLoadedDataRef.current });
    }, [loadData, refreshAI]),
  );

  const anomalies = useMemo(
    () => (analysis?.anomalies ?? []).filter((anomaly) => anomaly.isAnomaly),
    [analysis],
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
    const cutoff = anomalyDateFilter === "all" ? null : new Date(Date.now() - Number(anomalyDateFilter) * 86_400_000);

    return anomalies
      .filter((anomaly) => {
        const categoryKey = anomaly.categoryId === null ? "uncategorized" : String(anomaly.categoryId);
        const date = new Date(anomaly.date);

        return (
          (anomalyCategoryFilter === "all" || categoryKey === anomalyCategoryFilter) &&
          (!cutoff || (!Number.isNaN(date.getTime()) && date >= cutoff)) &&
          (anomalyReasonFilter === "all" || anomaly.reasonCodes?.includes(anomalyReasonFilter))
        );
      })
      .sort((left, right) => right.anomalyScore - left.anomalyScore);
  }, [anomalies, anomalyCategoryFilter, anomalyDateFilter, anomalyReasonFilter]);
  const anomalyIds = useMemo(
    () => new Set(anomalies.flatMap((anomaly) => anomaly.transactionId === null ? [] : [anomaly.transactionId])),
    [anomalies],
  );

  const filteredTransactions = useMemo(() => {
    const range = getPeriodRange(period);

    return (transactions ?? [])
      .filter((transaction) => {
        if (!transaction?.transactionDate) {
          return false;
        }

        const date = new Date(transaction.transactionDate);
        const matchesAccount = selectedAccountId === null || transaction.accountId === selectedAccountId;

        if (Number.isNaN(date.getTime()) || !matchesAccount) {
          return false;
        }

        return range === null || (date >= range.start && date < range.end);
      })
      .sort((left, right) => {
        const dateDifference = new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();

        return dateDifference || right.id - left.id;
      });
  }, [period, selectedAccountId, transactions]);

  const summary = useMemo(() => {
    const incoming = filteredTransactions
      .filter((transaction) => isPositive(transaction.type))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const outgoing = filteredTransactions
      .filter((transaction) => !isPositive(transaction.type))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return { incoming, outgoing, net: incoming - outgoing };
  }, [filteredTransactions]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    filteredTransactions.forEach((transaction) => {
      const key = new Date(transaction.transactionDate).toISOString().slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), transaction]);
    });
    return [...groups.entries()].sort(([leftDate], [rightDate]) => rightDate.localeCompare(leftDate));
  }, [filteredTransactions]);

  const selectedAccount = (accounts ?? []).find((account) => account.id === selectedAccountId);
  const currency = selectedAccount?.currency ?? (accounts ?? [])[0]?.currency ?? "VND";
  const netRatio = summary.incoming ? Math.min(100, Math.max(0, (summary.net / summary.incoming) * 100)) : 0;
  const currentMonth = new Date().getMonth() + 1;
  const visibleAnomalyCount = anomalies.length;
  const displayedTransactionCount = showAnomaliesOnly ? filteredAnomalies.length : filteredTransactions.length;

  return (
    <FocusedScreenTransition reanimateOnFocus={false}>
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData({ refresh: true })}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Quản lý tài chính</Text>
              <Text style={styles.title}>Sổ giao dịch</Text>
            </View>
            <Pressable
              style={styles.monthOverviewButton}
              onPress={() => {
                requestSpendingStatsFromTransactions();
                router.navigate("/(tabs)/user");
              }}
            >
              <Text style={styles.monthOverviewText}>Tổng Quan Tháng {currentMonth}</Text>
              <Text style={styles.monthOverviewArrow}>›</Text>
            </Pressable>
          </View>

          <Pressable style={styles.selector} onPress={() => setIsAccountPickerOpen((open) => !open)}>
            <View>
              <Text style={styles.selectorLabel}>Đang xem giao dịch của</Text>
              <Text style={styles.selectorValue}>{selectedAccount?.name ?? "Tổng cộng"}</Text>
            </View>
            <Text style={styles.chevron}>{isAccountPickerOpen ? "⌃" : "⌄"}</Text>
          </Pressable>
          {isAccountPickerOpen && (
            <View style={styles.pickerMenu}>
              <AccountOption
                label="Tổng cộng"
                selected={selectedAccountId === null}
                onPress={() => {
                  setPage(1);
                  setSelectedAccountId(null);
                  setIsAccountPickerOpen(false);
                }}
              />
              {(accounts ?? []).map((account) => (
                <AccountOption
                  key={account.id}
                  label={account.name}
                  selected={selectedAccountId === account.id}
                  onPress={() => {
                    setPage(1);
                    setSelectedAccountId(account.id);
                    setIsAccountPickerOpen(false);
                  }}
                />
              ))}
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodTabs}>
            {(Object.keys(periodLabels) as Period[]).map((item) => (
              <Pressable
                key={item}
                onPress={() => setPeriod(item)}
                style={[styles.periodTab, period === item && styles.periodTabActive]}
              >
                <Text style={[styles.periodTabText, period === item && styles.periodTabTextActive]}>
                  {periodLabels[item]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>{periodLabels[period]}</Text>
            <Text style={styles.availableBalance}>Số dư khả dụng</Text>
            <Text style={styles.availableValue}>{formatMoney(summary.net, currency)}</Text>
            <View style={styles.summaryGrid}>
              <SummaryItem label="Dòng tiền vào" value={summary.incoming} color={theme.goodText} currency={currency} />
              <SummaryItem label="Dòng tiền ra" value={summary.outgoing} color={theme.dangerText} currency={currency} />
              <SummaryItem
                label="Dòng tiền ròng"
                value={summary.net}
                color={summary.net >= 0 ? theme.goodText : theme.dangerText}
                currency={currency}
              />
            </View>
          </View>

          <Pressable style={styles.reportButton} onPress={() => router.push("/transaction-report")}>
            <Text style={styles.reportButtonText}>Xem báo cáo cho giai đoạn này</Text>
            <Text style={styles.reportArrow}>›</Text>
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{showAnomaliesOnly ? "Giao dịch bất thường" : "Lịch sử giao dịch"}</Text>
            <Text style={styles.sectionMeta}>
              {displayedTransactionCount}/{totalCount} giao dịch
            </Text>
          </View>
          {visibleAnomalyCount > 0 ? (
            <View style={styles.anomalyBanner}>
              <Text style={styles.anomalyBannerIcon}>⚡</Text>
              <View style={styles.anomalyBannerCopy}>
                <Text style={styles.anomalyBannerText}>
                  Phát hiện {visibleAnomalyCount} giao dịch có biến động chi tiêu bất thường
                </Text>
                <Pressable
                  onPress={() => setShowAnomaliesOnly((currentValue) => !currentValue)}
                  style={styles.anomalyBannerButton}
                >
                  <Text style={styles.anomalyBannerButtonText}>
                    {showAnomaliesOnly ? "Xem tất cả giao dịch" : "Xem danh sách bất thường"}
                  </Text>
                  <Text style={styles.anomalyBannerButtonArrow}>{showAnomaliesOnly ? "‹" : "›"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {showAnomaliesOnly ? (
            <View>
              <Text style={styles.anomalyFilterHeading}>Lọc danh sách bất thường</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.anomalyFilters}>
                <FilterChip
                  label="Tất cả danh mục"
                  selected={anomalyCategoryFilter === "all"}
                  onPress={() => setAnomalyCategoryFilter("all")}
                  styles={styles}
                  theme={theme}
                />
                {anomalyCategories.map(([key, label]) => (
                  <FilterChip
                    key={key}
                    label={label}
                    selected={anomalyCategoryFilter === key}
                    onPress={() => setAnomalyCategoryFilter(key)}
                    styles={styles}
                    theme={theme}
                  />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.anomalyFilters}>
                {anomalyDateFilters.map((filter) => (
                  <FilterChip
                    key={filter.value}
                    label={filter.label}
                    selected={anomalyDateFilter === filter.value}
                    onPress={() => setAnomalyDateFilter(filter.value)}
                    styles={styles}
                    theme={theme}
                  />
                ))}
              </ScrollView>
              {anomalyReasons.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.anomalyFilters}>
                  <FilterChip
                    label="Mọi lý do"
                    selected={anomalyReasonFilter === "all"}
                    onPress={() => setAnomalyReasonFilter("all")}
                    styles={styles}
                    theme={theme}
                  />
                  {anomalyReasons.map((reason) => (
                    <FilterChip
                      key={reason}
                      label={anomalyReasonLabels[reason] ?? reason}
                      selected={anomalyReasonFilter === reason}
                      onPress={() => setAnomalyReasonFilter(reason)}
                      styles={styles}
                      theme={theme}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <Text style={styles.anomalyResultCount}>{filteredAnomalies.length} giao dịch phù hợp</Text>
              {filteredAnomalies.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Không có anomaly phù hợp</Text>
                  <Text style={styles.emptyText}>Thử thay đổi bộ lọc danh mục, ngày hoặc lý do.</Text>
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
          ) : isLoading ? (
            <TransactionSkeleton />
          ) : groupedTransactions.length === 0 ? (
            <EmptyState />
          ) : (
            groupedTransactions.map(([date, items]) => (
              <TransactionDay key={date} anomalyIds={anomalyIds} currency={currency} date={date} transactions={items} />
            ))
          )}
          {!showAnomaliesOnly && totalPages > 1 ? (
            <View style={styles.pagination}>
              <Pressable
                disabled={page === 1}
                onPress={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
              >
                <Text style={styles.pageButtonText}>Trang trước</Text>
              </Pressable>
              <Text style={styles.pageLabel}>
                Trang {page}/{totalPages}
              </Text>
              <Pressable
                disabled={page === totalPages}
                onPress={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                style={[styles.pageButton, page === totalPages && styles.pageButtonDisabled]}
              >
                <Text style={styles.pageButtonText}>Trang sau</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.netCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Thu nhập ròng</Text>
              <Text style={[styles.netValue, { color: summary.net >= 0 ? theme.goodText : theme.dangerText }]}>
                {formatMoney(summary.net, currency)}
              </Text>
            </View>
            <Text style={styles.helperText}>Khoản thu trừ khoản chi trong kỳ</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${netRatio}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{Math.round(netRatio)}% dòng tiền vào còn lại</Text>
          </View>

          <View style={styles.breakdownCard}>
            <Text style={styles.sectionTitle}>Báo cáo theo nhóm</Text>
            <View style={styles.breakdownRow}>
              <Donut value={summary.incoming} color={theme.goodText} label="Thu nhập" />
              <Donut value={summary.outgoing} color={theme.dangerText} label="Chi tiêu" />
            </View>
          </View>
          <View style={styles.otherCard}>
            <Text style={styles.sectionTitle}>Nợ, cho vay và khác</Text>
            <SummaryItem label="Nợ" value={0} color={theme.dangerText} currency={currency} />
            <SummaryItem label="Cho vay" value={0} color={theme.warning} currency={currency} />
            <SummaryItem label="Khác" value={0} color={theme.textSubtle} currency={currency} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </FocusedScreenTransition>
  );
}

function AccountOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useTransactionStyles();

  return (
    <Pressable style={styles.pickerOption} onPress={onPress}>
      <Text style={styles.pickerOptionText}>{label}</Text>
      <Text style={styles.check}>{selected ? "✓" : ""}</Text>
    </Pressable>
  );
}

function SummaryItem({
  label,
  value,
  color,
  currency,
}: {
  label: string;
  value: number;
  color: string;
  currency: string;
}) {
  const styles = useTransactionStyles();

  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{formatMoney(value, currency)}</Text>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
  styles,
  theme,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.anomalyFilterChip, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}
    >
      <Text style={[styles.anomalyFilterText, selected && { color: theme.textInverse }]}>{label}</Text>
    </Pressable>
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
        <Text style={styles.anomalyScore}>Điểm {anomaly.anomalyScore.toFixed(2)}</Text>
      </View>
    </View>
  );
}

function TransactionDay({
  anomalyIds,
  date,
  transactions,
  currency,
}: {
  anomalyIds: Set<number>;
  date: string;
  transactions: Transaction[];
  currency: string;
}) {
  const theme = useAppTheme();
  const styles = useTransactionStyles();

  const movement = (transactions ?? []).reduce(
    (sum, transaction) => sum + (isPositive(transaction.type) ? transaction.amount : -transaction.amount),
    0,
  );
  return (
    <View style={styles.dayGroup}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>
          {new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(date))}
        </Text>
        <Text style={[styles.dayTotal, { color: movement >= 0 ? theme.goodText : theme.dangerText }]}>
          {formatMoney(movement, currency)}
        </Text>
      </View>
      {(transactions ?? []).map((transaction) => (
        <View key={transaction.id} style={styles.transactionRow}>
          <View
            style={[
              styles.transactionIcon,
              { backgroundColor: isPositive(transaction.type) ? theme.goodBackground : theme.warningBackground },
            ]}
          >
            <Text style={{ color: isPositive(transaction.type) ? theme.goodText : theme.dangerText, fontSize: 18 }}>
              {isPositive(transaction.type) ? "↗" : "↘"}
            </Text>
          </View>
          <View style={styles.transactionCopy}>
            <View style={styles.transactionTitleRow}>
              <Text style={styles.transactionTitle}>{transaction.categoryName}</Text>
              {anomalyIds.has(transaction.id) ? (
                <View style={styles.anomalyTag}>
                  <Text style={styles.anomalyIcon}>⚡</Text>
                  <Text style={styles.anomalyTagText}>BẤT THƯỜNG</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.transactionDescription}>{transaction.description || "Không có ghi chú"}</Text>
          </View>
          <Text
            style={[
              styles.transactionAmount,
              { color: isPositive(transaction.type) ? theme.goodText : theme.dangerText },
            ]}
          >
            {isPositive(transaction.type) ? "+" : "-"}
            {formatMoney(transaction.amount, currency)}
          </Text>
        </View>
      ))}
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

function Donut({ value, color, label }: { value: number; color: string; label: string }) {
  const styles = useTransactionStyles();

  return (
    <View style={styles.donutItem}>
      <View style={[styles.donut, { borderColor: color }]}>
        <Text style={styles.donutValue}>{value ? Math.round(value / 1000) : 0}k</Text>
      </View>
      <Text style={styles.donutLabel}>{label}</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.screen, flex: 1 },
    content: { padding: 16, paddingBottom: 96 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 18,
      marginTop: 12,
    },
    eyebrow: { color: theme.textMuted, fontSize: 12 },
    title: { color: theme.text, fontSize: 27, fontWeight: "800", marginTop: 3 },
    monthOverviewButton: {
      alignItems: "center",
      backgroundColor: theme.primaryPressed,
      borderColor: theme.primary,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: 12,
    },
    monthOverviewText: { color: theme.primary, fontSize: 12, fontWeight: "800" },
    monthOverviewArrow: { color: theme.primary, fontSize: 19, fontWeight: "800", lineHeight: 19 },
    selector: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 14,
    },
    selectorLabel: { color: theme.textMuted, fontSize: 11 },
    selectorValue: { color: theme.text, fontSize: 16, fontWeight: "700", marginTop: 3 },
    chevron: { color: theme.text, fontSize: 22 },
    pickerMenu: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      marginTop: 5,
      overflow: "hidden",
    },
    pickerOption: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 13,
    },
    pickerOptionText: { color: theme.text, fontSize: 14 },
    check: { color: theme.primary, fontSize: 18, fontWeight: "700" },
    periodTabs: { gap: 8, paddingVertical: 16 },
    periodTab: { backgroundColor: theme.cardAlt, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9 },
    periodTabActive: { backgroundColor: theme.primary },
    periodTabText: { color: theme.textSubtle, fontSize: 13, fontWeight: "600" },
    periodTabTextActive: { color: theme.textInverse },
    summaryCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 15,
      borderWidth: 1,
      padding: 16,
    },
    cardTitle: { color: theme.textMuted, fontSize: 13 },
    availableBalance: { color: theme.textMuted, fontSize: 12, marginTop: 15 },
    availableValue: { color: theme.text, fontSize: 28, fontWeight: "800", marginTop: 3 },
    summaryGrid: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: "row",
      marginTop: 16,
      paddingTop: 13,
    },
    summaryItem: { flex: 1 },
    summaryLabel: { color: theme.textMuted, fontSize: 11 },
    summaryValue: { fontSize: 13, fontWeight: "700", marginTop: 4 },
    reportButton: {
      alignItems: "center",
      backgroundColor: theme.goodBackground,
      borderRadius: 10,
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 12,
      padding: 13,
    },
    reportButtonText: { color: theme.goodText, fontSize: 14, fontWeight: "700" },
    reportArrow: { color: theme.goodText, fontSize: 22, marginLeft: 8 },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
      marginTop: 20,
    },
    sectionTitle: { color: theme.text, fontSize: 17, fontWeight: "800" },
    sectionMeta: { color: theme.textMuted, fontSize: 12 },
    skeletonGroup: {
      backgroundColor: theme.card,
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
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    anomalyBannerIcon: { color: theme.warning, fontSize: 16 },
    anomalyBannerCopy: { flex: 1, gap: 6 },
    anomalyBannerText: { color: theme.warning, flex: 1, fontSize: 12, fontWeight: "800", lineHeight: 17 },
    anomalyBannerButton: { alignItems: "center", flexDirection: "row", gap: 4, alignSelf: "flex-start" },
    anomalyBannerButtonText: { color: theme.warning, fontSize: 12, fontWeight: "900" },
    anomalyBannerButtonArrow: { color: theme.warning, fontSize: 18, fontWeight: "900", lineHeight: 18 },
    anomalyFilterHeading: { color: theme.text, fontSize: 14, fontWeight: "800", marginBottom: 2 },
    anomalyFilters: { alignItems: "center", gap: 7, paddingVertical: 7 },
    anomalyFilterChip: { backgroundColor: theme.cardAlt, borderColor: theme.border, borderRadius: 16, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
    anomalyFilterText: { color: theme.textSubtle, fontSize: 11, fontWeight: "700" },
    anomalyResultCount: { color: theme.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 8, marginTop: 5 },
    anomalyRow: { backgroundColor: theme.card, borderColor: theme.border, borderRadius: 12, borderWidth: 1, marginBottom: 8, padding: 12 },
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
    loader: { margin: 30 },
    dayGroup: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 10,
      overflow: "hidden",
      paddingHorizontal: 14,
    },
    dayHeader: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 13,
    },
    dayTitle: { color: theme.text, fontSize: 13, fontWeight: "700" },
    dayTotal: { fontSize: 13, fontWeight: "700" },
    transactionRow: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingVertical: 12,
    },
    transactionIcon: {
      alignItems: "center",
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      marginRight: 11,
      width: 36,
    },
    transactionCopy: { flex: 1 },
    transactionTitleRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    transactionTitle: { color: theme.text, fontSize: 14, fontWeight: "700" },
    transactionDescription: { color: theme.textSubtle, fontSize: 11, marginTop: 3 },
    anomalyTag: {
      alignItems: "center",
      backgroundColor: theme.warningBackground,
      borderRadius: 9,
      flexDirection: "row",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    anomalyIcon: { color: theme.warning, fontSize: 12, fontWeight: "900" },
    anomalyTagText: { color: theme.warning, fontSize: 9, fontWeight: "900" },
    transactionAmount: { fontSize: 13, fontWeight: "700", marginLeft: 8 },
    pagination: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 10,
    },
    pageButton: { backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    pageButtonDisabled: { opacity: 0.4 },
    pageButtonText: { color: theme.textInverse, fontSize: 12, fontWeight: "700" },
    pageLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "700" },
    netCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 10,
      padding: 15,
    },
    netValue: { fontSize: 15, fontWeight: "800" },
    helperText: { color: theme.textMuted, fontSize: 12 },
    progressTrack: {
      backgroundColor: theme.progressTrack,
      borderRadius: 5,
      height: 9,
      marginTop: 12,
      overflow: "hidden",
    },
    progressFill: { backgroundColor: theme.primary, borderRadius: 5, height: "100%" },
    progressLabel: { color: theme.textMuted, fontSize: 11, marginTop: 6 },
    breakdownCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 12,
      padding: 15,
    },
    breakdownRow: { flexDirection: "row", justifyContent: "space-around", paddingTop: 15 },
    donutItem: { alignItems: "center" },
    donut: { alignItems: "center", borderRadius: 52, borderWidth: 14, height: 90, justifyContent: "center", width: 90 },
    donutValue: { color: theme.text, fontSize: 13, fontWeight: "800" },
    donutLabel: { color: theme.textMuted, fontSize: 12, marginTop: 8 },
    otherCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      gap: 12,
      marginTop: 12,
      padding: 15,
    },
    empty: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      padding: 28,
    },
    emptyTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
    emptyText: { color: theme.textSubtle, fontSize: 12, marginTop: 6 },
  });
}
