import { useSyncExternalStore } from 'react';

import { getThemeMode, subscribeThemeMode } from '@/stores/themePreference';

export function useThemeMode() {
  return useSyncExternalStore(subscribeThemeMode, getThemeMode, getThemeMode);
}
