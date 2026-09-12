import { axiosClient } from './axiosClient';

export type LoginPayload = { username: string; password: string };
export type RegisterPayload = LoginPayload & { email: string };
export type GoogleLoginPayload = {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
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
    login: (payload: LoginPayload) => axiosClient.post<LoginResponse>('/auth/login', payload),
    register: (payload: RegisterPayload) => axiosClient.post('/auth/register', payload),
    loginWithGoogle: (payload: GoogleLoginPayload) => axiosClient.post<LoginResponse>('/auth/google', payload),
};
