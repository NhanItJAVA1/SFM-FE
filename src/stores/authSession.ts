import { AuthUser } from '@/api/authApi';

let currentUser: AuthUser | null = null;

export function setAuthUser(user: AuthUser | null) {
  currentUser = user;
}

export function getAuthUser() {
  return currentUser;
}
