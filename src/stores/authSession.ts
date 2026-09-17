import type { AuthUser } from '@/api/authApi';

let currentUser: AuthUser | null = null;
let currentRefreshToken: string | null = null;
let currentAccessToken: string | null = null;

export function setAuthUser(user: AuthUser | null) {
  currentUser = user;
}

export function getAuthUser() {
  return currentUser;
}

export function setAuthAccessToken(token: string | null) {
  currentAccessToken = token;
}

export function getAuthAccessToken() {
  return currentAccessToken;
}

export function setAuthRefreshToken(refreshToken: string | null) {
  currentRefreshToken = refreshToken;
}

export function getAuthRefreshToken() {
  return currentRefreshToken;
}
