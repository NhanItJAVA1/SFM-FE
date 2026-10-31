import { isAxiosError } from 'axios';
import { axiosClient } from './axiosClient';

export type CategoryType = 'Income' | 'Expense';

export type Category = {
  id: number;
  userId: number | null;
  name: string;
  type: CategoryType;
  icon: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export type CreateCategoryPayload = {
  name: string;
  type: CategoryType;
  icon: string;
  isDefault: boolean;
};

export function getCategoryCreateErrorMessage(error: unknown): string {
  if (isAxiosError(error) && error.response?.status === 409) {
    const body: unknown = error.response.data;
    const record = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
    const identifiers = [record.code, record.errorCode, record.error_code, record.type, body]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (identifiers.some((value) => value.includes('category') && (value.includes('duplicate') || value.includes('alreadyexists') || value.includes('nameexists')))) {
      return 'Tên danh mục đã tồn tại.';
    }
  }
  return 'Không thể tạo danh mục. Vui lòng thử lại.';
}

export function normalizeCategoryName(name: string): string {
  return name.trim();
}

export function hasCategoryName(categories: Category[], name: string): boolean {
  const normalizedName = normalizeCategoryName(name).toLowerCase();
  return categories.some((category) => normalizeCategoryName(category.name).toLowerCase() === normalizedName);
}

export const categoriesApi = {
  list: () => axiosClient.get<Category[]>('/v1/categories'),
  create: (payload: CreateCategoryPayload) => axiosClient.post('/v1/categories', payload),
  delete: (id: number) => axiosClient.delete(`/v1/categories/${id}`),
};
