import { AuthUser } from '@/api/authApi';

let currentUser: AuthUser | null = null;
let currentRefreshToken: string | null = null;

export function setAuthUser(user: AuthUser | null) {
  currentUser = user;
}

export function getAuthUser() {
  return currentUser;
}

export function setAuthRefreshToken(refreshToken: string | null) {
  currentRefreshToken = refreshToken;
}

export function getAuthRefreshToken() {
  return currentRefreshToken;
}
