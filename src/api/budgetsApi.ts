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
  list: () => axiosClient.get<Budget[]>('/v1/budgets'),
  get: (id: number) => axiosClient.get<Budget>(`/v1/budgets/${id}`),
  create: (payload: BudgetPayload) => axiosClient.post('/v1/budgets', payload),
  update: (id: number, payload: BudgetPayload) => axiosClient.put(`/v1/budgets/${id}`, payload),
  remove: (id: number) => axiosClient.delete(`/v1/budgets/${id}`),
  progressSummary: () => axiosClient.get<BudgetProgress[]>('/v1/budgets/progress-summary'),
  getProgress: (budgetId: number) => axiosClient.get<BudgetProgress>(`/v1/budgets/${budgetId}/progress`),
  getProgressDetail: (budgetId: number) =>
    axiosClient.get<BudgetProgressDetail>(`/v1/budgets/${budgetId}/progress-detail`),
  listAlerts: () => axiosClient.get<BudgetAlert[]>('/v1/budget-alerts'),
  markAlertRead: (id: number) => axiosClient.post(`/v1/budget-alerts/${id}/read`),
};
