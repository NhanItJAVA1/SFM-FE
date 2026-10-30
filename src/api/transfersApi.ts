import { axiosClient } from './axiosClient';

export type CreateTransferPayload = {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  description?: string | null;
  transferDate: string;
};

export type Transfer = CreateTransferPayload & {
  id: number;
  userId: number;
  expenseTransactionId: number | null;
  incomeTransactionId: number | null;
  createdAt: string;
};

export const transfersApi = {
  list: () => axiosClient.get<Transfer[]>('/v1/transfers'),
  create: (payload: CreateTransferPayload) => axiosClient.post<void>('/v1/transfers', payload),
  delete: (id: number) => axiosClient.delete(`/v1/transfers/${id}`),
};
