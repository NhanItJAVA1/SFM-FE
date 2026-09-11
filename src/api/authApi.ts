import { axiosClient } from './axiosClient';

export type LoginPayload = { email: string; password: string };
export type RegisterPayload = LoginPayload & { username: string };
export type GoogleLoginPayload = { idToken: string };

export const authApi = {
    login: (payload: LoginPayload) => axiosClient.post('/auth/login', payload),
    register: (payload: RegisterPayload) => axiosClient.post('/auth/register', payload),
    loginWithGoogle: (payload: GoogleLoginPayload) => axiosClient.post('/auth/google', payload),
};
