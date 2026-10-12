import { axiosClient } from './axiosClient';
import type { Category, CategoryType } from './categoriesApi';

export type AdminUserStatus = 'Active' | 'Inactive' | 'Suspended';
export type AdminUserRole = 'User' | 'Admin';

export type AdminCategoryPayload = {
  name: string;
  type: CategoryType;
  icon: string | null;
  isDefault: boolean;
};

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: AdminUserStatus;
  role: AdminUserRole;
  createdAt: string;
};

export type AdminUserQuery = {
  search?: string;
  status?: AdminUserStatus;
  role?: AdminUserRole;
  page?: number;
  pageSize?: number;
};

export type AdminUserPagedResponse = {
  items: AdminUser[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type UpdateAdminUserStatusPayload = {
  status: AdminUserStatus;
};

export type UpdateAdminUserRolePayload = {
  role: AdminUserRole;
};

function buildQuery(params: AdminUserQuery) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'number') {
      searchParams.set(key, String(value));
      return;
    }

    if (typeof value === 'string' && value.trim()) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();

  return query ? `?${query}` : '';
}

export const adminApi = {
  listUsers: (params: AdminUserQuery = {}) =>
    axiosClient.get<AdminUserPagedResponse>(`/v1/admin/users${buildQuery(params)}`),
  getUser: (id: number) => axiosClient.get<AdminUser>(`/v1/admin/users/${id}`),
  updateUserStatus: (id: number, payload: UpdateAdminUserStatusPayload) =>
    axiosClient.patch<AdminUser>(`/v1/admin/users/${id}/status`, payload),
  updateUserRole: (id: number, payload: UpdateAdminUserRolePayload) =>
    axiosClient.patch<AdminUser>(`/v1/admin/users/${id}/role`, payload),
  listDefaultCategories: () => axiosClient.get<Category[]>('/v1/admin/categories'),
  createDefaultCategory: (payload: AdminCategoryPayload) =>
    axiosClient.post<Category>('/v1/admin/categories', payload),
  updateDefaultCategory: (id: number, payload: AdminCategoryPayload) =>
    axiosClient.put<Category>(`/v1/admin/categories/${id}`, payload),
  deleteDefaultCategory: (id: number) => axiosClient.delete(`/v1/admin/categories/${id}`),
};
