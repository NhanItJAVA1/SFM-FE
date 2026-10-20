const dayMs = 86_400_000;

// Analysis uses calendar dates, not the device's current clock or timezone.
export function calendarDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : null;
}

export function getAnomalyWindow(asOf: string | undefined, periodDays = 90) {
  const end = calendarDay(asOf ?? "");
  if (end === null) return null;
  const days = Number.isFinite(periodDays) && periodDays > 0 ? Math.min(90, Math.floor(periodDays)) : 90;
  const start = end - (days - 1) * dayMs;
  const months: { value: string; label: string }[] = [];
  const cursor = new Date(end);
  cursor.setUTCDate(1);
  while (cursor.getTime() + 32 * dayMs > start) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const monthEnd = Date.UTC(year, month, 0);
    if (monthEnd < start) break;
    months.push({ value: `${year}-${String(month).padStart(2, "0")}`, label: `Tháng ${month}/${year}` });
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  const format = (time: number) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(time);
  return { start, end, days, months, label: `${format(start)} – ${format(end)}` };
}
