import type { FinancialAccount } from '@/api/financialAccountApi';

export function getAccountCurrentBalance(account: FinancialAccount) {
  if (typeof account.currentBalance === 'number' && Number.isFinite(account.currentBalance)) {
    return account.currentBalance;
  }

  return account.initialBalance;
}
