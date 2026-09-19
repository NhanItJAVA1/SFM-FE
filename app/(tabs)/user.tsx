import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { authApi } from '@/api/authApi';
import { CategorySpendingItem, CategorySpendingResponse, transactionsApi } from '@/api/transactionsApi';
import { SpendingDonutChart, SpendingDonutSegment } from '@/components/spending-donut-chart';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemeMode } from '@/hooks/use-theme-mode';
import { getAuthRefreshToken, getAuthUser } from '@/stores/authSession';
import { clearAuthSession } from '@/stores/persistedAuthSession';
import { getNextThemeMode, setThemeMode } from '@/stores/themePreference';
import type { AppTheme } from '@/theme/appTheme';

type UserView = 'menu' | 'manage' | 'spendingStats';

const chartColors = ['#8e7cf4', '#ffb14a', '#31c48d', '#f06292', '#60a5fa', '#facc15', '#9ca3af'];

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('vi-VN', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function getPreviousMonth(month: number, year: number) {
  if (month === 1) {
    return { month: 12, year: year - 1 };
  }

  return { month: month - 1, year };
}

function formatChange(value: number | null) {
  if (value === null) {
    return 'Mới';
  }

  const prefix = value > 0 ? '↑' : value < 0 ? '↓' : '';

  return `${prefix} ${Math.abs(value).toFixed(1)}%`.trim();
}

function getCategoryKey(category: CategorySpendingItem) {
  return category.categoryId === null ? `uncategorized-${category.categoryName}` : String(category.categoryId);
}

function getPeriodLabel(month: number, year: number, currentMonth: number, currentYear: number) {
  if (month === currentMonth && year === currentYear) {
    return 'Tháng này';
  }

  return `Tháng ${month}/${year}`;
}

function getNextMonth(month: number, year: number) {
  if (month === 12) {
    return { month: 1, year: year + 1 };
  }

  return { month: month + 1, year };
}

function formatSignedMoney(current: number, compare: number) {
  const difference = current - compare;
  const sign = difference > 0 ? '+' : difference < 0 ? '-' : '';

  return `${sign}${formatMoney(Math.abs(difference), 'VND')}`;
}

export default function UserScreen() {
  const user = getAuthUser();
  const theme = useAppTheme();
  const themeMode = useThemeMode();
  const isDarkMode = themeMode === 'dark';
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initial = (user?.displayName ?? user?.username ?? 'U').trim().charAt(0).toUpperCase() || 'U';
  const [view, setView] = useState<UserView>('menu');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const today = new Date();
  const defaultMonth = today.getMonth() + 1;
  const defaultYear = today.getFullYear();
  const [statsMonth, setStatsMonth] = useState(defaultMonth);
  const [statsYear, setStatsYear] = useState(defaultYear);
  const [spendingStats, setSpendingStats] = useState<CategorySpendingResponse | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);

  const isCurrentStatsPeriod = statsMonth === defaultMonth && statsYear === defaultYear;
  const canGoNextStatsPeriod = !isCurrentStatsPeriod;
  const statsPeriodLabel = getPeriodLabel(statsMonth, statsYear, defaultMonth, defaultYear);
  const chartData = useMemo<SpendingDonutSegment[]>(() => {
    if (!spendingStats) {
      return [];
    }

    return spendingStats.categories
      .filter((category) => category.amount > 0)
      .map((category, index) => ({
        amount: category.amount,
        color: chartColors[index % chartColors.length],
        key: getCategoryKey(category),
        label: category.categoryName,
        percentage: category.percentage,
      }));
  }, [spendingStats]);

  const loadSpendingStats = useCallback(async () => {
    try {
      setIsLoadingStats(true);
      const response = await transactionsApi.categorySpending(
        statsMonth === defaultMonth && statsYear === defaultYear ? {} : { month: statsMonth, year: statsYear }
      );
      setSpendingStats(response.data);
      setSelectedCategoryKey(null);
    } catch (error) {
      Alert.alert('Không tải được thống kê', error instanceof Error ? error.message : 'Vui lòng thử lại sau.');
    } finally {
      setIsLoadingStats(false);
    }
  }, [defaultMonth, defaultYear, statsMonth, statsYear]);

  useEffect(() => {
    if (view === 'spendingStats') {
      const timeoutId = setTimeout(() => {
        loadSpendingStats();
      }, 0);

      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [loadSpendingStats, view]);

  function goPreviousStatsPeriod() {
    const previous = getPreviousMonth(statsMonth, statsYear);
    setStatsMonth(previous.month);
    setStatsYear(previous.year);
  }

  function goNextStatsPeriod() {
    if (!canGoNextStatsPeriod) {
      return;
    }

    const next = getNextMonth(statsMonth, statsYear);
    setStatsMonth(next.month);
    setStatsYear(next.year);
  }

  function handleSelectCategory(key: string) {
    setSelectedCategoryKey(key);
  }

  async function handleLogout() {
    try {
      setIsLoggingOut(true);
      const refreshToken = getAuthRefreshToken();

      await authApi.logout(refreshToken ? { refreshToken } : undefined);
    } catch {
      // Local logout should still proceed if the server cannot clear the refresh token.
    } finally {
      await clearAuthSession();
      setIsLoggingOut(false);
      router.replace('/auth/login');
    }
  }

  async function handleToggleThemeMode() {
    await setThemeMode(getNextThemeMode(themeMode));
  }

  if (view === 'manage') {
    return (
      <View style={styles.screen}>
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView('menu')} hitSlop={12}>
            <Text style={styles.backText}>‹ Người dùng</Text>
          </Pressable>
          <Text style={styles.topTitle}>Quản lý người dùng</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.manageContent}>
          <View style={styles.profileMiniCard}>
            <View style={styles.smallAvatar}>
              <Text style={styles.smallAvatarText}>{initial}</Text>
            </View>
            <View style={styles.manageTextGroup}>
              <Text style={styles.manageTitle}>{user?.username ?? 'Người dùng'}</Text>
              <Text style={styles.manageSubtitle}>{user?.email ?? 'Chưa có email'}</Text>
            </View>
          </View>

          <Pressable
            style={[styles.logoutButton, isLoggingOut && styles.buttonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? <ActivityIndicator color={theme.textInverse} /> : <Text style={styles.logoutButtonText}>Đăng xuất</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  if (view === 'spendingStats') {
    return (
      <View style={styles.screen}>
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView('menu')} hitSlop={12}>
            <Text style={styles.backText}>‹ Người dùng</Text>
          </Pressable>
          <Text style={styles.topTitle}>Thống kê chi tiêu</Text>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.statsContent}>
          <View style={styles.statsPanel}>
            <View style={styles.monthSwitcher}>
              <Pressable style={styles.monthButton} onPress={goPreviousStatsPeriod} hitSlop={10}>
                <Text style={styles.monthButtonText}>‹</Text>
              </Pressable>
              <View style={styles.monthTitleWrap}>
                <Text style={styles.monthTitle}>{statsPeriodLabel}</Text>
                <Text style={styles.monthSubtitle}>
                  {spendingStats
                    ? `${spendingStats.currentPeriod.start} → ${spendingStats.currentPeriod.end}`
                    : `Tháng ${statsMonth}/${statsYear}`}
                </Text>
              </View>
              <Pressable
                style={[styles.monthButton, !canGoNextStatsPeriod && styles.monthButtonDisabled]}
                onPress={goNextStatsPeriod}
                disabled={!canGoNextStatsPeriod}
                hitSlop={10}
              >
                <Text style={styles.monthButtonText}>›</Text>
              </Pressable>
            </View>

            {isLoadingStats ? (
              <View style={styles.statsLoading}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : spendingStats ? (
              <>
                <View style={styles.statsSummaryRow}>
                  <View style={[styles.statsSummaryCard, styles.statsSummaryCardActive]}>
                    <Text style={styles.statsSummaryLabel}>Chi tiêu</Text>
                    <Text style={styles.statsSummaryValue}>{formatMoney(spendingStats.totalAmount, 'VND')}</Text>
                  </View>
                  <View style={styles.statsSummaryCard}>
                    <Text style={styles.statsSummaryLabel}>Kỳ trước</Text>
                    <Text style={styles.statsSummaryValue}>{formatMoney(spendingStats.compareTotalAmount, 'VND')}</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.statsTrendCard,
                    (spendingStats.totalChangePercentage ?? 0) <= 0
                      ? styles.statsTrendCardGood
                      : styles.statsTrendCardWarn,
                  ]}
                >
                  <Text
                    style={[
                      styles.statsTrendText,
                      (spendingStats.totalChangePercentage ?? 0) <= 0
                        ? styles.statsTrendTextGood
                        : styles.statsTrendTextWarn,
                    ]}
                  >
                    {spendingStats.totalChangePercentage === null
                      ? 'Mới có chi tiêu trong kỳ này'
                      : `${spendingStats.totalChangePercentage <= 0 ? 'Giảm' : 'Tăng'} ${formatSignedMoney(
                          spendingStats.totalAmount,
                          spendingStats.compareTotalAmount
                        )} so với kỳ trước`}
                  </Text>
                </View>

                {chartData.length === 0 ? (
                  <Text style={styles.statsEmptyText}>Không có chi tiêu trong kỳ này.</Text>
                ) : (
                  <View style={styles.chartSection}>
                    <SpendingDonutChart data={chartData} selectedKey={selectedCategoryKey} onSelect={handleSelectCategory} />
                  </View>
                )}

                <Text style={styles.detailTitle}>Chi tiết từng danh mục ({spendingStats.categories.length})</Text>
                {spendingStats.categories.map((category) => {
                  const categoryKey = getCategoryKey(category);
                  const isSelected = selectedCategoryKey === categoryKey;
                  const chartColor = chartData.find((item) => item.key === categoryKey)?.color ?? '#9ca3af';

                  return (
                    <Pressable
                      key={categoryKey}
                      onPress={() => handleSelectCategory(categoryKey)}
                      style={[styles.statCard, isSelected && styles.statCardSelected]}
                    >
                      <View style={styles.statCategoryHeader}>
                        <View style={[styles.statIcon, { backgroundColor: `${chartColor}24` }]}>
                          <Text style={[styles.statIconText, { color: chartColor }]}>
                            {category.icon?.charAt(0).toUpperCase() ?? '?'}
                          </Text>
                        </View>
                        <View style={styles.walletInfo}>
                          <Text style={styles.statCategoryName}>{category.categoryName}</Text>
                          <Text style={styles.statCategoryMeta}>
                            {category.transactionCount} giao dịch · {category.percentage.toFixed(1)}%
                          </Text>
                        </View>
                        <Text style={styles.statCategoryAmount}>{formatMoney(category.amount, 'VND')}</Text>
                      </View>
                      <Text style={styles.statCompareText}>
                        Kỳ trước: {formatMoney(category.compareAmount, 'VND')} · {formatChange(category.changePercentage)}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            ) : (
              <Text style={styles.statsEmptyText}>Chưa tải được thống kê.</Text>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerSide}>
          <Text style={styles.supportText}>Hỗ trợ</Text>
        </View>
        <Text style={styles.pageTitle}>Cá nhân</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.themeButton} onPress={handleToggleThemeMode} hitSlop={10}>
            <SymbolView
              name={{
                ios: isDarkMode ? 'sun.max.fill' : 'moon.fill',
                android: isDarkMode ? 'light_mode' : 'dark_mode',
                web: isDarkMode ? 'light_mode' : 'dark_mode',
              }}
              size={21}
              tintColor={theme.text}
              fallback={<Text style={styles.themeFallbackIcon}>{isDarkMode ? '☀' : '☾'}</Text>}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.username}>{user?.username ?? 'Người dùng'}</Text>
        <Text style={styles.email}>{user?.email ?? 'Chưa có email'}</Text>

        <View style={styles.divider} />

        <Pressable style={styles.manageRow} onPress={() => setView('manage')}>
          <Text style={styles.manageIcon}>♙</Text>
          <View style={styles.manageTextGroup}>
            <Text style={styles.manageTitle}>Quản lý người dùng</Text>
            <Text style={styles.manageSubtitle}>Hồ sơ cá nhân</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.menuCard}>
        <Pressable style={styles.menuRow} onPress={() => router.push('/account')}>
          <Text style={styles.menuIcon}>▰</Text>
          <Text style={styles.menuText}>Ví của tôi</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.menuDivider} />
        <Pressable style={styles.menuRow} onPress={() => setView('spendingStats')}>
          <Text style={styles.menuIcon}>◷</Text>
          <Text style={styles.menuText}>Thống kê chi tiêu</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screen },
  content: { padding: 24, paddingBottom: 96 },
  headerRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 32, marginTop: 36 },
  headerSide: { flex: 1 },
  pageTitle: { color: theme.text, flex: 1, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  headerActions: { alignItems: 'center', flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  supportText: { color: theme.text, fontSize: 16 },
  themeButton: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  themeFallbackIcon: { color: theme.text, fontSize: 18, fontWeight: '800' },
  profileCard: { backgroundColor: theme.card, borderRadius: 8, overflow: 'hidden', paddingTop: 34 },
  avatar: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: theme.avatar,
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    marginBottom: 16,
    width: 88,
  },
  avatarText: { color: theme.textInverse, fontSize: 44, fontWeight: '500' },
  username: { color: theme.text, fontSize: 23, fontWeight: '600', textAlign: 'center' },
  email: { color: theme.textMuted, fontSize: 17, marginTop: 6, textAlign: 'center' },
  divider: { backgroundColor: theme.border, height: 1, marginTop: 34 },
  manageRow: { alignItems: 'center', flexDirection: 'row', minHeight: 78, paddingHorizontal: 22 },
  manageIcon: { color: theme.text, fontSize: 30, width: 46 },
  manageTextGroup: { flex: 1 },
  manageTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
  manageSubtitle: { color: theme.textMuted, fontSize: 16, marginTop: 3 },
  manageContent: { gap: 18, padding: 20 },
  profileMiniCard: { alignItems: 'center', backgroundColor: theme.card, borderRadius: 8, flexDirection: 'row', minHeight: 84, padding: 18 },
  smallAvatar: { alignItems: 'center', backgroundColor: theme.avatar, borderRadius: 24, height: 48, justifyContent: 'center', marginRight: 14, width: 48 },
  smallAvatarText: { color: theme.textInverse, fontSize: 24, fontWeight: '700' },
  logoutButton: { alignItems: 'center', backgroundColor: theme.danger, borderRadius: 8, justifyContent: 'center', minHeight: 52 },
  logoutButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: '700' },
  chevron: { color: theme.chevron, fontSize: 40, lineHeight: 42 },
  menuCard: { backgroundColor: theme.card, borderRadius: 8, marginTop: 34, overflow: 'hidden' },
  menuRow: { alignItems: 'center', flexDirection: 'row', minHeight: 76, paddingHorizontal: 22 },
  menuDivider: { backgroundColor: theme.border, height: 1, marginLeft: 68 },
  menuIcon: { color: theme.text, fontSize: 30, width: 46 },
  menuText: { color: theme.text, flex: 1, fontSize: 22, fontWeight: '500' },
  walletHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  backText: { color: theme.primary, fontSize: 17, fontWeight: '700' },
  topTitle: { color: theme.text, fontSize: 22, fontWeight: '700' },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 32,
  },
  topSpacer: { width: 82 },
  addWalletButton: {
    alignItems: 'center',
    backgroundColor: theme.primary,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  addWalletText: { color: theme.textInverse, fontSize: 30, fontWeight: '500', lineHeight: 33 },
  walletList: { gap: 14, padding: 20, paddingBottom: 96 },
  statsContent: { backgroundColor: theme.screen, padding: 14, paddingBottom: 96 },
  statsPanel: { backgroundColor: theme.screen, borderRadius: 8, gap: 12, padding: 4 },
  monthSwitcher: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  monthButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  monthButtonDisabled: { opacity: 0.28 },
  monthButtonText: { color: theme.chevron, fontSize: 34, fontWeight: '500', lineHeight: 34 },
  monthTitleWrap: { alignItems: 'center', flex: 1 },
  monthTitle: { color: theme.text, fontSize: 15, fontWeight: '800' },
  monthSubtitle: { color: theme.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  statsLoading: { alignItems: 'center', minHeight: 260, justifyContent: 'center' },
  statsSummaryRow: { flexDirection: 'row', gap: 8 },
  statsSummaryCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 72,
    padding: 10,
  },
  statsSummaryCardActive: { borderColor: theme.accent },
  statsSummaryLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  statsSummaryValue: { color: theme.text, fontSize: 18, fontWeight: '900' },
  statsTrendCard: { borderRadius: 8, minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  statsTrendCardGood: { backgroundColor: theme.goodBackground },
  statsTrendCardWarn: { backgroundColor: theme.warningBackground },
  statsTrendText: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  statsTrendTextGood: { color: theme.goodText },
  statsTrendTextWarn: { color: theme.warning },
  chartSection: {
    alignItems: 'center',
    elevation: 24,
    paddingVertical: 8,
    position: 'relative',
    zIndex: 24,
  },
  detailTitle: { color: theme.accent, fontSize: 13, fontWeight: '900', marginTop: 2, textAlign: 'center' },
  statsEmptyText: { color: theme.textMuted, fontSize: 15, lineHeight: 22, paddingVertical: 36, textAlign: 'center' },
  balanceSummary: { backgroundColor: theme.card, borderRadius: 8, padding: 18 },
  summaryLabel: { color: theme.textMuted, fontSize: 14, marginBottom: 4 },
  summaryValue: { color: theme.text, fontSize: 26, fontWeight: '700' },
  walletCard: { alignItems: 'center', backgroundColor: theme.card, borderRadius: 8, flexDirection: 'row', minHeight: 78, padding: 16 },
  statControlCard: { backgroundColor: theme.card, borderRadius: 8, gap: 14, padding: 16 },
  statControlTitle: { color: theme.textMuted, fontSize: 13, fontWeight: '800' },
  periodRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodValue: { color: theme.text, fontSize: 15, fontWeight: '800', minWidth: 64, textAlign: 'center' },
  stepButton: { alignItems: 'center', backgroundColor: theme.cardAlt, borderRadius: 8, height: 34, justifyContent: 'center', width: 34 },
  stepButtonText: { color: theme.text, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  statCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  statCardSelected: { borderColor: theme.accent, shadowColor: theme.accent, shadowOpacity: 0.2, shadowRadius: 10 },
  statCategoryHeader: { alignItems: 'center', flexDirection: 'row' },
  statIcon: { alignItems: 'center', backgroundColor: theme.cardAlt, borderRadius: 20, height: 40, justifyContent: 'center', marginRight: 14, width: 40 },
  statIconText: { color: theme.primary, fontSize: 18, fontWeight: '800' },
  statCategoryName: { color: theme.text, fontSize: 16, fontWeight: '900' },
  statCategoryMeta: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginTop: 3 },
  statCategoryAmount: { color: theme.text, fontSize: 15, fontWeight: '900' },
  statCompareText: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  walletIcon: { alignItems: 'center', backgroundColor: theme.cardAlt, borderRadius: 20, height: 40, justifyContent: 'center', marginRight: 14, width: 40 },
  walletIconText: { color: theme.text, fontSize: 20 },
  walletInfo: { flex: 1 },
  walletName: { color: theme.text, fontSize: 18, fontWeight: '700' },
  walletType: { color: theme.textMuted, fontSize: 14, marginTop: 3 },
  walletBalance: { color: theme.text, fontSize: 16, fontWeight: '700' },
  emptyText: { color: theme.textMuted, fontSize: 16, lineHeight: 23, marginTop: 18, textAlign: 'center' },
  form: { gap: 18, paddingTop: 28 },
  field: { gap: 8 },
  label: { color: theme.text, fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeOption: {
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 104,
    paddingHorizontal: 14,
  },
  typeOptionSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  typeOptionText: { color: theme.textSoft, fontWeight: '700' },
  typeOptionTextSelected: { color: theme.textInverse },
  row: { flexDirection: 'row', gap: 12 },
  currencyField: { flex: 0.8 },
  balanceField: { flex: 1.4 },
  primaryButton: { alignItems: 'center', backgroundColor: theme.primary, borderRadius: 8, justifyContent: 'center', minHeight: 50 },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: '700' },
  });
}
