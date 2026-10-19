/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemeMode } from '@/hooks/use-theme-mode';

export function useTheme() {
  return Colors[useThemeMode()];
}
