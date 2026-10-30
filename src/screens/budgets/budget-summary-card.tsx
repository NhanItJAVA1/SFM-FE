import { Typography } from '@/theme/typography';
import { AppText as Text } from '@/components/app-text';
import { Eye, EyeOff, TrendingUp, Wallet } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '@/hooks/use-app-theme';
import { budgetPeriodData, calendarDate } from './budget-chart-data';
import { BudgetMonthlyChart } from './budget-monthly-chart';
import { formatMoney } from './helpers';
import type { BudgetSummary } from './types';

export function BudgetSummaryCard({ categoryName, categoryId, name, summary, startDate, endDate, onIncreaseBudget, reloadKey }: {
  categoryName: string; name: string; summary: BudgetSummary; startDate: string; endDate: string;
  onIncreaseBudget: () => void;
  categoryId: number | null;
  reloadKey: number;
}) {
  const theme = useAppTheme();
  const [hidden, setHidden] = useState(false);
  const [showIncreaseHint, setShowIncreaseHint] = useState(false);
  const data = useMemo(() => budgetPeriodData(startDate, endDate), [startDate, endDate]);
  const exceeded = summary.remainingAmount < 0;
  const status = exceeded ? 'Vượt ngân sách' : data.hasEnded ? 'Đã kết thúc' : !data.hasStarted ? 'Chưa bắt đầu' : summary.isAlert ? 'Gần hạn mức' : 'Ổn định';
  const statusColor = exceeded ? theme.budget.critical : summary.isAlert ? theme.budget.warning : theme.budget.positive;
  const periodStart = calendarDate(startDate);
  const periodEnd = calendarDate(endDate);
  const sameMonth = periodStart.getFullYear() === periodEnd.getFullYear() && periodStart.getMonth() === periodEnd.getMonth();
  const periodLabel = sameMonth ? `Tháng ${periodStart.getMonth() + 1}/${periodStart.getFullYear()} chi` : `${periodStart.toLocaleDateString('vi-VN')} - ${periodEnd.toLocaleDateString('vi-VN')}`;
  const money = (value: number) => hidden ? '••••••' : formatMoney(value);

  return (
    <View style={s.section}>
      <Text style={[s.name, { color: theme.text }]}>{name}</Text>
      <Text style={[s.muted, { color: theme.textMuted }]}>{categoryName} · {periodLabel}</Text>
      <View style={s.amountRow}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[s.total, { color: theme.text }]}>{money(summary.spentAmount)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Hiện số tiền' : 'Ẩn số tiền'} onPress={() => setHidden(!hidden)} hitSlop={12}>
          {hidden ? <EyeOff color={theme.textMuted} size={19} /> : <Eye color={theme.textMuted} size={19} />}
        </Pressable>
      </View>
      <View style={[s.limitBadge, { backgroundColor: theme.budget.badgeBackground }]}><Text style={[s.limitText, { color: theme.budget.badgeText }]}>Ngân sách: {money(summary.totalAmount)}</Text></View>

      <BudgetMonthlyChart categoryId={categoryId} endDate={endDate} limit={summary.totalAmount} hidden={hidden} reloadKey={reloadKey} />

      <View style={s.statusRow}>
        <Text style={[s.label, { color: theme.text }]}>Ngân sách</Text>
        <View style={[s.status, { backgroundColor: theme.cardAlt }]}><Text style={[s.statusText, { color: statusColor }]}>{status}</Text></View>
      </View>
      <View style={[s.remaining, { borderColor: theme.border }]}>
        <View style={s.ring}>
          <Svg width={48} height={48} style={StyleSheet.absoluteFill}>
            <Circle cx={24} cy={24} r={20} fill="none" stroke={theme.border} strokeWidth={4} />
            <Circle cx={24} cy={24} r={20} fill="none" stroke={statusColor} strokeWidth={4} strokeDasharray={`${Math.min(100, Math.max(0, summary.usedPercentage)) / 100 * 125.66} 125.66`} transform="rotate(-90 24 24)" strokeLinecap="round" />
          </Svg>
          <Wallet size={20} color={statusColor} />
        </View>
        <View style={s.remainingCopy}>
          <Text style={[s.remainingAmount, { color: statusColor }]}>{exceeded ? 'Đã vượt ' : 'Còn '}{money(Math.abs(summary.remainingAmount))}</Text>
          <Text style={[s.note, { color: theme.textMuted }]}>{exceeded ? 'Chi tiêu đã vượt hạn mức của kỳ này.' : data.hasEnded ? 'Kỳ ngân sách đã kết thúc.' : !data.hasStarted ? 'Ngân sách chưa đến ngày áp dụng.' : `Có thể chi ${money(summary.remainingAmount / Math.max(1, data.remainingDays))}/ngày trong ${data.remainingDays} ngày còn lại.`}</Text>
        </View>
        {exceeded ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Nâng ngân sách" accessibilityHint="Mở chỉnh sửa ngân sách" onHoverIn={() => setShowIncreaseHint(true)} onHoverOut={() => setShowIncreaseHint(false)} onPress={onIncreaseBudget} style={[s.increaseButton, { backgroundColor: theme.budget.actionBackground }]}>
            <TrendingUp size={22} color={theme.budget.actionText} />
            {showIncreaseHint ? <View pointerEvents="none" style={[s.increaseHint, { backgroundColor: theme.sheet, borderColor: theme.border }]}><Text style={{ color: theme.text, fontSize: 12 }}>Nâng ngân sách</Text></View> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 4, paddingVertical: 12, gap: 8 },
  increaseButton: { height: 44, width: 44, flexShrink: 0, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  increaseHint: { position: 'absolute', right: 0, bottom: 50, width: 116, padding: 8, borderWidth: 1, borderRadius: 4 },
  name: { fontSize: 18, fontWeight: '600' }, muted: { fontSize: 12, lineHeight: 18 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, total: { fontSize: 28, fontWeight: '600', flexShrink: 1 },
  limitBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3 }, limitText: { fontSize: 11, fontWeight: '600' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 }, label: { ...Typography.label }, status: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 }, statusText: { fontSize: 11, fontWeight: '600' },
  remaining: { borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, ring: { height: 48, width: 48, justifyContent: 'center', alignItems: 'center' }, remainingCopy: { flex: 1, gap: 4 }, remainingAmount: { fontSize: 15, fontWeight: '600' }, note: { fontSize: 12, lineHeight: 18 },
});
