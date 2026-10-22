import type { BudgetDailySpending } from '@/api/budgetsApi';

export function calendarDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function budgetChartStart(days: { date: string; amount: number }[], now = new Date()) {
  const today = dateKey(now);
  const todayIndex = days.findIndex(day => day.date === today);
  const endIndex = todayIndex >= 0 ? todayIndex : today < (days[0]?.date ?? '') ? 0 : days.length - 1;
  const recentStart = Math.max(0, endIndex - 6);
  if (days.slice(recentStart, endIndex + 1).some(day => day.amount > 0)) return recentStart;
  for (let index = endIndex; index >= 0; index -= 1) {
    if (days[index].amount > 0) return Math.max(0, index - 6);
  }
  return recentStart;
}

export function budgetChartData(start: string, end: string, spending: BudgetDailySpending[], now = new Date()) {
  const first = calendarDate(start);
  const last = calendarDate(end);
  const today = calendarDate(dateKey(now));
  const difference = (a: Date, b: Date) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) || last < first) {
    return { days: [], duration: 0, remainingDays: 0, hasStarted: false, hasEnded: false };
  }
  const duration = difference(last, first) + 1;
  const totals = new Map<string, number>();
  for (const day of spending) {
    const key = day.date.slice(0, 10);
    totals.set(key, (totals.get(key) ?? 0) + day.amount);
  }
  const days: { date: string; amount: number; future: boolean }[] = [];
  for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const key = dateKey(cursor);
    days.push({ date: key, amount: totals.get(key) ?? 0, future: cursor > today });
  }
  const remainingDays = today > last ? 0 : today < first ? duration : difference(last, today) + 1;
  return { days, duration, remainingDays, hasStarted: today >= first, hasEnded: today > last };
}
