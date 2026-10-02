import type { AuthUser } from '@/api/authApi';

export function isAdminUser(user: AuthUser | null | undefined) {
  return String(user?.role ?? '').toLowerCase() === 'admin';
}
