import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const wallets = [
  { name: "ACB Credit Platinum", balance: "16,043,000 đ", icon: "▤", color: "#55c8bc" },
  { name: "Mua MacBook Pro", balance: "11,270,000 đ", icon: "▣", color: "#b86b3e" },
  { name: "Tiền mặt", balance: "10,000,000 đ", icon: "◈", color: "#1c9a76" },
];

const recentTransactions = [
  { title: "Tiền chuyển đến", date: "28 tháng 8 2026", amount: "5,323,000 đ", icon: "↓", color: "#3eacd0" },
  { title: "Khám sức khoẻ", date: "28 tháng 8 2026", amount: "150,000 đ", icon: "♧", color: "#30c0b1" },
  { title: "Sức khoẻ", date: "28 tháng 8 2026", amount: "85,000 đ", icon: "✚", color: "#f26b70" },
];

const spendingByPeriod = {
  week: [
    { title: "Hoá đơn & Tiện ích", amount: "3,089,000 đ", percentage: "34%", icon: "$", color: "#e2e2e2" },
    { title: "Mua sắm", amount: "2,560,000 đ", percentage: "28%", icon: "▥", color: "#3caeaa" },
    { title: "Ăn uống", amount: "1,450,000 đ", percentage: "16%", icon: "♨", color: "#e7a24d" },
  ],
  month: [
    { title: "Hoá đơn & Tiện ích", amount: "12,089,000 đ", percentage: "30%", icon: "$", color: "#e2e2e2" },
    { title: "Giải trí", amount: "5,719,000 đ", percentage: "14%", icon: "⌁", color: "#39a9d2" },
    { title: "Mua sắm", amount: "5,560,000 đ", percentage: "14%", icon: "▥", color: "#3caeaa" },
  ],
} as const;

export default function HomeScreen() {
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [spendingPeriod, setSpendingPeriod] = useState<"week" | "month">("month");

  function handleRefresh() {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 700);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#35c759" />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Chào buổi sáng,</Text>
            <Text style={styles.userName}>Nguyễn Văn A</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerButton} accessibilityLabel="Tìm kiếm">
              <Text style={styles.headerIcon}>⌕</Text>
            </Pressable>
            <Pressable style={styles.headerButton} accessibilityLabel="Thông báo">
              <Text style={styles.headerIcon}>♧</Text>
              <View style={styles.notificationDot} />
            </Pressable>
          </View>
        </View>

        <View style={styles.balanceSection}>
          <View style={styles.balanceLabelRow}>
            <Text style={styles.balanceLabel}>Tổng số dư</Text>
            <Pressable onPress={() => setIsBalanceVisible((visible) => !visible)} hitSlop={10}>
              <Text style={styles.eyeIcon}>{isBalanceVisible ? "◉" : "◌"}</Text>
            </Pressable>
          </View>
          <Text style={styles.balance}>{isBalanceVisible ? "5,227,000 đ" : "••••••••"}</Text>
          <Text style={styles.balanceCaption}>Cập nhật vừa xong</Text>
        </View>

        <SectionHeading title="Tài khoản của tôi" action="Xem tất cả" onAction={() => router.push("/account")} />
        <View style={styles.walletCard}>
          {wallets.map((wallet, index) => (
            <Pressable key={wallet.name} style={[styles.walletRow, index < wallets.length - 1 && styles.rowDivider]}>
              <View style={[styles.walletIcon, { backgroundColor: wallet.color }]}>
                <Text style={styles.walletIconText}>{wallet.icon}</Text>
              </View>
              <Text numberOfLines={1} style={styles.walletName}>
                {wallet.name}
              </Text>
              <Text style={styles.walletBalance}>{wallet.balance}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeading title="Báo cáo tháng này" action="Xem báo cáo" />
        <View style={styles.reportCard}>
          <View style={styles.reportSummary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Tổng đã chi</Text>
              <Text style={styles.expenseValue}>40,840,000</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Tổng thu</Text>
              <Text style={styles.incomeValue}>49,950,000</Text>
            </View>
          </View>
          <View style={styles.chartArea}>
            <View style={styles.chartLabels}>
              <Text style={styles.chartTooltip}>
                28/08/2026: <Text style={styles.tooltipValue}>40,840,000</Text>
                {"\n"}Trung bình 3 tháng trước: 43,996,000
              </Text>
            </View>
            <View style={styles.chartLines}>
              <View style={styles.chartLine} />
              <View style={styles.chartLine} />
              <View style={styles.chartLine} />
              <View style={styles.chartLine} />
              <View style={styles.chartPath} />
              <View style={styles.chartPoint} />
            </View>
            <View style={styles.chartAxis}>
              <Text>01/08</Text>
              <Text>50 M</Text>
              <Text>31/08</Text>
            </View>
          </View>
          <View style={styles.legendRow}>
            <Text style={styles.legendExpense}>● Tháng này</Text>
            <Text style={styles.legendAverage}>● Trung bình 3 tháng trước</Text>
            <Text style={styles.infoMark}>?</Text>
          </View>
          <View style={styles.reportFooter}>
            <Text style={styles.arrow}>‹</Text>
            <Text style={styles.reportLink}>Báo cáo xu hướng</Text>
            <Text style={styles.arrow}>›</Text>
          </View>
        </View>

        <SectionHeading title="Chi tiêu nhiều nhất" action="Xem chi tiết" />
        <View style={styles.spendingCard}>
          <View style={styles.periodToggle}>
            <Pressable
              onPress={() => setSpendingPeriod("week")}
              style={[styles.periodOption, spendingPeriod === "week" && styles.periodOptionSelected]}
            >
              <Text style={[styles.periodText, spendingPeriod === "week" && styles.periodTextSelected]}>Tuần</Text>
            </Pressable>
            <Pressable
              onPress={() => setSpendingPeriod("month")}
              style={[styles.periodOption, spendingPeriod === "month" && styles.periodOptionSelected]}
            >
              <Text style={[styles.periodText, spendingPeriod === "month" && styles.periodTextSelected]}>Tháng</Text>
            </Pressable>
          </View>
          {spendingByPeriod[spendingPeriod].map((category) => (
            <View key={category.title} style={styles.spendingRow}>
              <View style={[styles.spendingIcon, { backgroundColor: category.color }]}>
                <Text style={styles.spendingIconText}>{category.icon}</Text>
              </View>
              <View style={styles.spendingMain}>
                <Text style={styles.spendingTitle}>{category.title}</Text>
                <Text style={styles.spendingAmount}>{category.amount}</Text>
              </View>
              <Text style={styles.spendingPercentage}>{category.percentage}</Text>
            </View>
          ))}
        </View>

        <SectionHeading title="Giao dịch gần đây" action="Xem tất cả" />
        <View style={styles.transactionCard}>
          {recentTransactions.map((transaction, index) => (
            <View
              key={transaction.title}
              style={[styles.transactionRow, index < recentTransactions.length - 1 && styles.rowDivider]}
            >
              <View style={[styles.transactionIcon, { backgroundColor: `${transaction.color}22` }]}>
                <Text style={[styles.transactionIconText, { color: transaction.color }]}>{transaction.icon}</Text>
              </View>
              <View style={styles.transactionMain}>
                <Text style={styles.transactionTitle}>{transaction.title}</Text>
                <Text style={styles.transactionDate}>{transaction.date}</Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  { color: transaction.title === "Tiền chuyển đến" ? "#36afd2" : "#f2666d" },
                ]}
              >
                {transaction.amount}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeading({ title, action, onAction }: { title: string; action: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onAction}>
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f7f8fa", flex: 1 },
  content: { paddingBottom: 28, paddingHorizontal: 15 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingTop: 14 },
  greeting: { color: "#737984", fontSize: 13 },
  userName: { color: "#171a21", fontSize: 18, fontWeight: "700", marginTop: 3 },
  headerActions: { flexDirection: "row", gap: 9 },
  headerButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    height: 38,
    justifyContent: "center",
    position: "relative",
    width: 38,
  },
  headerIcon: { color: "#252a33", fontSize: 24, lineHeight: 25 },
  notificationDot: {
    backgroundColor: "#f25f63",
    borderColor: "#ffffff",
    borderRadius: 4,
    borderWidth: 2,
    height: 9,
    position: "absolute",
    right: 8,
    top: 7,
    width: 9,
  },
  balanceSection: { paddingBottom: 22, paddingTop: 26 },
  balanceLabelRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  balanceLabel: { color: "#737984", fontSize: 14 },
  eyeIcon: { color: "#252a33", fontSize: 16 },
  balance: { color: "#15181e", fontSize: 32, fontWeight: "800", letterSpacing: 0, marginTop: 5 },
  balanceCaption: { color: "#8b929e", fontSize: 12, marginTop: 5 },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: { color: "#606873", fontSize: 15, fontWeight: "600" },
  sectionAction: { color: "#39c568", fontSize: 14, fontWeight: "700" },
  walletCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e8ed",
    borderRadius: 15,
    borderWidth: 1,
    overflow: "hidden",
  },
  walletRow: { alignItems: "center", minHeight: 56, paddingHorizontal: 14 },
  rowDivider: { borderBottomColor: "#e7e9ed", borderBottomWidth: StyleSheet.hairlineWidth },
  walletIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginRight: 12,
    width: 36,
  },
  walletIconText: { color: "#eef1f0", fontSize: 19, fontWeight: "700" },
  walletName: { color: "#252a33", flex: 1, fontSize: 14, fontWeight: "600" },
  walletBalance: { color: "#252a33", fontSize: 14, fontWeight: "700", marginLeft: 8 },
  reportCard: { backgroundColor: "#ffffff", borderColor: "#e5e8ed", borderRadius: 15, borderWidth: 1, padding: 14 },
  reportSummary: { borderBottomColor: "#e1e4e9", borderBottomWidth: 1, flexDirection: "row", paddingBottom: 11 },
  summaryItem: { alignItems: "center", flex: 1 },
  summaryLabel: { color: "#737984", fontSize: 13 },
  expenseValue: { color: "#f2646c", fontSize: 17, fontWeight: "700", marginTop: 2 },
  incomeValue: { color: "#28aeda", fontSize: 17, fontWeight: "700", marginTop: 2 },
  chartArea: { height: 135, marginTop: 9, position: "relative" },
  chartLabels: { alignItems: "flex-end", height: 47 },
  chartTooltip: {
    backgroundColor: "#eef1f4",
    borderRadius: 4,
    color: "#626a75",
    fontSize: 10,
    lineHeight: 15,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: "right",
  },
  tooltipValue: { color: "#f26c70", fontSize: 14, fontWeight: "800" },
  chartLines: { bottom: 22, left: 0, position: "absolute", right: 0, top: 49 },
  chartLine: { borderTopColor: "#dfe3e8", borderTopWidth: 1, borderStyle: "dashed", height: 25 },
  chartPath: {
    backgroundColor: "#a16b6c66",
    borderColor: "#f2676d",
    borderTopLeftRadius: 60,
    borderTopWidth: 2,
    bottom: 0,
    height: 62,
    left: 3,
    position: "absolute",
    right: 45,
    transform: [{ skewY: "-10deg" }],
  },
  chartPoint: {
    backgroundColor: "#f2676d",
    borderColor: "#fbd5d7",
    borderRadius: 6,
    borderWidth: 2,
    bottom: 29,
    height: 11,
    position: "absolute",
    right: 42,
    width: 11,
  },
  chartAxis: {
    bottom: 0,
    color: "#85858b",
    flexDirection: "row",
    fontSize: 10,
    justifyContent: "space-between",
    position: "absolute",
    width: "100%",
  },
  legendRow: { alignItems: "center", flexDirection: "row", gap: 9, marginTop: 5 },
  legendExpense: { color: "#737984", fontSize: 11 },
  legendAverage: { color: "#737984", fontSize: 11 },
  infoMark: {
    alignItems: "center",
    borderColor: "#8e8e94",
    borderRadius: 7,
    borderWidth: 1,
    color: "#8e8e94",
    fontSize: 9,
    height: 14,
    textAlign: "center",
    width: 14,
  },
  reportFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  arrow: { color: "#28bd63", fontSize: 25 },
  reportLink: { color: "#32c46b", fontSize: 15, fontWeight: "600" },
  spendingCard: { backgroundColor: "#ffffff", borderColor: "#e5e8ed", borderRadius: 15, borderWidth: 1, padding: 14 },
  periodToggle: {
    backgroundColor: "#eef1f4",
    borderRadius: 7,
    flexDirection: "row",
    height: 34,
    marginBottom: 13,
    overflow: "hidden",
  },
  periodOption: { alignItems: "center", flex: 1, justifyContent: "center" },
  periodOptionSelected: { backgroundColor: "#ffffff", borderRadius: 7 },
  periodText: { color: "#737984", fontSize: 14 },
  periodTextSelected: { color: "#252a33", fontWeight: "600" },
  spendingRow: { alignItems: "center", minHeight: 56 },
  spendingIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginRight: 13,
    width: 36,
  },
  spendingIconText: { color: "#46464a", fontSize: 18, fontWeight: "800" },
  spendingMain: { flex: 1 },
  spendingTitle: { color: "#252a33", fontSize: 14, fontWeight: "600" },
  spendingAmount: { color: "#858d99", fontSize: 11, marginTop: 3 },
  spendingPercentage: { color: "#f2676d", fontSize: 16, fontWeight: "500" },
  transactionCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e8ed",
    borderRadius: 15,
    borderWidth: 1,
    overflow: "hidden",
  },
  transactionRow: { alignItems: "center", minHeight: 68, paddingHorizontal: 14 },
  transactionIcon: {
    alignItems: "center",
    borderRadius: 20,
    height: 38,
    justifyContent: "center",
    marginRight: 12,
    width: 38,
  },
  transactionIconText: { fontSize: 20, fontWeight: "700" },
  transactionMain: { flex: 1 },
  transactionTitle: { color: "#252a33", fontSize: 14, fontWeight: "600" },
  transactionDate: { color: "#858d99", fontSize: 11, marginTop: 4 },
  transactionAmount: { fontSize: 13, fontWeight: "700", marginLeft: 8 },
});
