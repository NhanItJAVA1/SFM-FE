import type { BudgetPayload } from '@/api/budgetsApi';
import type { Category } from '@/api/categoriesApi';
import type { BudgetFormState, BudgetSummary, BudgetWithProgress } from './types';

export function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

export function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getDefaultBudgetFormState(): BudgetFormState {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    alertThreshold: '80',
    amount: '',
    categoryId: null,
    endDate: formatDateInput(end),
    isRecurring: true,
    name: '',
    startDate: formatDateInput(start),
  };
}

export function getDaysUntilEnd(budgets: BudgetWithProgress[]) {
  if (budgets.length === 0) {
    return 0;
  }

  const latestEnd = budgets.reduce((latest, budget) => {
    const currentEnd = new Date(budget.progress?.endDate ?? budget.endDate).getTime();

    return Math.max(latest, currentEnd);
  }, 0);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return Math.max(0, Math.ceil((latestEnd - todayStart) / 86400000));
}

export function getBudgetSummary(budget: BudgetWithProgress): BudgetSummary {
  const progress = budget.progressDetail ?? budget.progress;
  const totalAmount = progress?.amount ?? budget.amount;
  const spentAmount = progress?.spentAmount ?? 0;
  const remainingAmount = progress?.remainingAmount ?? budget.amount;
  const usedPercentage = totalAmount > 0 ? (spentAmount / totalAmount) * 100 : 0;
  const alertThreshold = progress?.alertThreshold ?? budget.alertThreshold;

  return {
    alertThreshold,
    daysLeft: getDaysUntilEnd([budget]),
    isAlert: progress?.isAlert ?? usedPercentage >= alertThreshold,
    remainingAmount,
    spentAmount,
    totalAmount,
    usedPercentage,
  };
}

export function isBudgetExpired(budget: BudgetWithProgress) {
  const endTime = new Date(budget.progressDetail?.endDate ?? budget.progress?.endDate ?? budget.endDate).getTime();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return endTime < todayStart;
}

export function sortBudgetsForCategoryTab(budgets: BudgetWithProgress[]) {
  return [...budgets].sort((left, right) => {
    const leftExpired = isBudgetExpired(left);
    const rightExpired = isBudgetExpired(right);

    if (leftExpired !== rightExpired) {
      return leftExpired ? 1 : -1;
    }

    const leftEnd = new Date(left.progressDetail?.endDate ?? left.progress?.endDate ?? left.endDate).getTime();
    const rightEnd = new Date(right.progressDetail?.endDate ?? right.progress?.endDate ?? right.endDate).getTime();

    return leftExpired ? rightEnd - leftEnd : leftEnd - rightEnd;
  });
}

export function buildBudgetPayload(form: BudgetFormState): BudgetPayload {
  return {
    alertThreshold: Number(form.alertThreshold.trim() || '80'),
    amount: Number(form.amount.trim().replace(/,/g, '')),
    categoryId: form.categoryId,
    endDate: toIsoDate(form.endDate, true),
    isRecurring: form.isRecurring,
    name: form.name.trim(),
    startDate: toIsoDate(form.startDate),
  };
}

export function describeCategory(category: Category | undefined) {
  return category?.name ?? 'Tất cả danh mục';
}

function toIsoDate(value: string, endOfDay = false) {
  const trimmedValue = value.trim();
  const suffix = endOfDay ? 'T23:59:59' : 'T00:00:00';

  return trimmedValue.includes('T') ? trimmedValue : `${trimmedValue}${suffix}`;
}
