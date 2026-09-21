import { Redirect, router, Tabs } from "expo-router";
import { type ComponentProps, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/hooks/use-app-theme";
import { getAuthAccessToken } from "@/stores/authSession";
import type { AppTheme } from "@/theme/appTheme";

type TabIconName = "home" | "ledger" | "plus" | "budget" | "user";

const tabIcons: Record<TabIconName, string> = {
  home: "⌂",
  ledger: "▤",
  plus: "+",
  budget: "▧",
  user: "♙",
};

function TabIcon({ name, focused, theme }: { name: TabIconName; focused: boolean; theme: AppTheme }) {
  if (name === "plus") {
    return (
      <View style={[styles.addButton, { backgroundColor: theme.primary }]}>
        <Text style={[styles.addIcon, { color: theme.textInverse }]}>{tabIcons.plus}</Text>
      </View>
    );
  }

  return <Text style={[styles.icon, { color: focused ? theme.text : theme.textSubtle }]}>{tabIcons[name]}</Text>;
}

type CreateTabButtonProps = Omit<ComponentProps<typeof Pressable>, "ref"> & {
  ref?: unknown;
};

function CreateTabButton({
  children,
  onLongPress,
  onPress,
  onPressIn,
  onPressOut,
  ref: _ref,
  ...props
}: CreateTabButtonProps) {
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
      onPressIn={(event) => {
        animatePressScale(1.14);
        onPressIn?.(event);
      }}
      onLongPress={(event) => {
        lastLongPressAt.current = Date.now();
        animatePressScale(1.24);
        onLongPress?.(event);
        router.push("/(tabs)/scan-bill");
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
    >
      {(state) => (
        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          {typeof children === "function" ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}

export default function TabsLayout() {
  const theme = useAppTheme();

  if (!getAuthAccessToken()) {
    return <Redirect href="/auth/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textSubtle,
        tabBarLabelStyle: styles.label,
        tabBarStyle: [
          styles.tabBar,
          { backgroundColor: theme.tabBar, borderTopColor: theme.tabBorder },
        ],
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Tổng quan",
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} theme={theme} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Sổ giao dịch",
          tabBarIcon: ({ focused }) => <TabIcon name="ledger" focused={focused} theme={theme} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          tabBarButton: (props) => <CreateTabButton {...props} />,
          tabBarIcon: ({ focused }) => <TabIcon name="plus" focused={focused} theme={theme} />,
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="scan-bill"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: "Ngân sách",
          tabBarIcon: ({ focused }) => <TabIcon name="budget" focused={focused} theme={theme} />,
        }}
      />
      <Tabs.Screen
        name="user"
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
  tabBar: {
    height: 64,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabItem: {
    minHeight: 52,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  icon: {
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 26,
  },
  addButton: {
    alignItems: "center",
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    marginBottom: 12,
    width: 52,
  },
  addIcon: {
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 34,
  },
});
