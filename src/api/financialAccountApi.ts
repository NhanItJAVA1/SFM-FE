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
  currentBalance?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export const financialAccountApi = {
  list: () => axiosClient.get<FinancialAccount[]>("/v1/accounts"),
  create: (payload: CreateFinancialAccountPayload) => axiosClient.post("/v1/accounts", payload),
  update: (id: number, payload: UpdateFinancialAccountPayload) => axiosClient.put(`/v1/accounts/${id}`, payload),
  delete: (id: number) => axiosClient.delete(`/v1/accounts/${id}`),
};
