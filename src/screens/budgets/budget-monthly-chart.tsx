import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { transactionsApi } from '@/api/transactionsApi';
import { useAppTheme } from '@/hooks/use-app-theme';
import { calendarDate } from './budget-chart-data';
import { formatMoney } from './helpers';

type MonthlySpending = { year: number; month: number; amount: number };

export function BudgetMonthlyChart({ categoryId, endDate, limit, hidden, reloadKey }: {
  categoryId: number | null; endDate: string; limit: number; hidden: boolean; reloadKey: number;
}) {
  const theme = useAppTheme();
  const now = new Date();
  const periodEnd = calendarDate(endDate);
  const anchor = periodEnd < now ? periodEnd : now;
  const year = anchor.getFullYear();
  const month = anchor.getMonth() + 1;
  const [result, setResult] = useState<{ key: string; months: MonthlySpending[] } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const requestKey = `${categoryId}-${year}-${month}-${reloadKey}-${retry}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const months = await Promise.all(Array.from({ length: 6 }, async (_, index) => {
          const date = new Date(year, month - 6 + index, 1);
          const params = { year: date.getFullYear(), month: date.getMonth() + 1 };
          const { data } = await transactionsApi.categorySpending(params);
          if (!Array.isArray(data.categories) || !Number.isFinite(data.totalAmount) ||
            data.currentPeriod?.year !== params.year || data.currentPeriod?.month !== params.month) {
            throw new Error('Invalid monthly spending response');
          }
          // Compare amounts may be month-to-date, so each bar uses its own currentPeriod.
          const amount = categoryId === null ? data.totalAmount :
            data.categories.filter(item => item.categoryId === categoryId).reduce((total, item) => total + item.amount, 0);
          if (!Number.isFinite(amount)) throw new Error('Invalid monthly amount');
          return { ...params, amount };
        }));
        if (!cancelled) setResult({ key: requestKey, months });
      } catch {
        if (!cancelled) setErrorKey(requestKey);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [categoryId, year, month, requestKey]);

  const money = (value: number) => hidden ? '••••••' : formatMoney(value);
  if (errorKey === requestKey) return <View style={s.state}><Text style={{ color: theme.textMuted }}>Không tải được chi tiêu theo tháng.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={s.retry}><Text style={{ color: theme.primary }}>Thử lại biểu đồ</Text></Pressable></View>;
  if (result?.key !== requestKey) return <View style={s.state}><ActivityIndicator color={theme.primary} /></View>;
  const maximum = Math.max(limit, ...result.months.map(item => item.amount), 1) * 1.15;
  const selected = result.months.find(item => `${item.year}-${item.month}` === selectedMonth) ?? result.months[result.months.length - 1];
  const crossesYear = result.months[0].year !== result.months[result.months.length - 1].year;

  return (
    <View style={s.chart}>
      <Text style={[s.value, { color: theme.textMuted }]}>Tháng {selected.month}/{selected.year}: {money(selected.amount)}</Text>
      <View style={s.plot}>
        {result.months.map(item => {
          const key = `${item.year}-${item.month}`;
          const active = item === selected;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Tháng ${item.month}/${item.year}, ${money(item.amount)}`} accessibilityState={{ selected: active }} onPress={() => setSelectedMonth(key)} style={s.column}>
              <View style={s.track}><View testID={`budget-month-${key}`} style={[s.bar, { height: item.amount > 0 ? Math.max(3, item.amount / maximum * 100) : 0, backgroundColor: active ? theme.budget.barActive : theme.budget.bar }]} /></View>
              <Text style={[s.month, { color: active ? theme.budget.barLabel : theme.textMuted }]}>{crossesYear ? `${item.month}/${String(item.year).slice(-2)}` : item.month}</Text>
            </Pressable>
          );
        })}
        {limit > 0 ? <View pointerEvents="none" testID="budget-monthly-limit" style={[s.limitLine, { bottom: 24 + limit / maximum * 100, borderColor: theme.budget.limitLine }]} /> : null}
      </View>
      <Text style={[s.legend, { color: theme.textMuted }]}>- - Hạn mức ngân sách: {money(limit)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chart: { marginTop: 8, gap: 8 }, value: { fontSize: 12, textAlign: 'center', minHeight: 18 },
  plot: { height: 124, flexDirection: 'row', gap: 8 }, column: { flex: 1, height: 124 },
  track: { height: 100, justifyContent: 'flex-end' }, bar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  month: { height: 24, textAlign: 'center', paddingTop: 6, fontSize: 11 },
  limitLine: { position: 'absolute', left: 0, right: 0, zIndex: 1, borderTopWidth: 1, borderStyle: 'dashed' },
  legend: { textAlign: 'center', fontSize: 11 }, state: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 8 }, retry: { padding: 10 },
});
