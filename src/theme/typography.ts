import type { TextStyle } from 'react-native';

export const FontFamily = {
  regular: 'AppInter',
  medium: 'AppInterMedium',
  semibold: 'AppInterSemiBold',
  bold: 'AppInterBold',
} as const;

/** Shared roles; font files are selected by AppText/AppTextInput at render time. */
export const Typography = {
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  button: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  section: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  amount: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  tab: { fontSize: 11, lineHeight: 16, fontWeight: '500' },
} satisfies Record<string, TextStyle>;

/** Select a real font face instead of asking Android/iOS to synthesize bold. */
export function interFont(weight: TextStyle['fontWeight'] = '400', fontsReady = true): TextStyle {
  const numericWeight = weight === 'bold' ? 700 : weight === 'normal' ? 400 : Number(weight);
  const normalizedWeight = numericWeight >= 700 ? '700' : numericWeight >= 600 ? '600' : numericWeight >= 500 ? '500' : '400';

  if (!fontsReady) {
    return { fontWeight: normalizedWeight };
  }

  return {
    fontFamily: normalizedWeight === '700' ? FontFamily.bold : normalizedWeight === '600' ? FontFamily.semibold
      : normalizedWeight === '500' ? FontFamily.medium : FontFamily.regular,
    fontWeight: 'normal',
  };
}

/** Nested text inherits its parent's size/face unless it explicitly changes them. */
export function resolveTypography(style: TextStyle = {}, fontsReady = true, nested = false, base: TextStyle = Typography.body): TextStyle {
  const resolved: TextStyle = {
    ...(!nested && base),
    ...style,
    ...(style.fontSize !== undefined && style.lineHeight === undefined
      ? { lineHeight: Math.ceil(style.fontSize * 1.4) } : {}),
  };

  // Code and other explicit font families keep their own weight behavior.
  if (!style.fontFamily && (!nested || style.fontWeight !== undefined)) {
    return { ...resolved, ...interFont(resolved.fontWeight, fontsReady) };
  }

  return resolved;
}
