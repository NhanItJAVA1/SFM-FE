import { appThemes } from '@/theme/appTheme';

import { useThemeMode } from './use-theme-mode';

export function useAppTheme() {
  return appThemes[useThemeMode()];
}
