import { axiosClient } from './axiosClient';
import type { Category, CategoryType } from './categoriesApi';

export type AdminCategoryPayload = {
  name: string;
  type: CategoryType;
  icon: string | null;
  isDefault: boolean;
};

export const adminApi = {
  listDefaultCategories: () => axiosClient.get<Category[]>('/v1/admin/categories'),
  createDefaultCategory: (payload: AdminCategoryPayload) =>
    axiosClient.post<Category>('/v1/admin/categories', payload),
  updateDefaultCategory: (id: number, payload: AdminCategoryPayload) =>
    axiosClient.put<Category>(`/v1/admin/categories/${id}`, payload),
  deleteDefaultCategory: (id: number) => axiosClient.delete(`/v1/admin/categories/${id}`),
};
