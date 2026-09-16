import { axiosClient } from './axiosClient';

export type ScanBillResponse = unknown;

export const transactionsApi = {
  scanBill: (imageUri: string) => {
    const formData = new FormData();

    formData.append('image', {
      uri: imageUri,
      name: `bill-${Date.now()}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob);

    return axiosClient.uploadFormData<ScanBillResponse>('/transactions/scan-bill', formData);
  },
};
