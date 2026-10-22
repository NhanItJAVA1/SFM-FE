export function calendarDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function budgetPeriodData(start: string, end: string, now = new Date()) {
  const first = calendarDate(start);
  const last = calendarDate(end);
  const today = calendarDate(dateKey(now));
  const difference = (a: Date, b: Date) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) || last < first) {
    return { duration: 0, remainingDays: 0, hasStarted: false, hasEnded: false };
  }
  const duration = difference(last, first) + 1;
  const remainingDays = today > last ? 0 : today < first ? duration : difference(last, today) + 1;
  return { duration, remainingDays, hasStarted: today >= first, hasEnded: today > last };
}
