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

export const categoriesApi = {
  list: () => axiosClient.get<Category[]>('/categories'),
  create: (payload: CreateCategoryPayload) => axiosClient.post('/categories', payload),
};
