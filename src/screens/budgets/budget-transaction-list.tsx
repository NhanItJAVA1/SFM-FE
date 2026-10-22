import { ArrowDownLeft, ListFilter } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BudgetDailySpending } from '@/api/budgetsApi';
import type { Category } from '@/api/categoriesApi';
import { useAppTheme } from '@/hooks/use-app-theme';
import { calendarDate } from './budget-chart-data';
import { formatMoney } from './helpers';

export function BudgetTransactionList({ dailySpendings = [], categories = [] }: {
  dailySpendings?: BudgetDailySpending[]; categories?: Category[];
}) {
  const theme = useAppTheme();
  const [limit, setLimit] = useState(20);
  const transactions = useMemo(() => dailySpendings.flatMap(day =>
    (day.transactions ?? []).map(transaction => ({ ...transaction, day: day.date.slice(0, 10) })))
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.id - a.id), [dailySpendings]);
  const groups = new Map<string, typeof transactions>();
  transactions.slice(0, limit).forEach(transaction => {
    const group = groups.get(transaction.day) ?? [];
    group.push(transaction);
    groups.set(transaction.day, group);
  });

  return (
    <View style={s.section}>
      <Text style={[s.title, { color: theme.text }]}>Giao dịch</Text>
      <View style={[s.all, { backgroundColor: theme.primaryPressed, borderColor: theme.primary }]}>
        <ListFilter size={14} color={theme.primary} /><Text style={[s.filterText, { color: theme.primary }]}>Tất cả</Text>
      </View>
      {transactions.length === 0 ? <Text style={[s.empty, { color: theme.textMuted }]}>Chưa có giao dịch thuộc ngân sách này.</Text> : null}
      {Array.from(groups, ([day, rows]) => (
        <View key={day}>
          <View style={[s.dateBand, { backgroundColor: theme.listHeader }]}><Text style={[s.date, { color: theme.textSoft }]}>{calendarDate(day).toLocaleDateString('vi-VN')}</Text></View>
          <View style={{ backgroundColor: theme.listSurface }}>
            {rows.map(transaction => {
              const category = categories.find(item => item.id === transaction.categoryId)?.name ?? 'Khác';
              return (
                <View key={transaction.id} style={[s.row, { borderBottomColor: theme.listDivider }]}>
                  <View style={[s.icon, { backgroundColor: theme.cardAlt }]}><ArrowDownLeft size={18} color={theme.warning} /></View>
                  <View style={s.copy}>
                    <Text style={[s.description, { color: theme.text }]} numberOfLines={2}>{transaction.description || category}</Text>
                    <View style={s.footer}>
                    <View style={s.meta}>
                      <View style={[s.category, { borderColor: theme.border }]}><Text numberOfLines={1} style={[s.categoryText, { color: theme.textMuted }]}>{category}</Text></View>
                      <Text style={[s.time, { color: theme.textMuted }]}>{new Date(transaction.transactionDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                    <Text adjustsFontSizeToFit numberOfLines={1} style={[s.amount, { color: theme.text }]}>-{formatMoney(Math.abs(transaction.amount))}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
      {limit < transactions.length ? <Pressable accessibilityRole="button" onPress={() => setLimit(value => value + 20)} style={s.more}><Text style={{ color: theme.primary, fontWeight: '600' }}>Xem thêm giao dịch</Text></Pressable> : null}
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: 10 }, title: { fontSize: 18, fontWeight: '700', paddingHorizontal: 4 },
  all: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', gap: 5, alignItems: 'center', alignSelf: 'flex-start' }, filterText: { fontSize: 12, fontWeight: '600' },
  dateBand: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 4 }, date: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 14, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, minWidth: 0, gap: 7 },
  description: { fontSize: 14, lineHeight: 20, fontWeight: '500' }, footer: { flexDirection: 'row', gap: 8, alignItems: 'center' }, meta: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, category: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, maxWidth: '100%' }, categoryText: { fontSize: 11 }, time: { fontSize: 10 }, amount: { maxWidth: '55%', fontSize: 14, fontWeight: '700', textAlign: 'right' },
  empty: { padding: 16, fontSize: 13 }, more: { padding: 14, alignItems: 'center' },
});
