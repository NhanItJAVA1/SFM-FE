export function isIncomingTransaction(type: string) {
  return type === 'Income' || type === 'TransferIn';
}

export function isTransferTransaction(transaction: { type?: string; transferId?: number | null }) {
  return transaction.transferId != null || transaction.type === 'TransferIn' || transaction.type === 'TransferOut';
}

function transactionDate(value: string) {
  // Date-only values describe a local calendar day, rather than midnight UTC.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
}

export function getTransactionDayKey(value: string) {
  const date = transactionDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getCurrentTransactionMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getTransactionMonthRange(month: string | null) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const days = new Date(year, monthNumber, 0).getDate();
  return { fromDate: `${month}-01`, toDate: `${month}-${String(days).padStart(2, '0')}T23:59:59.999` };
}

export function getTransactionDayHeading(value: string, now = new Date()) {
  const date = transactionDate(value);
  if (Number.isNaN(date.getTime())) return { label: 'Không rõ ngày', date: '' };
  const calendarDay = (day: Date) => Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  const daysAgo = (calendarDay(now) - calendarDay(date)) / 86_400_000;
  const weekdays = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  return {
    label: daysAgo === 0 ? 'Hôm nay' : daysAgo === 1 ? 'Hôm qua' : weekdays[date.getDay()],
    date: new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date),
  };
}

export function formatTransactionTime(value: string) {
  const date = transactionDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
