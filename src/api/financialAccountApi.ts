import { axiosClient } from './axiosClient';

export type AccountType = 'Cash' | 'Bank' | 'EWallet' | 'CreditCard' | 'Savings';

export type CreateFinancialAccountPayload = {
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
};

export type FinancialAccount = {
  id: number;
  userId: number;
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
  balance?: number | null;
  currentBalance?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export function getFinancialAccountBalance(account: FinancialAccount) {
  if (typeof account.currentBalance === 'number' && Number.isFinite(account.currentBalance)) {
    return account.currentBalance;
  }

  if (typeof account.balance === 'number' && Number.isFinite(account.balance)) {
    return account.balance;
  }

  return account.initialBalance;
}

export const financialAccountApi = {
  list: () => axiosClient.get<FinancialAccount[]>('/accounts'),
  create: (payload: CreateFinancialAccountPayload) => axiosClient.post('/accounts', payload),
};
