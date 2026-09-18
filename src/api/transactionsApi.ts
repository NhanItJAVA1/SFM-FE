import { axiosClient } from './axiosClient';

export type TransactionDraftItem = {
  name?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
};

export type TransactionDraft = {
  accountId?: number | null;
  categoryId?: number | null;
  type?: string | null;
  amount?: number | null;
  description?: string | null;
  transactionDate?: string | null;
  location?: string | null;
  merchantName?: string | null;
  isExcluded?: boolean | null;
  confidence?: number | null;
  rawText?: string | null;
  items?: TransactionDraftItem[] | null;
  itemsTotal?: number | null;
  difference?: number | null;
  [key: string]: unknown;
};

export type ScanBillResponse = TransactionDraft;

export type CreateTransactionFromScanPayload = {
  accountId: number;
  categoryId?: number | null;
  type: string;
  amount?: number | null;
  description?: string | null;
  transactionDate?: string | null;
  location?: string | null;
  isExcluded: boolean;
  items: TransactionDraftItem[];
};

export type TransactionNotification = {
  type?: string | null;
  budgetId?: number | null;
  level?: 'Warning' | 'Critical' | string | null;
  title?: string | null;
  body?: string | null;
  message?: string | null;
  [key: string]: unknown;
};

export type CreateTransactionFromScanResponse = {
  notifications?: TransactionNotification[] | null;
  notification?: TransactionNotification | null;
  [key: string]: unknown;
};

export type SpendingPeriod = {
  month: number;
  year: number;
  start: string;
  end: string;
};

export type CategorySpendingItem = {
  categoryId: number | null;
  categoryName: string;
  icon: string | null;
  amount: number;
  compareAmount: number;
  percentage: number;
  changePercentage: number | null;
  transactionCount: number;
  isUncategorized: boolean;
};

export type CategorySpendingResponse = {
  currentPeriod: SpendingPeriod;
  comparePeriod: SpendingPeriod;
  totalAmount: number;
  compareTotalAmount: number;
  totalChangePercentage: number | null;
  categories: CategorySpendingItem[];
};

export type CategorySpendingParams = {
  month?: number;
  year?: number;
  compareMonth?: number;
  compareYear?: number;
};

function buildQuery(params: CategorySpendingParams) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'number') {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();

  return query ? `?${query}` : '';
}

export function buildCreateTransactionFromScanPayload(
  draft: TransactionDraft,
  accountId: number
): CreateTransactionFromScanPayload {
  const items = Array.isArray(draft.items)
    ? draft.items.map((item) => ({
        name: item.name ?? null,
        quantity: item.quantity ?? null,
        unitPrice: item.unitPrice ?? null,
        amount: item.amount ?? null,
      }))
    : [];

  return {
    accountId,
    categoryId: draft.categoryId ?? null,
    type: draft.type ?? 'Expense',
    amount: draft.amount ?? null,
    description: draft.description ?? draft.merchantName ?? null,
    transactionDate: draft.transactionDate ?? null,
    location: draft.location ?? null,
    isExcluded: draft.isExcluded ?? false,
    items,
  };
}

export const transactionsApi = {
  scanBill: async (imageUri: string) => {
    const imageResponse = await fetch(imageUri);
    const imageBlob = await imageResponse.blob();
    const jpegBlob = imageBlob.type === 'image/jpeg' ? imageBlob : new Blob([imageBlob], { type: 'image/jpeg' });
    const formData = new FormData();

    formData.append('image', jpegBlob, `bill-${Date.now()}.jpg`);

    return axiosClient.uploadFormData<ScanBillResponse>('/transactions/scan-bill', formData);
  },
  createFromScan: (payload: CreateTransactionFromScanPayload) =>
    axiosClient.post<CreateTransactionFromScanResponse>('/transactions', payload),
  categorySpending: (params: CategorySpendingParams = {}) =>
    axiosClient.get<CategorySpendingResponse>(`/transactions/category-spending${buildQuery(params)}`),
};
