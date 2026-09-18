import type { Budget, BudgetProgress, BudgetProgressDetail } from '@/api/budgetsApi';

export type BudgetWithProgress = Budget & {
  progress: BudgetProgress | null;
  progressDetail?: BudgetProgressDetail | null;
};

export type BudgetFormState = {
  name: string;
  categoryId: number | null;
  amount: string;
  startDate: string;
  endDate: string;
  alertThreshold: string;
  isRecurring: boolean;
};

export type BudgetSummary = {
  daysLeft: number;
  remainingAmount: number;
  spentAmount: number;
  totalAmount: number;
  usedPercentage: number;
};

export type BudgetsTab = 'month' | 'category';
