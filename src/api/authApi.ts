import { axiosClient } from './axiosClient';

export type LoginPayload = { username: string; password: string };
export type RegisterPayload = LoginPayload & { email: string };
export type ExternalLoginPayload = {
    provider: 'Google' | 'Facebook' | 'Github' | 'TikTok';
    token: string;
};
export type LogoutPayload = {
    refreshToken?: string;
};
export type AuthUser = {
    id: number;
    username: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
    createdAt: string;
    updatedAt: string;
};
export type LoginResponse = {
    accessToken: string;
    refreshToken?: string;
    user: AuthUser;
};

export const authApi = {
    login: (payload: LoginPayload) => axiosClient.post<LoginResponse>('/v1/auth/login', payload),
    register: (payload: RegisterPayload) => axiosClient.post('/v1/auth/register', payload),
    externalLogin: (payload: ExternalLoginPayload) => axiosClient.post<LoginResponse>('/v1/auth/external-login', payload),
    logout: (payload?: LogoutPayload) => axiosClient.post('/v1/auth/logout', payload),
};
