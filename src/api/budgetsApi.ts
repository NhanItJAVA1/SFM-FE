import { axiosClient } from './axiosClient';

export type Budget = {
  id: number;
  userId: number;
  categoryId: number | null;
  name: string;
  amount: number;
  startDate: string;
  endDate: string;
  alertThreshold: number;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export type BudgetPayload = {
  categoryId: number | null;
  name: string;
  amount: number;
  startDate: string;
  endDate: string;
  alertThreshold: number;
  isRecurring: boolean;
};

export type BudgetProgress = {
  id: number;
  budgetId: number;
  userId: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  amount: number;
  spentAmount: number;
  remainingAmount: number;
  usedPercentage: number;
  alertThreshold: number;
  isAlert: boolean;
  isRecurring: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string | null;
};

export type BudgetProgressTransaction = {
  id: number;
  accountId: number;
  categoryId: number | null;
  type: string;
  amount: number;
  description: string | null;
  transactionDate: string;
  location: string | null;
};

export type BudgetDailySpending = {
  date: string;
  amount: number;
  transactionCount: number;
  usedPercentage: number;
  transactions: BudgetProgressTransaction[];
};

export type BudgetProgressDetail = BudgetProgress & {
  dailySpendings: BudgetDailySpending[];
};

export type BudgetAlert = {
  id: number;
  budgetId: number;
  threshold: number;
  currentPercentage: number;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export const budgetsApi = {
  list: () => axiosClient.get<Budget[]>('/budgets'),
  get: (id: number) => axiosClient.get<Budget>(`/budgets/${id}`),
  create: (payload: BudgetPayload) => axiosClient.post('/budgets', payload),
  update: (id: number, payload: BudgetPayload) => axiosClient.put(`/budgets/${id}`, payload),
  remove: (id: number) => axiosClient.delete(`/budgets/${id}`),
  progressSummary: () => axiosClient.get<BudgetProgress[]>('/budgets/progress-summary'),
  getProgress: (budgetId: number) => axiosClient.get<BudgetProgress>(`/budgets/${budgetId}/progress`),
  getProgressDetail: (budgetId: number) =>
    axiosClient.get<BudgetProgressDetail>(`/budgets/${budgetId}/progress-detail`),
  listAlerts: () => axiosClient.get<BudgetAlert[]>('/budget-alerts'),
  markAlertRead: (id: number) => axiosClient.post(`/budget-alerts/${id}/read`),
};
