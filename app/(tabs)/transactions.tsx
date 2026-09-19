import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";
import { useAppTheme } from "@/hooks/use-app-theme";
import { Transaction, TransactionType, transactionApi } from "@/api/transactionsApi";
import type { AppTheme } from "@/theme/appTheme";

type Period = "previous" | "current" | "future";

const periodLabels: Record<Period, string> = {
  previous: "Tháng trước",
  current: "Tháng này",
  future: "Tương lai",
};

const typeLabels: Record<TransactionType, string> = {
  Income: "Thu nhập",
  Expense: "Chi tiêu",
  TransferIn: "Chuyển vào",
  TransferOut: "Chuyển ra",
};

function useTransactionStyles() {
  const theme = useAppTheme();

  return useMemo(() => createStyles(theme), [theme]);
}

function formatMoney(amount: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", { currency, maximumFractionDigits: 0, style: "currency" }).format(amount);
}

function getPeriodRange(period: Period) {
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
  const [period, setPeriod] = useState<Period>("current");
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      const [accountResponse, transactionResponse] = await Promise.all([
        financialAccountApi.list(),
        transactionApi.list(),
      ]);
      setAccounts(accountResponse.data);
      setTransactions(transactionResponse.data);
    } catch (error) {
      Alert.alert("Không tải được giao dịch", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => loadData(), 0);
    return () => clearTimeout(timeoutId);
  }, [loadData]);

  const filteredTransactions = useMemo(() => {
    const { start, end } = getPeriodRange(period);
    return transactions
      .filter((transaction) => {
        const date = new Date(transaction.transactionDate);
        return (
          date >= start && date < end && (selectedAccountId === null || transaction.accountId === selectedAccountId)
        );
      })
      .sort((left, right) => new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime());
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
    return [...groups.entries()];
  }, [filteredTransactions]);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const currency = selectedAccount?.currency ?? accounts[0]?.currency ?? "VND";
  const netRatio = summary.incoming ? Math.min(100, Math.max(0, (summary.net / summary.incoming) * 100)) : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} tintColor={theme.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Quản lý tài chính</Text>
            <Text style={styles.title}>Sổ giao dịch</Text>
          </View>
          <Pressable style={styles.searchButton}>
            <Text style={styles.searchIcon}>⌕</Text>
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
                setSelectedAccountId(null);
                setIsAccountPickerOpen(false);
              }}
            />
            {accounts.map((account) => (
              <AccountOption
                key={account.id}
                label={account.name}
                selected={selectedAccountId === account.id}
                onPress={() => {
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
          <Text style={styles.sectionTitle}>Lịch sử giao dịch</Text>
          <Text style={styles.sectionMeta}>{filteredTransactions.length} giao dịch</Text>
        </View>
        {isLoading ? (
          <ActivityIndicator color={theme.primary} style={styles.loader} />
        ) : groupedTransactions.length === 0 ? (
          <EmptyState />
        ) : (
          groupedTransactions.map(([date, items]) => (
            <TransactionDay key={date} date={date} transactions={items} currency={currency} />
          ))
        )}

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

function TransactionDay({
  date,
  transactions,
  currency,
}: {
  date: string;
  transactions: Transaction[];
  currency: string;
}) {
  const theme = useAppTheme();
  const styles = useTransactionStyles();

  const movement = transactions.reduce(
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
      {transactions.map((transaction) => (
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
            <Text style={styles.transactionTitle}>{typeLabels[transaction.type]}</Text>
            <Text style={styles.transactionDescription}>{transaction.description || "Không có ghi chú"}</Text>
          </View>
          <Text style={[styles.transactionAmount, { color: isPositive(transaction.type) ? theme.goodText : theme.dangerText }]}>
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
  searchButton: {
    alignItems: "center",
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  searchIcon: { color: theme.text, fontSize: 25 },
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
  summaryCard: { backgroundColor: theme.card, borderColor: theme.border, borderRadius: 15, borderWidth: 1, padding: 16 },
  cardTitle: { color: theme.textMuted, fontSize: 13 },
  availableBalance: { color: theme.textMuted, fontSize: 12, marginTop: 15 },
  availableValue: { color: theme.text, fontSize: 28, fontWeight: "800", marginTop: 3 },
  summaryGrid: { borderTopColor: theme.border, borderTopWidth: 1, flexDirection: "row", marginTop: 16, paddingTop: 13 },
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
  transactionTitle: { color: theme.text, fontSize: 14, fontWeight: "700" },
  transactionDescription: { color: theme.textSubtle, fontSize: 11, marginTop: 3 },
  transactionAmount: { fontSize: 13, fontWeight: "700", marginLeft: 8 },
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
  progressTrack: { backgroundColor: theme.progressTrack, borderRadius: 5, height: 9, marginTop: 12, overflow: "hidden" },
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
