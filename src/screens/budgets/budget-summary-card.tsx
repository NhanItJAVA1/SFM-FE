import { ChevronLeft, ChevronRight, Eye, EyeOff, Wallet } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { BudgetDailySpending } from '@/api/budgetsApi';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemeMode } from '@/hooks/use-theme-mode';
import { budgetChartData, budgetChartStart, calendarDate, dateKey } from './budget-chart-data';
import { formatMoney } from './helpers';
import type { BudgetSummary } from './types';

export function BudgetSummaryCard({ categoryName, name, summary, startDate, endDate, dailySpendings }: {
  categoryName: string; name: string; summary: BudgetSummary; startDate: string; endDate: string;
  dailySpendings?: BudgetDailySpending[];
}) {
  const theme = useAppTheme();
  const mode = useThemeMode();
  const [hidden, setHidden] = useState(false);
  const [page, setPage] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const data = useMemo(() => budgetChartData(startDate, endDate, dailySpendings ?? []), [startDate, endDate, dailySpendings]);
  const lastPage = Math.max(0, data.days.length - 7);
  const currentPage = Math.min(page ?? budgetChartStart(data.days), lastPage);
  const visibleDays = data.days.slice(currentPage, currentPage + 7);
  const dailyLimit = data.duration > 0 ? summary.totalAmount / data.duration : 0;
  const highestSpending = Math.max(0, ...visibleDays.map(day => day.amount));
  const maxAmount = (highestSpending > 0 ? highestSpending : Math.max(dailyLimit, 1)) * 1.15;
  const showDailyLimit = dailyLimit > 0 && dailyLimit <= maxAmount;
  const exceeded = summary.remainingAmount < 0;
  const status = exceeded ? 'Vượt ngân sách' : data.hasEnded ? 'Đã kết thúc' : !data.hasStarted ? 'Chưa bắt đầu' : summary.isAlert ? 'Gần hạn mức' : 'Ổn định';
  const statusColor = exceeded ? theme.dangerText : summary.isAlert ? theme.warning : theme.primary;
  const periodStart = calendarDate(startDate);
  const periodEnd = calendarDate(endDate);
  const sameMonth = periodStart.getFullYear() === periodEnd.getFullYear() && periodStart.getMonth() === periodEnd.getMonth();
  const periodLabel = sameMonth ? `Tháng ${periodStart.getMonth() + 1}/${periodStart.getFullYear()} chi` : `${periodStart.toLocaleDateString('vi-VN')} - ${periodEnd.toLocaleDateString('vi-VN')}`;
  const selected = data.days.find(day => day.date === selectedDate);
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
      <View style={s.limitBadge}><Text style={s.limitText}>Ngân sách: {money(summary.totalAmount)}</Text></View>

      {dailySpendings !== undefined && data.days.length > 0 ? (
        <View style={s.chart}>
          <View style={s.chartNav}>
            <Pressable accessibilityRole="button" accessibilityLabel="Các ngày trước" disabled={currentPage === 0} onPress={() => { setPage(Math.max(0, currentPage - 7)); setSelectedDate(null); }} style={[s.arrow, { opacity: currentPage === 0 ? 0.3 : 1 }]}><ChevronLeft size={18} color={theme.textMuted} /></Pressable>
            <Text style={[s.chartValue, { color: theme.textMuted }]}>{selected ? `${calendarDate(selected.date).toLocaleDateString('vi-VN')}: ${money(selected.amount)}` : `${calendarDate(visibleDays[0].date).toLocaleDateString('vi-VN')} - ${calendarDate(visibleDays[visibleDays.length - 1].date).toLocaleDateString('vi-VN')}`}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Các ngày sau" disabled={currentPage === lastPage} onPress={() => { setPage(Math.min(lastPage, currentPage + 7)); setSelectedDate(null); }} style={[s.arrow, { opacity: currentPage === lastPage ? 0.3 : 1 }]}><ChevronRight size={18} color={theme.textMuted} /></Pressable>
          </View>
          <View style={s.plot}>
            {showDailyLimit ? <View pointerEvents="none" style={[s.limitLine, { bottom: 24 + dailyLimit / maxAmount * 100 }]} /> : null}
            {visibleDays.map(day => (
              <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={`${calendarDate(day.date).toLocaleDateString('vi-VN')}, ${day.future ? 'Chưa đến ngày' : money(day.amount)}`} accessibilityState={{ selected: selectedDate === day.date }} onPress={() => setSelectedDate(day.date)} style={s.column}>
                <View style={s.barTrack}><View style={[s.bar, { height: day.amount > 0 ? Math.max(3, day.amount / maxAmount * 100) : 0, backgroundColor: day.date === selectedDate || day.date === dateKey(new Date()) ? '#258BFA' : mode === 'dark' ? '#46627F' : '#CBE4FF', opacity: day.future ? 0.35 : 1 }]} /></View>
                <Text style={[s.day, { color: theme.textMuted }]}>{calendarDate(day.date).getDate()}</Text>
              </Pressable>
            ))}
          </View>
          {highestSpending === 0 ? <Text style={[s.legend, { color: theme.textMuted }]}>Không có chi tiêu trong khoảng ngày này.</Text> : null}
          <Text style={[s.legend, { color: theme.textMuted }]}>{showDailyLimit ? '- - ' : ''}Mốc chi/ngày: {money(dailyLimit)}</Text>
        </View>
      ) : null}

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
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 4, paddingVertical: 12, gap: 8 },
  name: { fontSize: 18, fontWeight: '700' }, muted: { fontSize: 12, lineHeight: 18 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, total: { fontSize: 28, fontWeight: '800', flexShrink: 1 },
  limitBadge: { alignSelf: 'flex-start', backgroundColor: '#0AA4AA', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3 }, limitText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  chart: { marginTop: 4 }, chartNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, arrow: { padding: 8 }, chartValue: { fontSize: 11, flexShrink: 1, textAlign: 'center' },
  plot: { flexDirection: 'row', height: 124, alignItems: 'flex-end', gap: 8 },
  limitLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#0AA4AA' },
  column: { flex: 1, height: 124 }, barTrack: { height: 100, justifyContent: 'flex-end' }, bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3, width: '100%' }, day: { height: 24, textAlign: 'center', fontSize: 11, paddingTop: 6 }, legend: { textAlign: 'center', fontSize: 10, marginTop: 6 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 }, label: { fontSize: 15, fontWeight: '600' }, status: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 }, statusText: { fontSize: 11, fontWeight: '600' },
  remaining: { borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, ring: { height: 48, width: 48, justifyContent: 'center', alignItems: 'center' }, remainingCopy: { flex: 1, gap: 4 }, remainingAmount: { fontSize: 15, fontWeight: '700' }, note: { fontSize: 12, lineHeight: 18 },
});
