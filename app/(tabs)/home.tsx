import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { categoriesApi, Category } from "@/api/categoriesApi";
import { FinancialAccount, financialAccountApi, getFinancialAccountBalance } from "@/api/financialAccountApi";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  CategorySpendingResponse,
  Transaction,
  transactionApi,
  transactionsApi,
  TransactionType,
} from "@/api/transactionsApi";
import { getAuthUser } from "@/stores/authSession";
import type { AppTheme } from "@/theme/appTheme";

const accountTypeMeta: Record<FinancialAccount["type"], { color: string; icon: string; label: string }> = {
  Bank: { color: "#2778d7", icon: "▤", label: "Bank" },
  Cash: { color: "#22a66f", icon: "●", label: "Cash" },
  Savings: { color: "#d9962b", icon: "◎", label: "Saving" },
};

function useHomeStyles() {
  const theme = useAppTheme();

  return useMemo(() => createStyles(theme), [theme]);
}

function formatMoney(amount: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", { currency, maximumFractionDigits: 0, style: "currency" }).format(amount);
}

function formatShortMoney(amount: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1, notation: "compact" }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short" }).format(new Date(value));
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return { end, start };
}

function isInRange(dateValue: string, start: Date, end: Date) {
  const date = new Date(dateValue);

  return date >= start && date < end;
}

function isIncome(type: TransactionType) {
  return type === "Income" || type === "TransferIn";
}

function getSignedAmount(transaction: Transaction) {
  return isIncome(transaction.type) ? transaction.amount : -transaction.amount;
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 11) {
    return "Chào buổi sáng,";
  }

  if (hour < 18) {
    return "Chào buổi chiều,";
  }

  return "Chào buổi tối,";
}

function getCategoryFallback(type: TransactionType) {
  if (type === "Income") {
    return "Thu nhập";
  }

  if (type === "TransferIn" || type === "TransferOut") {
    return "Chuyển khoản";
  }

  return "Chi tiêu";
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const styles = useHomeStyles();
  const user = getAuthUser();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [spendingStats, setSpendingStats] = useState<CategorySpendingResponse | null>(null);
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [isAccountsVisible, setIsAccountsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadHomeData = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      const [accountResponse, transactionResponse, categoryResponse, spendingResponse] = await Promise.all([
        financialAccountApi.list(),
        transactionApi.list(),
        categoriesApi.list(),
        transactionsApi.categorySpending(),
      ]);

      setAccounts(accountResponse.data);
      setTransactions(transactionResponse.data);
      setCategories(categoryResponse.data);
      setSpendingStats(spendingResponse.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vui lòng thử lại sau.";
      setErrorMessage(message);
      Alert.alert("Không tải được tổng quan", message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => loadHomeData(), 0);

    return () => clearTimeout(timeoutId);
  }, [loadHomeData]);

  const currency = accounts[0]?.currency ?? "VND";
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const { end: monthEnd, start: monthStart } = useMemo(() => getMonthRange(), []);

  const activeAccounts = useMemo(() => accounts.filter((account) => account.isActive), [accounts]);
  const totalBalance = useMemo(
    () => activeAccounts.reduce((total, account) => total + getFinancialAccountBalance(account), 0),
    [activeAccounts],
  );

  const monthTransactions = useMemo(
    () =>
      transactions
        .filter(
          (transaction) => !transaction.isExcluded && isInRange(transaction.transactionDate, monthStart, monthEnd),
        )
        .sort((left, right) => new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime()),
    [monthEnd, monthStart, transactions],
  );

  const monthlyIncome = useMemo(
    () =>
      monthTransactions
        .filter((transaction) => isIncome(transaction.type))
        .reduce((total, transaction) => total + transaction.amount, 0),
    [monthTransactions],
  );
  const fallbackExpense = useMemo(
    () =>
      monthTransactions
        .filter((transaction) => !isIncome(transaction.type))
        .reduce((total, transaction) => total + transaction.amount, 0),
    [monthTransactions],
  );
  const monthlyExpense = spendingStats?.totalAmount ?? fallbackExpense;
  const recentTransactions = monthTransactions.slice(0, 5);
  const topCategories = useMemo(
    () =>
      (spendingStats?.categories ?? [])
        .filter((category) => category.amount > 0)
        .sort((left, right) => right.amount - left.amount)
        .slice(0, 4),
    [spendingStats],
  );

  // Tính toán dữ liệu chi tiêu theo ngày
  const dailySpending = useMemo(() => {
    const daysInMonth = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 0).getDate();
    const spendingMap = new Map<number, number>();

    monthTransactions
      .filter((t) => !isIncome(t.type))
      .forEach((t) => {
        const day = new Date(t.transactionDate).getDate();
        spendingMap.set(day, (spendingMap.get(day) || 0) + t.amount);
      });

    return Array.from({ length: daysInMonth }, (_, i) => spendingMap.get(i + 1) || 0);
  }, [monthTransactions, monthEnd]);

  const maxDailySpending = useMemo(() => Math.max(...dailySpending, 2000000), [dailySpending]);
  // Lọc dữ liệu các ngày có giao dịch (tối đa 15 ngày)
  const activeDaysData = useMemo(() => {
    const data = dailySpending
      .map((amount, i) => ({ day: i + 1, amount }))
      .filter((item) => item.amount > 0);
    
    // Nếu quá 15 ngày, lấy 15 ngày gần cuối
    if (data.length > 15) {
      return data.slice(-15);
    }
    return data;
  }, [dailySpending]);

  const displayName = user?.displayName ?? user?.username ?? "bạn";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadHomeData(true)} tintColor={theme.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text numberOfLines={1} style={styles.userName}>
              {displayName}
            </Text>
          </View>
          <Pressable
            style={styles.iconButton}
            onPress={() => loadHomeData(true)}
            accessibilityLabel="Làm mới tổng quan"
          >
            <Text style={styles.iconButtonText}>↻</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Pressable style={{ flex: 1 }} onPress={() => setIsAccountsVisible((visible) => !visible)}>
              <View style={styles.heroTitleRow}>
                <Text style={styles.heroLabel}>Tổng số dư</Text>
                <Text style={styles.chevronText}>{isAccountsVisible ? " ▾" : " ▸"}</Text>
              </View>
              <Text style={styles.heroCaption}>
                {activeAccounts.length} ví · {isAccountsVisible ? "Nhấn để thu gọn" : "Nhấn để xem chi tiết"}
              </Text>
            </Pressable>
            <Pressable style={styles.eyeButton} onPress={() => setIsBalanceVisible((visible) => !visible)} hitSlop={10}>
              <Text style={styles.eyeText}>{isBalanceVisible ? "◉" : "○"}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setIsAccountsVisible((visible) => !visible)}>
            <Text style={styles.heroBalance}>
              {isBalanceVisible ? formatMoney(totalBalance, currency) : "••••••••••"}
            </Text>
          </Pressable>
          <View style={styles.heroStats}>
            <MetricPill label="Thu tháng này" tone="good" value={formatMoney(monthlyIncome, currency)} />
            <MetricPill label="Chi tháng này" tone="warn" value={formatMoney(monthlyExpense, currency)} />
          </View>

          {isAccountsVisible && (
            <View style={styles.heroAccountsList}>
              <View style={styles.heroDivider} />
              <View style={styles.heroAccountsHeader}>
                <Text style={styles.heroAccountsTitle}>Danh sách tài khoản</Text>
                <Pressable onPress={() => router.push("/account")} hitSlop={8}>
                  <Text style={styles.heroAccountsAction}>Quản lý ví ➔</Text>
                </Pressable>
              </View>
              <View style={styles.heroAccountsGrid}>
                {activeAccounts.length === 0 ? (
                  <EmptyState title="Chưa có ví" description="Tạo ví đầu tiên để bắt đầu theo dõi số dư." />
                ) : (
                  activeAccounts.map((account) => (
                    <HeroAccountRow
                      key={account.id}
                      account={account}
                      currency={currency}
                      isBalanceVisible={isBalanceVisible}
                    />
                  ))
                )}
              </View>
            </View>
          )}
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Dữ liệu chưa sẵn sàng</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.primary} />
            <Text style={styles.loadingText}>Đang tải dữ liệu tổng quan...</Text>
          </View>
        ) : (
          <>

            <SectionHeading
              title="Báo cáo tháng này"
              action="Xem sổ"
              onAction={() => router.push("/(tabs)/transactions")}
            />
            <View style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View>
                  <Text style={styles.reportLabel}>Tổng chi tiêu</Text>
                  <Text style={[styles.reportValue, styles.negativeText]}>
                    {formatMoney(monthlyExpense, currency)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.reportLabel}>Tổng thu nhập</Text>
                  <Text style={[styles.reportValue, styles.positiveText]}>
                    {formatMoney(monthlyIncome, currency)}
                  </Text>
                </View>
              </View>

              {/* Biểu đồ cột chi tiêu theo ngày */}
              <View style={styles.chartWrapper}>
                <View style={styles.dailyChartContainer}>
                  {activeDaysData.map((item, index) => (
                    <View key={index} style={styles.dailyBarWrapper}>
                      <Text style={styles.barAmountText}>{formatShortMoney(item.amount)}</Text>
                      <View
                        style={[
                          styles.dailyBar,
                          { height: `${(item.amount / maxDailySpending) * 100}%` },
                        ]}
                      />
                      <Text style={styles.xAxisLabel}>{item.day}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <Text style={styles.chartFooter}>Ngày trong tháng</Text>
            </View>

            <SectionHeading
              title="Chi tiêu nhiều nhất"
              action="Chi tiết"
              onAction={() => router.push("/(tabs)/user")}
            />
            <View style={styles.categoryCard}>
              {topCategories.length === 0 ? (
                <EmptyState title="Chưa có chi tiêu" description="Các danh mục phát sinh trong tháng sẽ hiện ở đây." />
              ) : (
                topCategories.map((category, index) => (
                  <CategoryRow
                    key={category.categoryId ?? category.categoryName}
                    category={category}
                    index={index}
                    currency={currency}
                  />
                ))
              )}
            </View>

            <SectionHeading
              title="Giao dịch gần đây"
              action="Xem tất cả"
              onAction={() => router.push("/(tabs)/transactions")}
            />
            <View style={styles.transactionCard}>
              {recentTransactions.length === 0 ? (
                <EmptyState title="Chưa có giao dịch" description="Giao dịch mới nhất trong tháng sẽ hiện ở đây." />
              ) : (
                recentTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    account={accountMap.get(transaction.accountId)}
                    category={transaction.categoryId ? categoryMap.get(transaction.categoryId) : undefined}
                    currency={currency}
                    transaction={transaction}
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricPill({ label, tone, value }: { label: string; tone: "good" | "warn"; value: string }) {
  const styles = useHomeStyles();

  return (
    <View style={[styles.metricPill, tone === "good" ? styles.metricGood : styles.metricWarn]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

// Tài khoản trong Tổng số dư
function HeroAccountRow({
  account,
  currency,
  isBalanceVisible,
}: {
  account: FinancialAccount;
  currency: string;
  isBalanceVisible: boolean;
}) {
  const styles = useHomeStyles();
  const meta = accountTypeMeta[account.type] || { color: "#8fa49a", icon: "●", label: "Ví" };

  return (
    <Pressable style={styles.heroAccountRow} onPress={() => router.push("/account")}>
      <View style={[styles.heroAccountIcon, { backgroundColor: `${meta.color}33` }]}>
        <Text style={[styles.heroAccountIconText, { color: meta.color }]}>{meta.icon}</Text>
      </View>
      <Text numberOfLines={1} style={styles.heroAccountName}>
        {account.name}
      </Text>
      <Text style={styles.heroAccountBalance}>
        {isBalanceVisible
          ? formatMoney(getFinancialAccountBalance(account), account.currency || currency)
          : "••••••••"}
      </Text>
    </Pressable>
  );
}

// Chi tiêu nhiều nhất
function CategoryRow({
  category,
  currency,
  index,
}: {
  category: CategorySpendingResponse["categories"][number];
  currency: string;
  index: number;
}) {
  const styles = useHomeStyles();
  const colors = ["#3557a4", "#c05b3e", "#1b8f5a", "#7c61d9"];
  const color = colors[index % colors.length];

  return (
    <View style={[styles.categoryRow, index > 0 && styles.rowDivider]}>
      <View style={[styles.categoryIcon, { backgroundColor: `${color}18` }]}>
        <Text style={[styles.categoryIconText, { color }]}>{category.icon?.charAt(0).toUpperCase() ?? "?"}</Text>
      </View>
      <View style={styles.categoryMain}>
        <Text numberOfLines={1} style={styles.categoryName}>
          {category.categoryName}
        </Text>
        <Text style={styles.categoryMeta}>
          {category.transactionCount} giao dịch · {category.percentage.toFixed(1)}%
        </Text>
      </View>
      <Text style={styles.categoryAmount}>{formatMoney(category.amount, currency)}</Text>
    </View>
  );
}

// Giao dịch gần đây
function TransactionRow({
  account,
  category,
  currency,
  transaction,
}: {
  account?: FinancialAccount;
  category?: Category;
  currency: string;
  transaction: Transaction;
}) {
  const styles = useHomeStyles();
  const positive = isIncome(transaction.type);
  const signedAmount = getSignedAmount(transaction);
  const title = category?.name ?? getCategoryFallback(transaction.type);

  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionIcon, positive ? styles.incomeIcon : styles.expenseIcon]}>
        <Text style={[styles.transactionIconText, positive ? styles.positiveText : styles.negativeText]}>
          {positive ? "↗" : "↘"}
        </Text>
      </View>
      <View style={styles.transactionMain}>
        <Text numberOfLines={1} style={styles.transactionTitle}>
          {transaction.description || title}
        </Text>
        <Text numberOfLines={1} style={styles.transactionMeta}>
          {formatDate(transaction.transactionDate)} · {account?.name ?? "Không rõ ví"}
        </Text>
      </View>
      <Text style={[styles.transactionAmount, positive ? styles.positiveText : styles.negativeText]}>
        {signedAmount > 0 ? "+" : "-"}
        {formatMoney(Math.abs(signedAmount), account?.currency ?? currency)}
      </Text>
    </View>
  );
}

function SectionHeading({ action, onAction, title }: { action: string; onAction?: () => void; title: string }) {
  const styles = useHomeStyles();

  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ description, title }: { description: string; title: string }) {
  const styles = useHomeStyles();

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{description}</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  screen: { backgroundColor: theme.screen, flex: 1 },
  content: { paddingBottom: 112, paddingHorizontal: 16 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 16,
    paddingTop: 14,
  },
  headerCopy: { flex: 1, paddingRight: 12 },
  greeting: { color: theme.textMuted, fontSize: 13, fontWeight: "600" },
  userName: { color: theme.text, fontSize: 24, fontWeight: "900", marginTop: 3 },
  iconButton: {
    alignItems: "center",
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  iconButtonText: { color: theme.primary, fontSize: 22, fontWeight: "800", lineHeight: 24 },
  heroCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  heroTopRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  heroLabel: { color: theme.text, fontSize: 14, fontWeight: "800" },
  heroCaption: { color: theme.textMuted, fontSize: 12, marginTop: 3 },
  eyeButton: { alignItems: "center", height: 34, justifyContent: "center", width: 34 },
  eyeText: { color: theme.primary, fontSize: 18 },
  heroBalance: { color: theme.text, fontSize: 34, fontWeight: "900", letterSpacing: 0, marginTop: 16 },
  heroStats: { flexDirection: "row", gap: 10, marginTop: 18 },
  metricPill: { borderRadius: 8, flex: 1, minHeight: 64, padding: 12 },
  metricGood: { backgroundColor: theme.goodBackground },
  metricWarn: { backgroundColor: theme.warningBackground },
  metricLabel: { color: theme.textMuted, fontSize: 11, fontWeight: "800" },
  metricValue: { color: theme.text, fontSize: 14, fontWeight: "900", marginTop: 6 },
  errorCard: {
    backgroundColor: theme.warningBackground,
    borderColor: theme.warning,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  errorTitle: { color: theme.warning, fontSize: 14, fontWeight: "900" },
  errorText: { color: theme.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  loadingCard: { alignItems: "center", backgroundColor: theme.card, borderRadius: 8, gap: 10, marginTop: 16, padding: 28 },
  loadingText: { color: theme.textMuted, fontSize: 13, fontWeight: "700" },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 22,
  },
  sectionTitle: { color: theme.text, fontSize: 17, fontWeight: "900" },
  sectionAction: { color: theme.primary, fontSize: 13, fontWeight: "900" },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chevronText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  heroDivider: {
    backgroundColor: theme.border,
    height: 1,
    marginVertical: 14,
  },
  heroAccountsList: {
    marginTop: 4,
  },
  heroAccountsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heroAccountsTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  heroAccountsAction: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  heroAccountsGrid: {
    gap: 8,
  },
  heroAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.cardAlt,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  heroAccountIcon: {
    alignItems: "center",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    marginRight: 10,
    width: 30,
  },
  heroAccountIconText: {
    fontSize: 15,
    fontWeight: "900",
  },
  heroAccountName: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  heroAccountBalance: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
  reportCard: { backgroundColor: theme.card, borderColor: theme.border, borderRadius: 8, borderWidth: 1, padding: 16 },
  reportHeader: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  reportLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "800" },
  reportValue: { fontSize: 26, fontWeight: "900", marginTop: 4 },
  trendBadge: { backgroundColor: theme.cardAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  trendText: { color: theme.primary, fontSize: 12, fontWeight: "900" },
  chartWrapper: {
    flexDirection: "row",
    marginTop: 20,
    height: 100,
    marginBottom: 20,
  },
  dailyChartContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    paddingTop: 20,
    paddingBottom: 4,
  },
  dailyBarWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barAmountText: {
    fontSize: 8,
    color: theme.textSubtle,
    marginBottom: 2,
    textAlign: "center",
  },
  dailyBar: {
    backgroundColor: theme.dangerText,
    borderRadius: 2,
    width: "100%",
    minHeight: 2,
  },
  xAxisLabel: {
    color: theme.textSubtle,
    fontSize: 8,
    fontWeight: "700",
    marginTop: 4,
  },
  chartFooter: {
    color: theme.textSubtle,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  reportSummaryRow: {
    borderTopColor: theme.border,
    borderTopWidth: 1,
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 14,
  },
  reportSummaryItem: { flex: 1 },
  reportSummaryLabel: { color: theme.textSubtle, fontSize: 11, fontWeight: "800" },
  reportSummaryValue: { fontSize: 15, fontWeight: "900", marginTop: 5 },
  categoryCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  categoryRow: { alignItems: "center", flexDirection: "row", minHeight: 68, paddingHorizontal: 14 },
  rowDivider: { borderTopColor: theme.border, borderTopWidth: 1 },
  categoryIcon: {
    alignItems: "center",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    marginRight: 12,
    width: 38,
  },
  categoryIconText: { fontSize: 17, fontWeight: "900" },
  categoryMain: { flex: 1 },
  categoryName: { color: theme.text, fontSize: 14, fontWeight: "900" },
  categoryMeta: { color: theme.textSubtle, fontSize: 11, fontWeight: "700", marginTop: 3 },
  categoryAmount: { color: theme.text, fontSize: 13, fontWeight: "900", marginLeft: 10 },
  transactionCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  transactionRow: {
    alignItems: "center",
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 72,
    paddingHorizontal: 14,
  },
  transactionIcon: {
    alignItems: "center",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    marginRight: 12,
    width: 38,
  },
  incomeIcon: { backgroundColor: theme.goodBackground },
  expenseIcon: { backgroundColor: theme.warningBackground },
  transactionIconText: { fontSize: 18, fontWeight: "900" },
  transactionMain: { flex: 1 },
  transactionTitle: { color: theme.text, fontSize: 14, fontWeight: "900" },
  transactionMeta: { color: theme.textSubtle, fontSize: 11, fontWeight: "700", marginTop: 4 },
  transactionAmount: { fontSize: 13, fontWeight: "900", marginLeft: 10 },
  positiveText: { color: theme.goodText },
  negativeText: { color: theme.dangerText },
  emptyState: { alignItems: "center", flex: 1, padding: 22 },
  emptyTitle: { color: theme.text, fontSize: 15, fontWeight: "900", textAlign: "center" },
  emptyText: { color: theme.textSubtle, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" },
  });
}
