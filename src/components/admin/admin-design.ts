import { isLoaded, useFonts } from 'expo-font';
import { StyleSheet, type TextStyle } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemeMode } from '@/hooks/use-theme-mode';

export function useAdminFonts() {
  return useFonts({
    AdminInter: require('../../../assets/fonts/inter/Inter-Regular.ttf'),
    AdminInterMedium: require('../../../assets/fonts/inter/Inter-Medium.ttf'),
    AdminInterSemiBold: require('../../../assets/fonts/inter/Inter-SemiBold.ttf'),
  });
}

export function useAdminTheme() {
  const theme = useAppTheme();
  const mode = useThemeMode();

  return {
    ...theme,
    ...(mode === 'light' ? {
      screen: '#f7f8fa', card: '#ffffff', cardAlt: '#f2f4f7', sheet: '#ffffff',
      border: '#e5e8ed', text: '#202735', textMuted: '#717987', textInverse: '#ffffff',
      primary: '#28765b', primaryPressed: '#edf5f0', avatar: '#64768a',
    } : {
      screen: '#14171c', card: '#1b1f26', cardAlt: '#232830', sheet: '#1b1f26',
      border: '#2b313b', text: '#e7eaf0', textMuted: '#949dab', textInverse: '#12251c',
      primary: '#80c5a6', primaryPressed: '#21382e', avatar: '#516579',
    }),
  };
}

export type AdminTheme = ReturnType<typeof useAdminTheme>;

/** Give every admin text style a consistent, locally bundled font, including sheets. */
export function adminStyleSheet<T extends StyleSheet.NamedStyles<T>>(styles: T): T {
  const fontsReady = isLoaded('AdminInter');
  for (const key in styles) {
    const style = styles[key] as TextStyle;
    if (style.fontSize !== undefined || style.fontWeight !== undefined) {
      const weight = Number(style.fontWeight ?? 400);
      styles[key] = {
        ...style,
        ...(fontsReady ? {
          fontFamily: weight >= 600 ? 'AdminInterSemiBold' : weight >= 500 ? 'AdminInterMedium' : 'AdminInter',
          fontWeight: 'normal',
        } : { fontWeight: weight >= 600 ? '600' : weight >= 500 ? '500' : '400' }),
      } as T[typeof key];
    }
  }
  return StyleSheet.create(styles);
}
