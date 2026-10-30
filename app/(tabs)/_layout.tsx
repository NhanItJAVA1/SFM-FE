import { Redirect, router, Tabs } from "expo-router";
import { ChartPie, House, ListOrdered, Plus, UserRound } from "lucide-react-native";
import { type ComponentProps, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from "@/hooks/use-app-theme";
import { getAuthAccessToken } from "@/stores/authSession";
import { clearSpendingStatsFromTransactions } from "@/stores/spendingStatsNavigation";
import { emitUserTabPress } from "@/stores/userTabPress";
import type { AppTheme } from "@/theme/appTheme";
import { CREATE_BUTTON_SIZE, CURVED_TAB_BAR_HEIGHT } from '@/components/curved-tab-bar-background';
import { UserTabBar } from '@/components/user-tab-bar';

type TabIconName = "home" | "ledger" | "budget" | "user";

const tabIcons = {
  home: House,
  ledger: ListOrdered,
  budget: ChartPie,
  user: UserRound,
};

function TabIcon({ name, focused, theme }: { name: TabIconName; focused: boolean; theme: AppTheme }) {
  const Icon = tabIcons[name];
  return <Icon size={22} strokeWidth={focused ? 2.2 : 1.8} color={focused ? theme.text : theme.textSubtle} />;
}

type CreateTabButtonProps = Omit<ComponentProps<typeof Pressable>, "ref"> & {
  ref?: unknown;
};

function CreateTabButton({
  children: _children,
  onLongPress,
  onPress,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  ref: _ref,
  style,
  ...props
}: CreateTabButtonProps) {
  const theme = useAppTheme();
  const lastLongPressAt = useRef(0);
  const [pressScale] = useState(() => new Animated.Value(1));

  function animatePressScale(toValue: number) {
    Animated.timing(pressScale, {
      duration: 130,
      easing: Easing.out(Easing.cubic),
      toValue,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Pressable
      {...props}
      android_ripple={undefined}
      style={(state) => [typeof style === 'function' ? style(state) : style, styles.createTabButton]}
      accessibilityHint="Nhấn giữ để quét hóa đơn"
      onPressIn={(event) => {
        animatePressScale(0.94);
        onPressIn?.(event);
      }}
      onLongPress={(event) => {
        lastLongPressAt.current = Date.now();
        animatePressScale(0.98);
        onLongPress?.(event);
        router.push("/scan-bill");
      }}
      onPress={(event) => {
        if (Date.now() - lastLongPressAt.current < 700) {
          return;
        }

        onPress?.(event);
      }}
      onPressOut={(event) => {
        animatePressScale(1);
        onPressOut?.(event);
      }}
      onHoverIn={(event) => { animatePressScale(0.98); onHoverIn?.(event); }}
      onHoverOut={(event) => { animatePressScale(1); onHoverOut?.(event); }}
    >
      <Animated.View style={[styles.addButton, { backgroundColor: theme.primary, transform: [{ scale: pressScale }] }]}>
        <Plus size={30} strokeWidth={2.4} color={theme.textInverse} />
      </Animated.View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 6);
  const tabBarHeight = CURVED_TAB_BAR_HEIGHT + bottomInset;

  if (!getAuthAccessToken()) {
    return <Redirect href="/auth/login" />;
  }

  return (
    <Tabs
      tabBar={(props) => <UserTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textSubtle,
        tabBarStyle: [
          styles.tabBar,
          { height: tabBarHeight, paddingBottom: bottomInset },
        ],
      }}
    >
      <Tabs.Screen
        name="home"
        listeners={{
          tabPress: clearSpendingStatsFromTransactions,
        }}
        options={{
          title: "Tổng quan",
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} theme={theme} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        listeners={{
          tabPress: clearSpendingStatsFromTransactions,
        }}
        options={{
          title: "Sổ giao dịch",
          tabBarIcon: ({ focused }) => <TabIcon name="ledger" focused={focused} theme={theme} />,
        }}
      />
      <Tabs.Screen
        name="create"
        listeners={{
          tabPress: clearSpendingStatsFromTransactions,
        }}
        options={{
          tabBarHideOnKeyboard: true,
          title: "",
          tabBarAccessibilityLabel: 'Tạo giao dịch',
          tabBarButton: (props) => <CreateTabButton {...props} />,
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="budgets"
        listeners={{
          tabPress: clearSpendingStatsFromTransactions,
        }}
        options={{
          title: "Ngân sách",
          tabBarIcon: ({ focused }) => <TabIcon name="budget" focused={focused} theme={theme} />,
        }}
      />
      <Tabs.Screen
        name="user"
        listeners={{
          tabPress: () => {
            clearSpendingStatsFromTransactions();
            emitUserTabPress();
          },
        }}
        options={{
          title: "Cá nhân",
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} theme={theme} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0, shadowOpacity: 0 },
  createTabButton: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: CREATE_BUTTON_SIZE / 2, overflow: 'hidden', backgroundColor: 'transparent' },
  addButton: { alignItems: 'center', justifyContent: 'center', borderRadius: CREATE_BUTTON_SIZE / 2, height: CREATE_BUTTON_SIZE, width: CREATE_BUTTON_SIZE },
});
