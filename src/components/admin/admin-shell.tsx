import { Activity, BookOpen, ChevronRight, FolderOpen, LayoutDashboard, LogOut, PanelLeft, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { adminStyleSheet, useAdminTheme } from './admin-design';

export type AdminView = 'dashboard' | 'users' | 'categories' | 'documents' | 'training' | 'monitoring';
const navigation = [
  { key: 'dashboard', label: 'Tổng quan', Icon: LayoutDashboard },
  { key: 'users', label: 'Người dùng', Icon: Users },
  { key: 'categories', label: 'Danh mục', Icon: FolderOpen },
  { key: 'documents', label: 'Tài liệu tri thức', Icon: BookOpen },
  { key: 'training', label: 'Huấn luyện AI', Icon: SlidersHorizontal },
  { key: 'monitoring', label: 'Giám sát hệ thống', Icon: Activity },
] as const;

export function AdminShell({ children, view, onNavigate, name, onLogout, isLoggingOut }: {
  children: ReactNode;
  view: AdminView;
  onNavigate: (view: AdminView) => void;
  name: string;
  onLogout: () => void;
  isLoggingOut: boolean;
}) {
  const theme = useAdminTheme();
  const desktop = useWindowDimensions().width >= 1100;
  const styles = adminStyleSheet({
    root: { backgroundColor: theme.screen, flex: 1, flexDirection: desktop ? 'row' : 'column' },
    sidebar: { width: 232, backgroundColor: theme.card, borderRightWidth: 1, borderRightColor: theme.border, padding: 20 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    mark: { backgroundColor: theme.primary, width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    brandName: { color: theme.text, fontSize: 18, fontWeight: '600', letterSpacing: -0.5 },
    brandSub: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
    navTitle: { color: theme.textMuted, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, marginTop: 42, marginBottom: 12, paddingLeft: 10 },
    nav: { flexGrow: 1, gap: 5 },
    navItem: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 42, paddingHorizontal: 11, borderRadius: 7 },
    active: { backgroundColor: theme.primaryPressed },
    hover: { backgroundColor: theme.cardAlt },
    navLabel: { color: theme.textMuted, fontSize: 13, fontWeight: '500' },
    activeLabel: { color: theme.primary },
    spacer: { flex: 1 },
    footer: { borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 18, gap: 16 },
    account: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 34, height: 34, backgroundColor: theme.cardAlt, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: theme.text, fontSize: 13, fontWeight: '600' },
    accountCopy: { flex: 1, minWidth: 0 },
    accountName: { color: theme.text, fontSize: 12, fontWeight: '500' },
    accountRole: { color: theme.textMuted, fontSize: 11, marginTop: 3 },
    main: { flex: 1, minWidth: 0 },
    topbar: { backgroundColor: theme.card, borderBottomColor: theme.border, borderBottomWidth: 1, minHeight: 65, paddingHorizontal: desktop ? 36 : 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
    breadcrumb: { color: theme.textMuted, fontSize: 12 },
    current: { color: theme.text, fontSize: 12, fontWeight: '500' },
    mobileNav: { backgroundColor: theme.card, borderBottomColor: theme.border, borderBottomWidth: 1, flexGrow: 0 },
    mobileNavContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 5 },
    logout: { padding: 8, borderRadius: 6 },
    body: { flex: 1, minHeight: 0 },
  });
  const navItems = navigation.map(({ key, label, Icon }) => (
    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: view === key }} onPress={() => onNavigate(key)}
      style={({ hovered, pressed }) => [styles.navItem, (hovered || pressed) && styles.hover, view === key && styles.active]}>
      <Icon size={17} strokeWidth={1.7} color={view === key ? theme.primary : theme.textMuted} />
      <Text style={[styles.navLabel, view === key && styles.activeLabel]}>{label}</Text>
    </Pressable>
  ));

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.root}>
      {desktop ? <View style={styles.sidebar}>
        <View style={styles.brand}>
          <View style={styles.mark}><PanelLeft size={18} color={theme.textInverse} /></View>
          <View><Text style={styles.brandName}>SFM<Text style={{ color: theme.textMuted, fontWeight: '400' }}> / admin</Text></Text><Text style={styles.brandSub}>Smart Financial Management</Text></View>
        </View>
        <Text style={styles.navTitle}>KHÔNG GIAN QUẢN TRỊ</Text>
        <View style={styles.nav}>{navItems}</View>
        <View style={styles.footer}>
          <View style={styles.account}><View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View><View style={styles.accountCopy}><Text numberOfLines={1} style={styles.accountName}>{name}</Text><Text style={styles.accountRole}>Quản trị viên</Text></View><ShieldCheck color={theme.textMuted} size={16} /></View>
          <Pressable accessibilityRole="button" disabled={isLoggingOut} onPress={onLogout} style={({ hovered }) => [styles.navItem, hovered && styles.hover]}>
            {isLoggingOut ? <ActivityIndicator color={theme.textMuted} size="small" /> : <LogOut size={16} color={theme.textMuted} />}<Text style={styles.navLabel}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View> : null}
      <View style={styles.main}>
        <View style={styles.topbar}>
          {desktop ? <><Text style={styles.breadcrumb}>Không gian quản trị</Text><ChevronRight size={13} color={theme.textMuted} /></> : <Text style={styles.current}>SFM /</Text>}
          <Text style={styles.current}>{navigation.find(item => item.key === view)?.label}</Text>
          <View style={styles.spacer} />
          {desktop ? <><ShieldCheck size={14} color={theme.primary} /><Text style={styles.breadcrumb}>Quản trị viên</Text></> : <Pressable accessibilityRole="button" accessibilityLabel="Đăng xuất" disabled={isLoggingOut} onPress={onLogout} style={styles.logout}>{isLoggingOut ? <ActivityIndicator size="small" color={theme.textMuted} /> : <LogOut size={17} color={theme.textMuted} />}</Pressable>}
        </View>
        {!desktop ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileNav} contentContainerStyle={styles.mobileNavContent}>{navItems}</ScrollView> : null}
        <View style={styles.body}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

