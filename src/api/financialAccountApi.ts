import { axiosClient } from "./axiosClient";

export type AccountType = "Cash" | "Bank" | "Savings";

export type CreateFinancialAccountPayload = {
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
};

export type UpdateFinancialAccountPayload = {
  name: string;
  type: AccountType;
  currency: string;
  isActive: boolean;
};

export type FinancialAccount = {
  id: number;
  userId: number;
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export function getFinancialAccountBalance(account: FinancialAccount) {
  return account.initialBalance;
}

export const financialAccountApi = {
  list: () => axiosClient.get<FinancialAccount[]>("/accounts"),
  create: (payload: CreateFinancialAccountPayload) => axiosClient.post("/accounts", payload),
  update: (id: number, payload: UpdateFinancialAccountPayload) => axiosClient.put(`/accounts/${id}`, payload),
  delete: (id: number) => axiosClient.delete(`/accounts/${id}`),
};
