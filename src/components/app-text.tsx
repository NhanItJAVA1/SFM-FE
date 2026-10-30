import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { interFont, resolveTypography, Typography } from '@/theme/typography';

const FontsReadyContext = createContext(false);
const NestedTextContext = createContext(false);

export function AppTypographyProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <FontsReadyContext value={ready}>{children}</FontsReadyContext>;
}

export function useInterFont(weight: Parameters<typeof interFont>[0] = '400') {
  const ready = useContext(FontsReadyContext);
  return useMemo(() => interFont(weight, ready), [weight, ready]);
}

/** Preserve native props, accessibility, nested text inheritance and native refs. */
export function AppText({ style, children, ...props }: ComponentProps<typeof Text>) {
  const ready = useContext(FontsReadyContext);
  const nested = useContext(NestedTextContext);

  return (
    <Text {...props} style={resolveTypography(StyleSheet.flatten(style) ?? undefined, ready, nested)}>
      <NestedTextContext value={true}>{children}</NestedTextContext>
    </Text>
  );
}

export function AppTextInput({ style, ...props }: ComponentProps<typeof TextInput>) {
  const ready = useContext(FontsReadyContext);

  return <TextInput {...props} style={resolveTypography(StyleSheet.flatten(style) ?? undefined, ready, false, Typography.bodyLarge)} />;
}
