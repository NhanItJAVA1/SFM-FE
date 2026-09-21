import { useFocusEffect } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

const DEFAULT_DURATION = 220;
const SLIDE_OFFSET = 20;

export type ScreenTransitionVariant = 'fade' | 'slide-up' | 'slide-left' | 'slide-right' | 'scale';

export type ScreenTransitionProps = {
  children?: ReactNode;
  duration?: number;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  triggerKey?: string | number | boolean | null;
  variant?: ScreenTransitionVariant;
};

export function ScreenTransition({
  children,
  duration = DEFAULT_DURATION,
  enabled = true,
  style,
  triggerKey,
  variant = 'slide-up',
}: ScreenTransitionProps) {
  const [progress] = useState(() => new Animated.Value(enabled ? 0 : 1));

  useEffect(() => {
    if (!enabled) {
      progress.setValue(1);
      return;
    }

    progress.stopAnimation();
    progress.setValue(0);

    Animated.timing(progress, {
      duration,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [duration, enabled, progress, triggerKey]);

  const animatedStyle = useMemo(() => {
    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    if (variant === 'fade') {
      return { opacity };
    }

    if (variant === 'scale') {
      return {
        opacity,
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.98, 1],
            }),
          },
        ],
      };
    }

    const initialOffset = variant === 'slide-up' || variant === 'slide-left' ? SLIDE_OFFSET : -SLIDE_OFFSET;
    const translate = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [initialOffset, 0],
    });

    if (variant === 'slide-up') {
      return {
        opacity,
        transform: [{ translateY: translate }],
      };
    }

    return {
      opacity,
      transform: [{ translateX: translate }],
    };
  }, [progress, variant]);

  return <Animated.View style={[styles.container, style, animatedStyle]}>{children}</Animated.View>;
}

export function FocusedScreenTransition(props: ScreenTransitionProps) {
  const [focusTick, setFocusTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setFocusTick((current) => current + 1);
    }, []),
  );

  const triggerKey = `${String(props.triggerKey ?? 'screen')}-${focusTick}`;

  return <ScreenTransition {...props} triggerKey={triggerKey} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
