import { axiosClient } from "./axiosClient";

export type TransactionType = "Income" | "Expense" | "TransferIn" | "TransferOut";

export type Transaction = {
  id: number;
  userId: number;
  accountId: number;
  categoryId: number | null;
  type: TransactionType;
  amount: number;
  description: string | null;
  transactionDate: string;
  location: string | null;
  isExcluded: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export const transactionApi = {
  list: (filter: "NotDeleted" | "Deleted" | "All" = "NotDeleted") =>
    axiosClient.get<Transaction[]>(`/transactions?filter=${filter}`),
};
