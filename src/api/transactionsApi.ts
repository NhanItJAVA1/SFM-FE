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
  confidence?: number | null;
  rawText?: string | null;
  items?: TransactionDraftItem[] | null;
  itemsTotal?: number | null;
  difference?: number | null;
  [key: string]: unknown;
};

export type ScanBillResponse = TransactionDraft;

export const transactionsApi = {
  scanBill: async (imageUri: string) => {
    const imageResponse = await fetch(imageUri);
    const imageBlob = await imageResponse.blob();
    const jpegBlob = imageBlob.type === 'image/jpeg' ? imageBlob : new Blob([imageBlob], { type: 'image/jpeg' });
    const formData = new FormData();

    formData.append('image', jpegBlob, `bill-${Date.now()}.jpg`);

    return axiosClient.uploadFormData<ScanBillResponse>('/transactions/scan-bill', formData);
  },
};
