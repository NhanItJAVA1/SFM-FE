import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';
import { Platform } from 'react-native';

export type AppThemeMode = "dark" | "light";

const themeStorageKey = "sfm.theme.mode";
const subscribers = new Set<() => void>();
let currentThemeMode: AppThemeMode = "dark";

export function getThemeMode() {
  return currentThemeMode;
}

export function subscribeThemeMode(listener: () => void) {
  subscribers.add(listener);

  return () => {
    subscribers.delete(listener);
  };
}

export async function restoreThemeMode() {
  const storedThemeMode = await getStorageItem(themeStorageKey);

  if (storedThemeMode === "light" || storedThemeMode === "dark") {
    applyThemeMode(storedThemeMode);
    return storedThemeMode;
  }

  applyThemeMode(currentThemeMode);
  return currentThemeMode;
}

export async function setThemeMode(nextThemeMode: AppThemeMode) {
  applyThemeMode(nextThemeMode);
  await setStorageItem(themeStorageKey, nextThemeMode);
}

export function getNextThemeMode(themeMode = currentThemeMode): AppThemeMode {
  return themeMode === "dark" ? "light" : "dark";
}

function applyThemeMode(nextThemeMode: AppThemeMode) {
  currentThemeMode = nextThemeMode;
  void SystemUI.setBackgroundColorAsync(nextThemeMode === 'dark' ? '#020204' : '#ffffff');
  subscribers.forEach((listener) => listener());
}

async function setStorageItem(key: string, value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function getStorageItem(key: string) {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}
