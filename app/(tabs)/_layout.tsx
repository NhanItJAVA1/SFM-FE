import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { getAuthAccessToken } from '@/stores/authSession';

type TabIconName = 'home' | 'ledger' | 'plus' | 'budget' | 'account';

const tabIcons: Record<TabIconName, string> = {
  home: '⌂',
  ledger: '▤',
  plus: '+',
  budget: '▧',
  account: '♙',
};

function TabIcon({ name, focused }: { name: TabIconName; focused: boolean }) {
  if (name === 'plus') {
    return (
      <View style={styles.addButton}>
        <Text style={styles.addIcon}>{tabIcons.plus}</Text>
      </View>
    );
  }

  return <Text style={[styles.icon, focused && styles.iconFocused]}>{tabIcons[name]}</Text>;
}

export default function TabsLayout() {
  if (!getAuthAccessToken()) {
    return <Redirect href="/auth/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#f7f8fb',
        tabBarInactiveTintColor: '#7a7f87',
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Tổng quan',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Sổ giao dịch',
          tabBarIcon: ({ focused }) => <TabIcon name="ledger" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan-bill"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => <TabIcon name="plus" focused={focused} />,
          tabBarLabel: () => null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Ngân sách',
          tabBarIcon: ({ focused }) => <TabIcon name="budget" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Tài khoản',
          tabBarIcon: ({ focused }) => <TabIcon name="account" focused={focused} />,
        }}
      />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#030508',
    borderTopColor: '#030508',
    height: 64,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabItem: {
    minHeight: 52,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  icon: {
    color: '#7a7f87',
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 26,
  },
  iconFocused: {
    color: '#f7f8fb',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#31c452',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    marginBottom: 12,
    width: 52,
  },
  addIcon: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 34,
  },
});
