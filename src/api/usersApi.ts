import type { AuthUser } from './authApi';
import { axiosClient } from './axiosClient';

export type AvatarUploadUrlPayload = {
  fileName: string;
  contentType: string;
};

export type AvatarUploadUrlResponse = {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
};

export type UpdateUserPayload = {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export const usersApi = {
  get: (id: number) => axiosClient.get<AuthUser>(`/users/${id}`),
  update: (id: number, payload: UpdateUserPayload) => axiosClient.put(`/users/${id}`, payload),
  createAvatarUploadUrl: (payload: AvatarUploadUrlPayload) =>
    axiosClient.post<AvatarUploadUrlResponse>('/users/avatar/upload-url', payload),
};
