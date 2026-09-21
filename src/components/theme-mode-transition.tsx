import type { ReactNode } from 'react';
import { useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { getNextThemeMode, setThemeMode } from '@/stores/themePreference';
import type { AppTheme } from '@/theme/appTheme';
import type { AppThemeMode } from '@/stores/themePreference';

type UseThemeModeTransitionParams = {
  screenColor: AppTheme['screen'];
  themeMode: AppThemeMode;
};

type ThemeModeIconFrameProps = {
  children: ReactNode;
  style: object;
};

export function ThemeModeIconFrame({ children, style }: ThemeModeIconFrameProps) {
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function useThemeModeTransition({ screenColor, themeMode }: UseThemeModeTransitionParams) {
  const [iconProgress] = useState(() => new Animated.Value(0));
  const [overlayOpacity] = useState(() => new Animated.Value(0));
  const [overlayColor, setOverlayColor] = useState<string | null>(null);

  const iconAnimatedStyle = {
    transform: [
      {
        scale: iconProgress.interpolate({
          inputRange: [0, 0.42, 1],
          outputRange: [1, 0.64, 1],
        }),
      },
      {
        rotate: iconProgress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  };

  async function toggleThemeMode() {
    setOverlayColor(screenColor);
    overlayOpacity.setValue(1);
    iconProgress.setValue(0);

    Animated.timing(iconProgress, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();

    await setThemeMode(getNextThemeMode(themeMode));

    Animated.timing(overlayOpacity, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(() => setOverlayColor(null));
  }

  const transitionOverlay = overlayColor ? (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { backgroundColor: overlayColor, opacity: overlayOpacity }]}
    />
  ) : null;

  return {
    iconAnimatedStyle,
    toggleThemeMode,
    transitionOverlay,
  };
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
  },
});
