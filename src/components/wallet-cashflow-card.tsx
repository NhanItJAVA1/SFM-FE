import { ArrowDownLeft, ArrowRight, ArrowUpRight, ChartNoAxesCombined, Check, ChevronDown, ChevronRight, Wallet, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FinancialAccount } from '@/api/financialAccountApi';
import { AppText as Text } from '@/components/app-text';
import { BottomPopup, BottomPopupSheet } from '@/components/bottom-popup';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useWalletCashflow } from '@/hooks/use-wallet-cashflow';
import { Typography } from '@/theme/typography';
import { formatCashflowAmount, summarizeWalletCashflow } from '@/utils/walletCashflow';

export function WalletCashflowCard({ accounts, accountId, month, refreshKey, onSelectAccount, onOpenOverview }: {
  accounts: FinancialAccount[];
  accountId: number | null;
  month: string;
  refreshKey: number;
  onSelectAccount: (id: number | null) => void;
  onOpenOverview: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { rows, loading, error, reload } = useWalletCashflow(month, accountId, refreshKey);
  const summary = useMemo(() => rows === null ? null : summarizeWalletCashflow(rows, accounts, accountId, month), [rows, accounts, accountId, month]);
  const account = accounts.find((item) => item.id === accountId);
  const accountName = accountId === null ? 'Tất cả ví' : account?.name ?? 'Chọn ví';
  const [year, monthNumber] = month.split('-').map(Number);

  function selectAccount(id: number | null) {
    onSelectAccount(id);
    setPickerOpen(false);
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Chọn ví, đang xem ${accountName}`} onPress={() => { Keyboard.dismiss(); setPickerOpen(true); }} style={styles.walletSelector}>
          <Wallet size={18} color={theme.primary} />
          <Text numberOfLines={1} style={[styles.walletName, { color: theme.text }]}>{accountName}</Text>
          {loading ? <ActivityIndicator accessibilityLabel="Đang tải tổng thu chi" size="small" color={theme.primary} /> : null}
          <ChevronDown size={15} color={theme.textMuted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Xem tổng quan tháng ${monthNumber} năm ${year}`} onPress={onOpenOverview} style={[styles.overviewButton, { backgroundColor: theme.cardAlt }]}>
          <ChartNoAxesCombined size={14} color={theme.primary} />
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.overviewLabel, { color: theme.textSoft }]}>Tổng quan {monthNumber}/{year}</Text>
          <ChevronRight size={12} color={theme.textMuted} />
        </Pressable>
      </View>
      <View style={styles.metrics}>
        {(['income', 'expense'] as const).map((kind) => {
          const positive = kind === 'income';
          const color = positive ? theme.goodText : theme.dangerText;
          const Icon = positive ? ArrowDownLeft : ArrowUpRight;
          return (
            <View key={kind} style={[styles.metric, { borderColor: theme.border }]}>
              <View style={styles.metricHeading}><Icon size={15} color={color} /><Text style={[styles.metricLabel, { color: theme.textMuted }]}>{positive ? 'Tổng thu' : 'Tổng chi'}</Text></View>
              {summary ? summary.groups.map((group) => (
                <View key={group.key} style={styles.group}>
                  <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={[styles.value, { color }]}>{formatCashflowAmount(group[kind], group.currency)}</Text>
                  {!group.currency ? <Text style={[styles.currencyNote, { color: theme.textMuted }]}>{group.accountName ? `${group.accountName} · ` : ''}Chưa rõ tiền tệ</Text> : null}
                </View>
              )) : <Text style={[styles.value, { color: theme.textMuted }]}>—</Text>}
            </View>
          );
        })}
      </View>
      {error ? <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.error}><Text style={[styles.note, { color: theme.dangerText }]}>{error} Chạm để thử lại.</Text></Pressable> : null}
      {summary?.hasTransfers ? <Text style={[styles.note, { color: theme.textMuted }]}>Không tính chuyển tiền giữa các ví.</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Mở ngân sách" onPress={() => router.navigate('/(tabs)/budgets')} style={[styles.budgetPrompt, { backgroundColor: theme.primaryPressed }]}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.budgetText, { color: theme.textSoft }]}>Bạn muốn tiết kiệm tiền hơn?</Text>
        <ArrowRight size={18} color={theme.primary} />
      </Pressable>

      <BottomPopup visible={pickerOpen} onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng chọn ví" onPress={() => setPickerOpen(false)} style={StyleSheet.absoluteFill} />
          <BottomPopupSheet style={[styles.sheet, { backgroundColor: theme.sheet, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: theme.text }]}>Chọn ví</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setPickerOpen(false)} style={styles.close}><X size={20} color={theme.textMuted} /></Pressable></View>
            <ScrollView contentContainerStyle={styles.options}>
              {[{ id: null, name: 'Tất cả ví', currency: '' }, ...accounts].map((item) => (
                <Pressable key={item.id ?? 'all'} accessibilityRole="radio" accessibilityState={{ checked: accountId === item.id }} onPress={() => selectAccount(item.id)} style={[styles.option, accountId === item.id && { backgroundColor: theme.primaryPressed }]}>
                  <Wallet size={20} color={theme.primary} />
                  <View style={styles.optionCopy}><Text numberOfLines={2} style={[styles.optionName, { color: theme.text }]}>{item.name}</Text>{item.currency ? <Text style={[styles.note, { color: theme.textMuted }]}>{item.currency}</Text> : null}</View>
                  {accountId === item.id ? <Check size={20} color={theme.primary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </BottomPopupSheet>
        </View>
      </BottomPopup>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, borderRadius: 8, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletSelector: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  walletName: { ...Typography.label, flexShrink: 1 },
  overviewButton: { maxWidth: '55%', minHeight: 32, borderRadius: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  overviewLabel: { ...Typography.caption, fontSize: 11, flexShrink: 1 },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 6 },
  metric: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 8, padding: 10, gap: 6 },
  metricHeading: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricLabel: Typography.caption,
  group: { gap: 2 },
  value: { ...Typography.bodyLarge, fontWeight: '600' },
  currencyNote: { ...Typography.caption, fontSize: 10 },
  note: { ...Typography.caption, fontSize: 11 },
  error: { paddingVertical: 8 },
  budgetPrompt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8, borderRadius: 8 },
  budgetText: { ...Typography.caption, flex: 1, minWidth: 0 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 8 },
  sheetTitle: { ...Typography.section, flex: 1 },
  close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  options: { padding: 12, gap: 4 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, padding: 12, gap: 12, borderRadius: 8 },
  optionCopy: { flex: 1 },
  optionName: Typography.label,
});
