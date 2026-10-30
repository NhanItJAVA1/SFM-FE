import type { FinancialAccount } from '@/api/financialAccountApi';
import type { Transaction } from '@/api/transactionsApi';
import { getTransactionDayKey } from '@/utils/transactionPresentation';

export type CashflowGroup = { key: string; currency: string | null; accountName?: string; income: number; expense: number };

export function summarizeWalletCashflow(transactions: Transaction[], accounts: FinancialAccount[], accountId: number | null, month: string) {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const groups = new Map<string, CashflowGroup>();
  let hasTransfers = false;

  function groupFor(id: number) {
    const account = accountMap.get(id);
    const currency = account?.currency?.trim().toUpperCase() || null;
    const key = currency ?? `unknown:${id}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, currency, accountName: currency ? undefined : account?.name ?? `Ví #${id}`, income: 0, expense: 0 };
      groups.set(key, group);
    }
    return group;
  }

  accounts.filter((account) => accountId === null || account.id === accountId).forEach((account) => groupFor(account.id));

  // The range endpoint supplies the complete month, rather than a single feed page.
  for (const transaction of new Map(transactions.map((row) => [row.id, row])).values()) {
    if ((accountId !== null && transaction.accountId !== accountId)
      || getTransactionDayKey(transaction.transactionDate).slice(0, 7) !== month
      || transaction.isExcluded || !Number.isFinite(transaction.amount)) continue;
    if (transaction.type === 'TransferIn' || transaction.type === 'TransferOut') {
      hasTransfers = true;
      continue;
    }
    const group = groupFor(transaction.accountId);
    if (transaction.type === 'Income') group.income += Math.abs(transaction.amount);
    if (transaction.type === 'Expense') group.expense += Math.abs(transaction.amount);
  }

  if (groups.size === 0) groups.set('unknown', { key: 'unknown', currency: null, income: 0, expense: 0 });
  return { groups: [...groups.values()], hasTransfers };
}

export function formatCashflowAmount(amount: number, currency: string | null) {
  if (!currency) return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(amount);
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount).replace(/\s*₫$/, 'đ');
  } catch {
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
  }
}
