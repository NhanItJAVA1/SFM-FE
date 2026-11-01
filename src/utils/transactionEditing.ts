import { isAxiosError } from 'axios';

import type { Category } from '@/api/categoriesApi';
import type { FinancialAccount } from '@/api/financialAccountApi';
import type { Transaction, UpdateTransactionPayload } from '@/api/transactionsApi';

export type TransactionEditForm = {
  accountId: number;
  categoryId: number | null;
  type: 'Income' | 'Expense';
  amount: string;
  description: string;
  date: string;
  time: string;
  location: string;
  isExcluded: boolean;
};

export function transactionDateFields(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function createTransactionEditForm(transaction: Transaction): TransactionEditForm {
  return {
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    type: transaction.type === 'Income' ? 'Income' : 'Expense',
    amount: String(transaction.amount),
    description: transaction.description ?? '',
    ...transactionDateFields(transaction.transactionDate),
    location: transaction.location ?? '',
    isExcluded: transaction.isExcluded,
  };
}

export function parseTransactionDate(dateText: string, timeText: string) {
  const day = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateText.trim());
  const time = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!day || !time) throw new Error('Nhập ngày theo dd/MM/yyyy và giờ theo HH:mm.');
  const [, d, m, y] = day.map(Number);
  const [, hour, minute] = time.map(Number);
  const date = new Date(y, m - 1, d, hour, minute);
  if (y < 100 || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d
    || hour > 23 || minute > 59 || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new Error('Ngày hoặc giờ giao dịch không hợp lệ.');
  }
  return date;
}

export function buildUpdateTransactionPayload(
  original: Transaction,
  form: TransactionEditForm,
  accounts: FinancialAccount[],
  categories: Category[],
): UpdateTransactionPayload {
  if (original.transferId != null || original.type === 'TransferIn' || original.type === 'TransferOut') {
    throw new Error('Không thể sửa riêng giao dịch thuộc một lần chuyển tiền.');
  }
  if (form.type !== 'Income' && form.type !== 'Expense') throw new Error('Loại giao dịch không hợp lệ.');
  if (!accounts.some(account => account.id === form.accountId && account.isActive)) {
    throw new Error('Vui lòng chọn ví đang hoạt động.');
  }
  if (form.categoryId !== null && !categories.some(category => category.id === form.categoryId && category.type === form.type)) {
    throw new Error('Vui lòng chọn danh mục phù hợp với loại giao dịch.');
  }
  const normalized = form.amount.trim().replace(',', '.');
  const amount = Number(normalized);
  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Số tiền phải lớn hơn 0 và có tối đa 2 chữ số thập phân.');
  }
  if (amount * 100 > Number.MAX_SAFE_INTEGER) throw new Error('Số tiền quá lớn. Vui lòng nhập số nhỏ hơn.');
  if (form.description.trim().length > 500) throw new Error('Ghi chú không được dài hơn 500 ký tự.');
  if (form.location.trim().length > 255) throw new Error('Địa điểm không được dài hơn 255 ký tự.');
  const date = parseTransactionDate(form.date, form.time);
  const initial = transactionDateFields(original.transactionDate);
  // Preserve seconds and milliseconds when only another field was edited.
  const transactionDate = form.date === initial.date && form.time === initial.time
    ? original.transactionDate : date.toISOString();
  return {
    accountId: form.accountId,
    categoryId: form.categoryId,
    type: form.type,
    amount,
    description: form.description.trim() || null,
    transactionDate,
    location: form.location.trim() || null,
    isExcluded: form.isExcluded,
  };
}

export function getTransactionMutationError(error: unknown) {
  if (!isAxiosError(error)) return error instanceof Error ? error.message : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
  const code = error.response?.data?.code ?? error.response?.data?.errorCode;
  if (code === 'FINANCIAL_ACCOUNT_NOT_FOUND') return 'Ví không còn hoạt động hoặc đã bị xóa. Vui lòng tải lại dữ liệu.';
  if (code === 'TRANSACTION_NOT_FOUND' || code === 'TRANSFER_NOT_FOUND' || error.response?.status === 404) {
    return 'Giao dịch không còn tồn tại. Vui lòng đóng và tải lại Sổ giao dịch.';
  }
  if (code === 'TRANSFER_TRANSACTION_READ_ONLY') return 'Không thể sửa hoặc xóa riêng một bên chuyển tiền. Hãy quản lý toàn bộ lần chuyển.';
  return 'Không thể hoàn tất yêu cầu. Vui lòng kiểm tra kết nối và thử lại.';
}
