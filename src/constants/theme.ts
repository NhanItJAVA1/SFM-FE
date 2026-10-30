/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';
import { appThemes } from '@/theme/appTheme';
import { FontFamily } from '@/theme/typography';

// Compatibility names for template components; palette lives in appTheme.
export const Colors = {
  light: {
    text: appThemes.light.text,
    background: appThemes.light.screen,
    backgroundElement: appThemes.light.cardAlt,
    backgroundSelected: appThemes.light.primaryPressed,
    textSecondary: appThemes.light.textMuted,
  },
  dark: {
    text: appThemes.dark.text,
    background: appThemes.dark.screen,
    backgroundElement: appThemes.dark.cardAlt,
    backgroundSelected: appThemes.dark.primaryPressed,
    textSecondary: appThemes.dark.textMuted,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: FontFamily.regular,
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    rounded: FontFamily.regular,
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: FontFamily.regular,
    serif: 'serif',
    rounded: FontFamily.regular,
    mono: 'monospace',
  },
  web: {
    sans: FontFamily.regular,
    serif: 'var(--font-serif)',
    rounded: FontFamily.regular,
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
