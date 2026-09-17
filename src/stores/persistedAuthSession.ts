import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthUser, LoginResponse } from '@/api/authApi';
import { setApiAccessToken, setApiTokenRefreshHandler } from '@/api/axiosClient';
import {
  setAuthAccessToken,
  setAuthRefreshToken,
  setAuthUser,
} from '@/stores/authSession';

type PersistedAuthSession = {
  accessToken: string;
  refreshToken: string | null;
  user: AuthUser;
};

const sessionStorageKey = 'sfm.auth.session';

async function setStorageItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function getStorageItem(key: string) {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function deleteStorageItem(key: string) {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

function applyAuthSession(session: PersistedAuthSession | null) {
  const accessToken = session?.accessToken ?? null;

  setApiAccessToken(accessToken);
  setAuthAccessToken(accessToken);
  setAuthRefreshToken(session?.refreshToken ?? null);
  setAuthUser(session?.user ?? null);
}

setApiTokenRefreshHandler(async (response) => {
  const session: PersistedAuthSession = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? null,
    user: response.user,
  };

  applyAuthSession(session);
  await setStorageItem(sessionStorageKey, JSON.stringify(session));
});

export async function saveAuthSession(response: LoginResponse) {
  const session: PersistedAuthSession = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? null,
    user: response.user,
  };

  applyAuthSession(session);
  await setStorageItem(sessionStorageKey, JSON.stringify(session));
}

export async function restoreAuthSession() {
  try {
    const rawSession = await getStorageItem(sessionStorageKey);

    if (!rawSession) {
      applyAuthSession(null);
      return null;
    }

    const session = JSON.parse(rawSession) as PersistedAuthSession;

    if (!session.accessToken || !session.user) {
      await clearAuthSession();
      return null;
    }

    applyAuthSession(session);
    return session;
  } catch {
    await clearAuthSession();
    return null;
  }
}

export async function clearAuthSession() {
  applyAuthSession(null);

  try {
    await deleteStorageItem(sessionStorageKey);
  } catch {
    // Session is already cleared from memory, so stale storage cleanup can fail silently.
  }
}
