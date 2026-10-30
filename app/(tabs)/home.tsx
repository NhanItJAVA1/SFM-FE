import { Typography } from '@/theme/typography';
import { AppText as Text, useInterFont } from '@/components/app-text';
import { router, useFocusEffect } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

import type { AIAnalysis } from "@/api/aiApi";
import { AIRecommendations } from '@/components/ai-recommendations';
import { CategoryIcon } from '@/components/category-icon';
import { TransactionDayHeader } from '@/components/transaction-day-header';
import { formatTransactionTime, getTransactionDayKey } from '@/utils/transactionPresentation';
import { categoriesApi, Category } from "@/api/categoriesApi";
import { FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";
import { CategorySpendingResponse, Transaction, transactionsApi, TransactionType } from "@/api/transactionsApi";
import { ScreenGradientBackground } from "@/components/screen-gradient-background";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { useAIAnalysis } from "@/hooks/use-ai-analysis";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { getAuthUser } from "@/stores/authSession";
import type { AppTheme } from "@/theme/appTheme";
import { getAccountCurrentBalance } from "@/utils/accountBalance";

const accountTypeMeta: Record<FinancialAccount["type"], { color: string; icon: string; label: string }> = {
  Bank: { color: "#2778d7", icon: "▤", label: "Bank" },
  Cash: { color: "#22a66f", icon: "●", label: "Cash" },
  Savings: { color: "#d9962b", icon: "◎", label: "Saving" },
};

const overviewBackground = require("../../assets/expo.icon/Assets/Serene Blue Abstract Gradient Wallpaper.png");
const darkOverviewBackground = require("../../assets/expo.icon/Assets/Monochrome Orbital Bubble Waves.png");

const forecastChart = {
  bottom: 204,
  height: 186,
  left: 10,
  right: 312,
  svgHeight: 234,
  top: 18,
  width: 350,
};

function useHomeStyles() {
  const theme = useAppTheme();

  return useMemo(() => createStyles(theme), [theme]);
}

function formatMoney(amount: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", { currency, maximumFractionDigits: 0, style: "currency" }).format(amount);
}

function formatPlainMoney(amount: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount);
}

function formatAxisMoney(amount: number) {
  if (amount >= 1_000_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(amount / 1_000_000)} Tr`;
  }

  if (amount >= 1_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount / 1_000)} K`;
  }

  return formatPlainMoney(amount);
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return { end, start };
}

function formatApiDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDayOfMonth(value?: string | null) {
  if (!value) {
    return new Date().getDate();
  }

  if (value.includes("T")) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date.getDate();
    }
  }

  const [, , day] = value.slice(0, 10).split("-").map(Number);

  return Number.isFinite(day) ? day : new Date(value).getDate();
}

function getDaysInMonthFromDate(value?: string | null, fallback = 31) {
  if (!value) {
    return fallback;
  }

  if (value.includes("T")) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    }
  }

  const [year, month] = value.slice(0, 10).split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return fallback;
  }

  return new Date(year, month, 0).getDate();
}

function isInRange(dateValue: string, start: Date, end: Date) {
  const date = new Date(dateValue);

  return date >= start && date < end;
}

function isIncome(type: TransactionType) {
  return type === "Income" || type === "TransferIn";
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

function buildLinePath(points: { day: number; value: number }[], rangeDays: number, maxValue: number) {
  if (points.length === 0) {
    return "";
  }

  const xRange = forecastChart.right - forecastChart.left;
  const yRange = forecastChart.bottom - forecastChart.top;

  return points
    .map((point, index) => {
      const x = rangeDays <= 1 ? forecastChart.left : forecastChart.left + ((point.day - 1) / (rangeDays - 1)) * xRange;
      const y = forecastChart.bottom - (Math.max(point.value, 0) / maxValue) * yRange;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function getDayOffsetFromMonthStart(value: string, year: number, month: number) {
  const [dateYear, dateMonth, dateDay] = value.slice(0, 10).split("-").map(Number);

  if (!Number.isFinite(dateYear) || !Number.isFinite(dateMonth) || !Number.isFinite(dateDay)) {
    return undefined;
  }

  return Math.floor((Date.UTC(dateYear, dateMonth - 1, dateDay) - Date.UTC(year, month, 1)) / 86_400_000) + 1;
}

function getNiceChartMax(value: number) {
  const safeValue = Math.max(value, 1);
  const step =
    safeValue <= 1_000_000
      ? 100_000
      : safeValue <= 5_000_000
        ? 500_000
        : safeValue <= 20_000_000
          ? 1_000_000
          : 5_000_000;

  return Math.ceil(safeValue / step) * step;
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const isDark = useThemeMode() === "dark";
  const styles = useHomeStyles();
  const insets = useSafeAreaInsets();
  const user = getAuthUser();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [spendingStats, setSpendingStats] = useState<CategorySpendingResponse | null>(null);
  const [isAccountsVisible, setIsAccountsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChatButtonVisible, setIsChatButtonVisible] = useState(true);
  const [contentSurfaceTop, setContentSurfaceTop] = useState(202 + insets.top);
  const [chatButtonBottom, setChatButtonBottom] = useState(64 + insets.top);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLoadedDataRef = useRef(false);
  const { analysis, isLoading: isAILoading, isRefreshing: isAIRefreshing, refresh: refreshAI } = useAIAnalysis();

  const loadHomeData = useCallback(
    async ({ refresh = false, silent = false } = {}) => {
      try {
        if (refresh) {
          setIsRefreshing(true);
        } else if (!silent) {
          setIsLoading(true);
        }
        setErrorMessage(null);

        if (refresh) {
          void refreshAI();
        }

        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const transactionRequest = transactionsApi
          .dateRange({
            fromDate: formatApiDate(firstDayOfMonth),
            toDate: formatApiDate(lastDayOfMonth),
          })
          .catch((error) => {
            console.warn("Không tải được giao dịch theo khoảng ngày", error);

            return null;
          });

        const [accountResponse, transactionResponse, categoryResponse, spendingResponse] = await Promise.all([
          financialAccountApi.list(),
          transactionRequest,
          categoriesApi.list(),
          transactionsApi.categorySpending(),
        ]);

        setAccounts(Array.isArray(accountResponse.data) ? accountResponse.data : []);
        setTransactions(Array.isArray(transactionResponse?.data) ? transactionResponse.data : []);
        setCategories(Array.isArray(categoryResponse.data) ? categoryResponse.data : []);
        setSpendingStats(spendingResponse.data);
        hasLoadedDataRef.current = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vui lòng thử lại sau.";
        setErrorMessage(message);
        if (silent) {
          console.warn("Không tải được tổng quan", error);
        } else {
          Alert.alert("Không tải được tổng quan", message);
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
        setIsRefreshing(false);
      }
    },
    [refreshAI],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshAI();
      loadHomeData({ silent: hasLoadedDataRef.current });
    }, [loadHomeData, refreshAI]),
  );

  const currency = accounts[0]?.currency ?? "VND";
  const accountMap = useMemo(() => new Map((accounts ?? []).map((account) => [account.id, account])), [accounts]);
  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories],
  );
  const { end: monthEnd, start: monthStart } = useMemo(() => getMonthRange(), []);

  const activeAccounts = useMemo(() => (accounts ?? []).filter((account) => account.isActive), [accounts]);
  const totalBalance = useMemo(
    () => activeAccounts.reduce((total, account) => total + getAccountCurrentBalance(account), 0),
    [activeAccounts],
  );

  const monthTransactions = useMemo(
    () =>
      (transactions ?? [])
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
    const validMonthEnd = monthEnd ? new Date(monthEnd) : new Date();
    const daysInMonth = new Date(validMonthEnd.getFullYear(), validMonthEnd.getMonth() + 1, 0).getDate();
    const spendingMap = new Map<number, number>();

    monthTransactions
      .filter((t) => !isIncome(t.type))
      .forEach((t) => {
        const day = new Date(t.transactionDate).getDate();
        spendingMap.set(day, (spendingMap.get(day) || 0) + t.amount);
      });

    return Array.from({ length: daysInMonth }, (_, i) => spendingMap.get(i + 1) || 0);
  }, [monthTransactions, monthEnd]);

  const displayName = user?.displayName ?? user?.username ?? "bạn";

  return (
    <FocusedScreenTransition>
      <SafeAreaView style={styles.screen} edges={[]}>
        <ImageBackground
          imageStyle={styles.overviewPanelImage}
          resizeMode="cover"
          source={isDark ? darkOverviewBackground : overviewBackground}
          style={styles.overviewBackground}
        >
          <View style={[styles.overviewStaticContent, { paddingTop: 12 + insets.top }]}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text numberOfLines={1} style={styles.userName}>
                  Hi, {displayName}!
                </Text>
              </View>
              <View style={styles.aiChatPlaceholder} />
            </View>

            <Pressable onPress={() => setIsAccountsVisible((visible) => !visible)}>
              <Text style={styles.heroLabel}>Số dư</Text>
              <Text style={styles.heroBalance}>{formatMoney(totalBalance, currency)}</Text>
            </Pressable>
          </View>
        </ImageBackground>
        <View
          pointerEvents="none"
          style={[styles.bottomSurfaceGuard, isDark && { backgroundColor: theme.screenGradient.bottom.color }]}
        />
        <ScrollView
          contentContainerStyle={styles.content}
          onScroll={({ nativeEvent }) => {
            const isVisible = nativeEvent.contentOffset.y + chatButtonBottom < contentSurfaceTop - 32;
            setIsChatButtonVisible((current) => (current === isVisible ? current : isVisible));
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadHomeData({ refresh: true })}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={{ height: 202 + insets.top }} />
          <View
            onLayout={({ nativeEvent }) => setContentSurfaceTop(nativeEvent.layout.y)}
            style={styles.contentSurface}
          >
            <ScreenGradientBackground darkOnly />
            <View style={styles.heroStats}>
              <MetricPill label="Thu tháng này" tone="good" value={formatMoney(monthlyIncome, currency)} />
              <MetricPill label="Chi tháng này" tone="warn" value={formatMoney(monthlyExpense, currency)} />
              <MetricPill
                label="Số ví"
                onPress={() => setIsAccountsVisible((visible) => !visible)}
                size="compact"
                tone="neutral"
                value={`${activeAccounts.length} ví`}
              />
            </View>

            {isAccountsVisible && (
              <View style={styles.heroAccountsList}>
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
                      <HeroAccountRow key={account.id} account={account} currency={currency} />
                    ))
                  )}
                </View>
              </View>
            )}

            <AIWidget
              analysis={analysis}
              isLoading={isAILoading}
              isRefreshing={isAIRefreshing}
              onAnalyze={() => refreshAI({ force: true })}
              styles={styles}
              theme={theme}
            />

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
                  <SpendingForecastChart
                    analysis={analysis}
                    currency={currency}
                    dailySpending={dailySpending}
                    styles={styles}
                    theme={theme}
                  />
                </View>

                <SectionHeading
                  title="Chi tiêu nhiều nhất"
                  action="Chi tiết"
                  onAction={() => router.push("/(tabs)/user")}
                />
                <View style={styles.categoryCard}>
                  {topCategories.length === 0 ? (
                    <EmptyState
                      title="Chưa có chi tiêu"
                      description="Các danh mục phát sinh trong tháng sẽ hiện ở đây."
                    />
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
                    recentTransactions.map((transaction, index) => (
                      <Fragment key={transaction.id}>
                        {index === 0 || getTransactionDayKey(transaction.transactionDate) !== getTransactionDayKey(recentTransactions[index - 1].transactionDate)
                          ? <TransactionDayHeader date={transaction.transactionDate} /> : null}
                        <TransactionRow
                          account={accountMap.get(transaction.accountId)}
                          category={transaction.categoryId === null ? undefined : categoryMap.get(transaction.categoryId)}
                          currency={currency}
                          transaction={transaction}
                        />
                      </Fragment>
                    ))
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View
            onLayout={({ nativeEvent }) => {
              setChatButtonBottom(nativeEvent.layout.y + nativeEvent.layout.height);
            }}
            pointerEvents={isChatButtonVisible ? "box-none" : "none"}
            style={[styles.aiChatOverlay, { top: 24 + insets.top, opacity: isChatButtonVisible ? 1 : 0 }]}
          >
            <Pressable
              accessibilityLabel="Mở trợ lý tài chính AI"
              accessibilityRole="button"
              accessibilityElementsHidden={!isChatButtonVisible}
              importantForAccessibility={isChatButtonVisible ? "auto" : "no-hide-descendants"}
              disabled={!isChatButtonVisible}
              onPress={() => router.push("/ai-chat")}
              style={styles.aiChatButton}
            >
              <Sparkles color={theme.textInverse} size={19} strokeWidth={2.6} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </FocusedScreenTransition>
  );
}

function AIWidget({
  analysis,
  isLoading,
  isRefreshing,
  onAnalyze,
  styles,
  theme,
}: {
  analysis: AIAnalysis | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onAnalyze: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  if (isLoading) {
    return (
      <View style={styles.aiCard}>
        <View style={styles.aiSkeletonTitle} />
        <View style={styles.aiSkeletonLine} />
        <View style={styles.aiSkeletonLineShort} />
      </View>
    );
  }

  if (!analysis) {
    return null;
  }

  const normalizedHealthStatus = analysis.health_status.toLowerCase();
  const isCritical = normalizedHealthStatus === "critical" || normalizedHealthStatus === "risk";
  const isHealthy = normalizedHealthStatus === "healthy";

  return (
    <View style={styles.aiCard}>
      <View style={styles.aiHeader}>
        <Text style={styles.aiEyebrow}>PHÂN TÍCH AI</Text>
        <View style={styles.aiHeaderActions}>
          <Pressable
            accessibilityLabel="Cập nhật phân tích AI"
            disabled={isRefreshing}
            hitSlop={8}
            onPress={onAnalyze}
            style={[styles.aiAnalyzeButton, isRefreshing && styles.aiAnalyzeButtonDisabled]}
          >
            {isRefreshing ? (
              <ActivityIndicator color={theme.primary} size="small" />
            ) : (
              <Sparkles color={theme.primary} size={14} strokeWidth={2.6} />
            )}
            <Text style={styles.aiAnalyzeText}>Phân tích</Text>
          </Pressable>
          <View
            style={[
              styles.aiBadge,
              isHealthy ? styles.aiBadgeHealthy : isCritical ? styles.aiBadgeCritical : styles.aiBadgeWarning,
            ]}
          >
            <Text style={styles.aiBadgeText}>{analysis.health_status}</Text>
          </View>
        </View>
      </View>
      <View style={styles.aiStatsRow}>
        <View>
          <Text style={styles.aiLabel}>Tỷ lệ tiết kiệm</Text>
          <Text style={styles.aiRate}>{Math.round(analysis.features.savings_rate * 100)}%</Text>
        </View>
        <AIRecommendations key={JSON.stringify(analysis.recommendations)} recommendations={analysis.recommendations ?? []} />
      </View>
    </View>
  );
}

function MetricPill({
  label,
  onPress,
  size = "default",
  tone,
  value,
}: {
  label: string;
  onPress?: () => void;
  size?: "compact" | "default";
  tone: "good" | "neutral" | "warn";
  value: string;
}) {
  const styles = useHomeStyles();
  const toneStyle = tone === "good" ? styles.metricGood : tone === "warn" ? styles.metricWarn : styles.metricNeutral;
  const sizeStyle = size === "compact" ? styles.metricPillCompact : null;
  const content = (
    <>
      <Text numberOfLines={1} style={styles.metricLabel}>
        {label}
      </Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.metricPill, sizeStyle, toneStyle]}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.metricPill, sizeStyle, toneStyle]}>{content}</View>;
}

function SpendingForecastChart({
  analysis,
  currency,
  dailySpending,
  styles,
  theme,
}: {
  analysis: AIAnalysis | null;
  currency: string;
  dailySpending: number[];
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  const chartFont = useInterFont('500');
  const forecast = analysis?.forecast;
  const forecastAsOf = forecast?.asOf;
  const forecastEndDate = forecast?.forecastEndDate;
  const forecastStatus = forecast?.status;
  const dailyForecasts = forecast?.dailyForecasts ?? [];
  const daysInMonth = getDaysInMonthFromDate(forecastAsOf ?? forecastEndDate, dailySpending.length || 31);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonthForecast = (forecastAsOf ?? forecastEndDate)?.slice(0, 7) === currentMonthKey;
  const chartBaseDate = forecastAsOf ? new Date(`${forecastAsOf.slice(0, 10)}T00:00:00`) : now;
  const chartBaseYear = chartBaseDate.getFullYear();
  const chartBaseMonth = chartBaseDate.getMonth();
  const asOfDay = Math.min(
    Math.max(isCurrentMonthForecast ? now.getDate() : getDayOfMonth(forecastAsOf), 1),
    daysInMonth,
  );
  const actualPoints = dailySpending
    .slice(0, asOfDay)
    .reduce<{ day: number; value: number }[]>((points, amount, index) => {
      const runningTotal = (points[points.length - 1]?.value ?? 0) + amount;

      return [...points, { day: index + 1, value: runningTotal }];
    }, []);
  const actualTotal = actualPoints[actualPoints.length - 1]?.value ?? 0;
  let forecastRunningTotal = actualTotal;
  const forecastPoints = [{ day: asOfDay, value: actualTotal }];

  for (const item of dailyForecasts) {
    const date = item.date;
    const predictedExpense = item.predictedExpense;
    const day = date ? getDayOffsetFromMonthStart(date, chartBaseYear, chartBaseMonth) : undefined;

    if (day === undefined || day <= asOfDay || day > daysInMonth) {
      continue;
    }

    forecastRunningTotal += predictedExpense;
    forecastPoints.push({ day, value: forecastRunningTotal });
  }

  forecastPoints.sort((left, right) => left.day - right.day);
  const hasActualData = actualPoints.some((point) => point.value > 0);
  const hasForecastData = forecastPoints.length > 1;
  const maxValue = getNiceChartMax(
    Math.max(1, ...actualPoints.map((point) => point.value), ...forecastPoints.map((point) => point.value)) * 1.08,
  );
  const actualPath = buildLinePath(actualPoints, daysInMonth, maxValue);
  const forecastPath = buildLinePath(forecastPoints, daysInMonth, maxValue);
  const forecastEnd = forecastPoints[forecastPoints.length - 1];
  const asOfX =
    daysInMonth <= 1
      ? forecastChart.left
      : forecastChart.left + ((asOfDay - 1) / (daysInMonth - 1)) * (forecastChart.right - forecastChart.left);
  const actualEndY =
    forecastChart.bottom - (Math.max(actualTotal, 0) / maxValue) * (forecastChart.bottom - forecastChart.top);
  const actualLabelText = formatAxisMoney(actualTotal);
  const actualLabelWidth = actualLabelText.length * 6;
  const actualCalloutLength = 98;
  const actualLabelX = Math.max(asOfX - actualCalloutLength, forecastChart.left + actualLabelWidth + 8);
  const actualCalloutEndX = Math.min(actualLabelX + 8, asOfX - 8);
  const actualLabelAnchor = "end";
  const endX =
    daysInMonth <= 1
      ? forecastChart.left
      : forecastChart.left + ((forecastEnd.day - 1) / (daysInMonth - 1)) * (forecastChart.right - forecastChart.left);
  const endY =
    forecastChart.bottom - (Math.max(forecastEnd.value, 0) / maxValue) * (forecastChart.bottom - forecastChart.top);
  const forecastEndLabelX = Math.min(Math.max(endX, forecastChart.left + 42), forecastChart.right - 4);
  const forecastEndLabelAnchor = endX > forecastChart.right - 42 ? "end" : "middle";
  const forecastLabel = "AI dự đoán";
  const gridRatios = [0.2, 0.4, 0.6, 0.8];
  const xAxisDays = Array.from(new Set([1, 7, 14, 21, 28, daysInMonth])).filter((day) => day <= daysInMonth);

  if (!hasActualData && !hasForecastData) {
    return (
      <View style={styles.chartEmptyState}>
        <Text style={styles.chartEmptyText}>Chưa có dữ liệu chi tiêu hoặc dự đoán AI</Text>
      </View>
    );
  }

  return (
    <View style={styles.forecastChartBlock}>
      <View style={styles.forecastSummaryRow}>
        <View>
          <Text style={styles.reportLabel}>
            Đã chi đến hiện tại:{" "}
            <Text style={styles.negativeText}>
              {asOfDay}/{daysInMonth}
            </Text>
          </Text>
          <Text style={[styles.forecastSummaryValue, styles.negativeText]}>{formatPlainMoney(actualTotal)}</Text>
        </View>
        <View style={styles.forecastSummaryRight}>
          <Text style={styles.reportLabel}>Tổng dự kiến sau {forecastPoints.length - 1} ngày</Text>
          <Text style={styles.forecastSummaryValue}>{formatPlainMoney(forecastEnd.value)}</Text>
        </View>
      </View>
      <View style={styles.forecastDivider}>
        <View style={[styles.forecastDividerSegment, styles.forecastDividerActual]} />
        <View style={[styles.forecastDividerSegment, styles.forecastDividerPrediction]} />
      </View>
      <View style={styles.forecastChartCanvas}>
        <Svg
          height={forecastChart.svgHeight}
          width="100%"
          viewBox={`0 0 ${forecastChart.width} ${forecastChart.svgHeight}`}
        >
          <Defs>
            <LinearGradient id="pastAreaFade" x1="1" x2="0" y1="0" y2="0">
              <Stop offset="0" stopColor={theme.textMuted} stopOpacity={0.16} />
              <Stop offset="1" stopColor={theme.textMuted} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Rect
            fill="url(#pastAreaFade)"
            height={forecastChart.bottom - forecastChart.top}
            width={Math.max(asOfX - forecastChart.left, 0)}
            x={forecastChart.left}
            y={forecastChart.top}
          />
          {gridRatios.map((ratio) => {
            const y = forecastChart.bottom - ratio * (forecastChart.bottom - forecastChart.top);
            const tickValue = maxValue * ratio;

            return (
              <Fragment key={ratio}>
                <Line
                  stroke={theme.borderStrong}
                  strokeDasharray="3 4"
                  strokeWidth={1}
                  x1={forecastChart.left}
                  x2={forecastChart.right}
                  y1={y}
                  y2={y}
                />
                <SvgText
                  fill={theme.textSubtle}
                  fontSize={9}
                  fontFamily={chartFont.fontFamily}
                  fontWeight={chartFont.fontWeight === 'normal' ? 'normal' : '500'}
                  textAnchor="end"
                  x={forecastChart.width - 4}
                  y={y + 3}
                >
                  {formatAxisMoney(tickValue)}
                </SvgText>
              </Fragment>
            );
          })}
          <Line
            stroke={theme.borderStrong}
            strokeWidth={1}
            x1={forecastChart.left}
            x2={forecastChart.right}
            y1={forecastChart.bottom}
            y2={forecastChart.bottom}
          />
          <Line
            stroke={theme.textMuted}
            strokeDasharray="4 4"
            strokeOpacity={0.72}
            strokeWidth={1}
            x1={asOfX}
            x2={asOfX}
            y1={forecastChart.top}
            y2={forecastChart.bottom}
          />
          {hasForecastData ? (
            <Line
              stroke={theme.primary}
              strokeDasharray="5 5"
              strokeOpacity={0.48}
              strokeWidth={1}
              x1={endX}
              x2={endX}
              y1={forecastChart.top}
              y2={forecastChart.bottom}
            />
          ) : null}
          {actualPath ? (
            <Path
              d={actualPath}
              fill="none"
              stroke={theme.dangerText}
              strokeLinecap="round"
              strokeOpacity={0.82}
              strokeWidth={3}
            />
          ) : null}
          {hasActualData ? (
            <Line
              stroke={theme.dangerText}
              strokeOpacity={0.46}
              strokeWidth={1}
              x1={asOfX}
              x2={actualCalloutEndX}
              y1={actualEndY}
              y2={actualEndY}
            />
          ) : null}
          {hasActualData ? (
            <SvgText
              fill={theme.dangerText}
              fontSize={9}
              fontFamily={chartFont.fontFamily}
                  fontWeight={chartFont.fontWeight === 'normal' ? 'normal' : '500'}
              textAnchor={actualLabelAnchor}
              x={actualLabelX}
              y={actualEndY + 3}
            >
              {actualLabelText}
            </SvgText>
          ) : null}
          {forecastPath ? (
            <Path
              d={forecastPath}
              fill="none"
              stroke={theme.primary}
              strokeDasharray="6 5"
              strokeLinecap="round"
              strokeWidth={2.5}
            />
          ) : null}
          {hasForecastData ? (
            <Circle cx={endX} cy={endY} fill={theme.sheet} r={4} stroke={theme.primary} strokeWidth={2} />
          ) : null}
          {hasForecastData ? (
            <SvgText
              fill={theme.primary}
              fontSize={9}
              fontFamily={chartFont.fontFamily}
                  fontWeight={chartFont.fontWeight === 'normal' ? 'normal' : '500'}
              textAnchor={forecastEndLabelAnchor}
              x={forecastEndLabelX}
              y={Math.max(endY - 8, forecastChart.top + 10)}
            >
              {formatAxisMoney(forecastEnd.value)}
            </SvgText>
          ) : null}
          <Circle
            cx={asOfX}
            cy={forecastChart.bottom}
            fill={theme.sheet}
            r={3}
            stroke={theme.textMuted}
            strokeWidth={1.5}
          />
          {xAxisDays.map((day) => {
            const x =
              daysInMonth <= 1
                ? forecastChart.left
                : forecastChart.left + ((day - 1) / (daysInMonth - 1)) * (forecastChart.right - forecastChart.left);
            const label =
              day === 1 || day === daysInMonth
                ? (() => {
                    const date = new Date(chartBaseYear, chartBaseMonth, day);

                    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
                  })()
                : String(new Date(chartBaseYear, chartBaseMonth, day).getDate()).padStart(2, "0");

            return (
              <SvgText
                key={day}
                fill={theme.textSubtle}
                fontSize={9}
                fontFamily={chartFont.fontFamily}
                  fontWeight={chartFont.fontWeight === 'normal' ? 'normal' : '500'}
                textAnchor="middle"
                x={x}
                y={forecastChart.bottom + 18}
              >
                {label}
              </SvgText>
            );
          })}
          <SvgText
            fill={theme.textMuted}
            fontSize={9}
            fontFamily={chartFont.fontFamily}
                  fontWeight={chartFont.fontWeight === 'normal' ? 'normal' : '500'}
            textAnchor="middle"
            x={asOfX}
            y={forecastChart.top - 7}
          >
            Hiện tại
          </SvgText>
        </Svg>
      </View>
      <View style={styles.forecastLegendRow}>
        <View style={styles.forecastLegendItem}>
          <View style={[styles.forecastLegendDot, { backgroundColor: theme.dangerText }]} />
          <Text style={styles.forecastLegendText}>Thực tế</Text>
        </View>
        <View style={styles.forecastLegendItem}>
          <View style={[styles.forecastLegendDot, { backgroundColor: theme.primary }]} />
          <Text style={styles.forecastLegendText}>{forecastLabel}</Text>
        </View>
      </View>
      {forecastStatus && forecastStatus !== "ok" ? (
        <Text style={styles.forecastNote}>Dự đoán đang ở trạng thái {forecastStatus}.</Text>
      ) : null}
    </View>
  );
}

// Tài khoản trong Tổng số dư
function HeroAccountRow({ account, currency }: { account: FinancialAccount; currency: string }) {
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
        {formatMoney(getAccountCurrentBalance(account), account.currency || currency)}
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
  const title = category?.name ?? getCategoryFallback(transaction.type);

  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionIcon, positive ? styles.incomeIcon : styles.expenseIcon]}>
        <CategoryIcon icon={category?.icon} name={category?.name || transaction.categoryName} type={transaction.type} />
      </View>
      <View style={styles.transactionMain}>
        <Text numberOfLines={1} style={styles.transactionTitle}>
          {transaction.description || title}
        </Text>
        <Text numberOfLines={1} style={styles.transactionMeta}>
          {formatTransactionTime(transaction.transactionDate)} · {account?.name ?? "Không rõ ví"}
        </Text>
      </View>
      <Text style={[styles.transactionAmount, positive ? styles.positiveText : styles.negativeText]}>
        {positive ? "+" : "-"}
        {formatMoney(Math.abs(transaction.amount), account?.currency ?? currency)}
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
    bottomSurfaceGuard: {
      backgroundColor: theme.screen,
      bottom: 0,
      height: 260,
      left: 0,
      position: "absolute",
      right: 0,
    },
    content: { paddingHorizontal: 16 },
    contentSurface: {
      backgroundColor: theme.screen,
      marginHorizontal: -16,
      paddingBottom: 112,
      paddingHorizontal: 16,
    },
    overviewBackground: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    overviewStaticContent: {
      paddingHorizontal: 32,
    },
    overviewPanelImage: {
      opacity: 1,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 14,
      paddingTop: 12,
    },
    headerCopy: { flex: 1, paddingRight: 12 },
    aiChatPlaceholder: { height: 40, width: 40 },
    aiChatOverlay: { position: "absolute", right: 32 },
    userName: { color: theme.textInverse, fontSize: 24, fontWeight: '600' },
    aiChatButton: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.22)",
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    heroLabel: { color: theme.textInverse, fontSize: 14, fontWeight: '600', opacity: 0.82 },
    heroBalance: { color: theme.textInverse, fontSize: 34, fontWeight: '600', letterSpacing: 0, marginTop: 6 },
    heroStats: { flexDirection: "row", gap: 10, marginBottom: 14, marginTop: -32 },
    metricPill: {
      borderRadius: 8,
      elevation: 3,
      flex: 1,
      minHeight: 64,
      padding: 12,
      shadowColor: "#000",
      shadowOffset: { height: 5, width: 0 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    metricPillCompact: { flex: 0.46 },
    metricGood: { backgroundColor: theme.goodBackground },
    metricNeutral: { backgroundColor: theme.cardAlt },
    metricWarn: { backgroundColor: theme.warningBackground },
    metricLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },
    metricValue: { color: theme.text, fontSize: 13, fontWeight: '600', marginTop: 6 },
    errorCard: {
      backgroundColor: theme.warningBackground,
      borderColor: theme.warning,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 14,
      padding: 14,
    },
    errorTitle: { color: theme.warning, fontSize: 14, fontWeight: '600' },
    errorText: { color: theme.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
    loadingCard: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderRadius: 8,
      gap: 10,
      marginTop: 16,
      padding: 28,
    },
    loadingText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    aiCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 12,
      padding: 14,
    },
    aiHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    aiHeaderActions: { alignItems: "center", flexDirection: "row", gap: 8 },
    aiEyebrow: { color: theme.text, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    aiAnalyzeButton: {
      alignItems: "center",
      backgroundColor: theme.primaryPressed,
      borderRadius: 14,
      flexDirection: "row",
      gap: 5,
      minHeight: 28,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    aiAnalyzeButtonDisabled: { opacity: 0.68 },
    aiAnalyzeText: { color: theme.primary, fontSize: 11, fontWeight: '600' },
    aiBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
    aiBadgeHealthy: { backgroundColor: theme.goodBackground },
    aiBadgeWarning: { backgroundColor: theme.warningBackground },
    aiBadgeCritical: { backgroundColor: `${theme.danger}22` },
    aiBadgeText: { color: theme.text, fontSize: 11, fontWeight: '600' },
    aiStatsRow: { flexDirection: "row", gap: 16, marginTop: 12 },
    aiLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },
    aiRate: { color: theme.primary, fontSize: 24, fontWeight: '600', marginTop: 3 },
    aiSkeletonTitle: { backgroundColor: theme.cardAlt, borderRadius: 4, height: 12, width: "32%" },
    aiSkeletonLine: { backgroundColor: theme.cardAlt, borderRadius: 4, height: 24, marginTop: 12, width: "22%" },
    aiSkeletonLineShort: { backgroundColor: theme.cardAlt, borderRadius: 4, height: 10, marginTop: 8, width: "68%" },
    sectionHeading: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
      marginTop: 22,
    },
    sectionTitle: { ...Typography.section, color: theme.text },
    sectionAction: { color: theme.primary, fontSize: 13, fontWeight: '600' },
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
      fontWeight: '600',
    },
    heroAccountsAction: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    heroAccountsGrid: {
      gap: 8,
    },
    heroAccountRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.card,
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
      fontWeight: '600',
    },
    heroAccountName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
      flex: 1,
      marginRight: 8,
    },
    heroAccountBalance: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    reportCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingBottom: 14,
      paddingTop: 10,
    },
    reportLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
    chartEmptyState: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 8,
      minHeight: 130,
      justifyContent: "center",
      marginTop: 16,
      padding: 18,
    },
    chartEmptyText: { color: theme.textSubtle, fontSize: 12, fontWeight: '600' },
    forecastChartBlock: { marginTop: 0 },
    forecastChartCanvas: { marginTop: 8 },
    forecastDivider: { flexDirection: "row", gap: 6, marginTop: 10 },
    forecastDividerActual: { backgroundColor: theme.dangerText, opacity: 0.34 },
    forecastDividerPrediction: { backgroundColor: theme.primary, opacity: 0.28 },
    forecastDividerSegment: { borderRadius: 2, flex: 1, height: 2 },
    forecastLegendDot: { borderRadius: 4, height: 8, width: 8 },
    forecastLegendItem: { alignItems: "center", flexDirection: "row", gap: 6 },
    forecastLegendRow: { flexDirection: "row", gap: 14, marginTop: 8 },
    forecastLegendText: { color: theme.textSubtle, fontSize: 11, fontWeight: '600' },
    forecastNote: { color: theme.textSubtle, fontSize: 11, fontWeight: '600', lineHeight: 16, marginTop: 8 },
    forecastSummaryRight: { alignItems: "flex-end", flex: 1 },
    forecastSummaryRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", gap: 12 },
    forecastSummaryValue: { color: theme.text, fontSize: 16, fontWeight: '600', marginTop: 4 },
    reportSummaryRow: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: "row",
      marginTop: 16,
      paddingTop: 14,
    },
    reportSummaryItem: { flex: 1 },
    reportSummaryLabel: { color: theme.textSubtle, fontSize: 11, fontWeight: '600' },
    reportSummaryValue: { fontSize: 15, fontWeight: '600', marginTop: 5 },
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
    categoryIconText: { fontSize: 17, fontWeight: '600' },
    categoryMain: { flex: 1 },
    categoryName: { color: theme.text, fontSize: 14, fontWeight: '600' },
    categoryMeta: { color: theme.textSubtle, fontSize: 11, fontWeight: '600', marginTop: 3 },
    categoryAmount: { color: theme.text, fontSize: 13, fontWeight: '600', marginLeft: 10 },
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
    transactionMain: { flex: 1 },
    transactionTitle: { ...Typography.label, color: theme.text },
    transactionMeta: { ...Typography.caption, color: theme.textSubtle, marginTop: 4 },
    transactionAmount: { ...Typography.label, marginLeft: 10, fontWeight: '600' },
    positiveText: { color: theme.goodText },
    negativeText: { color: theme.dangerText },
    emptyState: { alignItems: "center", flex: 1, padding: 22 },
    emptyTitle: { color: theme.text, fontSize: 15, fontWeight: '600', textAlign: "center" },
    emptyText: { color: theme.textSubtle, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" },
  });
}
