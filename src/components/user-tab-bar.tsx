import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useContext, useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-text';
import { CurvedTabBarBackground, CREATE_BUTTON_SIZE, CREATE_BUTTON_TOP, CURVED_TAB_BAR_HEIGHT, TAB_BAR_RAISE } from '@/components/curved-tab-bar-background';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Typography } from '@/theme/typography';

const visibleTabs = new Set(['home', 'transactions', 'create', 'budgets', 'user']);

export function UserTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useAppTheme();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const bottomInset = Math.max(insets.bottom, 6);
  const horizontalInset = Math.max(insets.left, insets.right);
  const height = CURVED_TAB_BAR_HEIGHT + bottomInset;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (StyleSheet.flatten(focusedOptions.tabBarStyle)?.display === 'none'
    || (focusedOptions.tabBarHideOnKeyboard && keyboardVisible)) return null;

  function pressTab(key: string, focused: boolean) {
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigateToTab(key);
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { height }]}
      onLayout={({ nativeEvent }) => reportHeight?.(nativeEvent.layout.height)}
    >
      <CurvedTabBarBackground height={height} />
      <View pointerEvents="box-none" accessibilityRole="tablist" style={[styles.row, { left: horizontalInset, right: horizontalInset }]}>
        {state.routes.filter((route) => visibleTabs.has(route.name)).map((route) => {
          const { options } = descriptors[route.key];
          const focused = state.routes[state.index].key === route.key;
          const color = focused ? theme.text : theme.textSubtle;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;

          if (route.name === 'create') return <View key={route.key} pointerEvents="none" style={styles.centerSpace} />;

          return (
            <View key={route.key} pointerEvents="box-none" style={styles.cell}>
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                accessibilityState={{ selected: focused }}
                testID={options.tabBarButtonTestID}
                android_ripple={undefined}
                onPress={() => pressTab(route.key, focused)}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                style={({ pressed, hovered, focused: hasFocus }) => [
                  styles.tabButton,
                  {
                    backgroundColor: pressed || hovered ? theme.primaryPressed : 'transparent',
                    borderColor: hasFocus ? theme.primary : 'transparent',
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <View style={styles.icon}>{options.tabBarIcon?.({ focused, color, size: 22 })}</View>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15} style={[styles.label, { color, fontWeight: focused ? '600' : '500' }]}>{label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      {state.routes.filter((route) => route.name === 'create').map((route) => {
        const { options } = descriptors[route.key];
        const focused = state.routes[state.index].key === route.key;
        return (
          <View key={route.key} pointerEvents="box-none" style={styles.centerButton}>
            {options.tabBarButton?.({
              children: null,
              style: styles.centerControl,
              accessibilityRole: 'tab',
              accessibilityLabel: options.tabBarAccessibilityLabel ?? 'Tạo giao dịch',
              accessibilityState: { selected: focused },
              onPress: () => pressTab(route.key, focused),
              onLongPress: () => emitter.emit({ type: 'tabLongPress', target: route.key }),
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'transparent', zIndex: 20 },
  row: { position: 'absolute', top: TAB_BAR_RAISE + 4, height: 54, flexDirection: 'row' },
  cell: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  tabButton: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 1 },
  icon: { height: 26, alignItems: 'center', justifyContent: 'center' },
  label: { ...Typography.tab, marginTop: 2, width: '100%', textAlign: 'center', includeFontPadding: false },
  centerSpace: { width: 80 },
  centerButton: { position: 'absolute', top: CREATE_BUTTON_TOP, left: '50%', marginLeft: -CREATE_BUTTON_SIZE / 2, width: CREATE_BUTTON_SIZE, height: CREATE_BUTTON_SIZE },
  centerControl: { width: CREATE_BUTTON_SIZE, height: CREATE_BUTTON_SIZE },
});
