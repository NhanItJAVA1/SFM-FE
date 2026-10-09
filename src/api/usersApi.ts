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

export type ResetMyDataPayload = {
  password: string;
  idToken: string;
};

export const usersApi = {
  list: () => axiosClient.get<AuthUser[]>('/v1/Users'),
  get: (id: number) => axiosClient.get<AuthUser>(`/v1/Users/${id}`),
  update: (id: number, payload: UpdateUserPayload) => axiosClient.put(`/v1/Users/${id}`, payload),
  createAvatarUploadUrl: (payload: AvatarUploadUrlPayload) =>
    axiosClient.post<AvatarUploadUrlResponse>('/v1/Users/avatar/upload-url', payload),
  resetMyData: (payload: ResetMyDataPayload) => axiosClient.delete('/v1/Users/me/data', payload),
};
