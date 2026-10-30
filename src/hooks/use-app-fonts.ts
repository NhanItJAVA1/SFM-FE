import { useFonts } from 'expo-font';

import { FontFamily } from '@/theme/typography';

export function useAppFonts() {
  return useFonts({
    [FontFamily.regular]: require('../../assets/fonts/inter/Inter-Regular.ttf'),
    [FontFamily.medium]: require('../../assets/fonts/inter/Inter-Medium.ttf'),
    [FontFamily.semibold]: require('../../assets/fonts/inter/Inter-SemiBold.ttf'),
    [FontFamily.bold]: require('../../assets/fonts/inter/Inter-Bold.ttf'),
  });
}
