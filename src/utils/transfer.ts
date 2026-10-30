import { isAxiosError } from 'axios';

import type { FinancialAccount } from '@/api/financialAccountApi';
import type { CreateTransferPayload } from '@/api/transfersApi';

function vietnamDay(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

export function buildTransferPayload(input: {
  from: FinancialAccount | undefined;
  to: FinancialAccount | undefined;
  amount: string;
  description: string;
  date: Date;
}): CreateTransferPayload {
  const { from, to, description, date } = input;
  if (!from?.isActive || !to?.isActive) throw new Error('Vui lòng chọn hai ví đang hoạt động.');
  if (from.id === to.id) throw new Error('Ví chuyển và ví nhận phải khác nhau.');
  if (!from.currency.trim() || from.currency.trim().toUpperCase() !== to.currency.trim().toUpperCase()) {
    throw new Error('Hai ví phải dùng cùng một loại tiền tệ.');
  }
  const normalized = input.amount.trim().replace(',', '.');
  const amount = Number(normalized);
  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Số tiền phải lớn hơn 0 và có tối đa 2 chữ số thập phân.');
  }
  if (amount * 100 > Number.MAX_SAFE_INTEGER) throw new Error('Số tiền quá lớn. Vui lòng nhập số nhỏ hơn.');
  if (!Number.isFinite(date.getTime())) throw new Error('Thời gian chuyển tiền không hợp lệ.');
  const day = vietnamDay(date);
  if ([from, to].some(account => {
    const opened = new Date(account.createdAt);
    return Number.isFinite(opened.getTime()) && day < vietnamDay(opened);
  })) throw new Error('Ngày chuyển không được trước ngày mở của một trong hai ví.');
  if (description.trim().length > 500) throw new Error('Ghi chú không được dài hơn 500 ký tự.');
  return { fromAccountId: from.id, toAccountId: to.id, amount, description: description.trim() || null, transferDate: date.toISOString() };
}

const transferErrors: Record<string, string> = {
  INVALID_TRANSFER_ACCOUNTS: 'Ví chuyển và ví nhận phải khác nhau.',
  INVALID_TRANSFER_AMOUNT: 'Số tiền phải lớn hơn 0 và có tối đa 2 chữ số thập phân.',
  FINANCIAL_ACCOUNT_NOT_FOUND: 'Ví không còn hoạt động hoặc đã bị xóa. Vui lòng tải lại danh sách ví.',
  TRANSFER_CURRENCY_MISMATCH: 'Hai ví phải dùng cùng một loại tiền tệ.',
  INVALID_TRANSFER_DATE: 'Ngày chuyển không được trước ngày mở của một trong hai ví.',
  INVALID_TRANSFER_DESCRIPTION: 'Ghi chú không được dài hơn 500 ký tự.',
  TRANSFER_NOT_FOUND: 'Lần chuyển tiền này không còn tồn tại. Vui lòng tải lại lịch sử.',
};

export function getTransferError(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    const code = data?.code ?? data?.errorCode;
    if (typeof code === 'string' && transferErrors[code]) return transferErrors[code];
    return 'Không thể hoàn tất yêu cầu. Vui lòng kiểm tra kết nối và tải lại dữ liệu trước khi thử lại.';
  }
  return error instanceof Error ? error.message : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}
