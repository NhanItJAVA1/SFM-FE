import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AccountType, FinancialAccount, financialAccountApi } from '@/api/financialAccountApi';
import { authApi } from '@/api/authApi';
import { setApiAccessToken } from '@/api/axiosClient';
import { getAuthRefreshToken, getAuthUser, setAuthRefreshToken, setAuthUser } from '@/stores/authSession';

const accountTypes: { label: string; value: AccountType }[] = [
  { label: 'Cash', value: 'Cash' },
  { label: 'Bank', value: 'Bank' },
  { label: 'E-Wallet', value: 'EWallet' },
  { label: 'Credit Card', value: 'CreditCard' },
  { label: 'Savings', value: 'Savings' },
];

type AccountView = 'menu' | 'manage' | 'wallets' | 'create';

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('vi-VN', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

export default function AccountsScreen() {
  const user = getAuthUser();
  const initial = (user?.displayName ?? user?.username ?? 'U').trim().charAt(0).toUpperCase() || 'U';
  const [view, setView] = useState<AccountView>('menu');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('Cash');
  const [currency, setCurrency] = useState('VND');
  const [initialBalance, setInitialBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const totalBalance = useMemo(
    () => accounts.reduce((total, account) => total + account.initialBalance, 0),
    [accounts]
  );

  const loadAccounts = useCallback(async (mode: 'loading' | 'refreshing' = 'loading') => {
    try {
      if (mode === 'refreshing') {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const response = await financialAccountApi.list();
      setAccounts(response.data);
    } catch (error) {
      Alert.alert('Không tải được ví', error instanceof Error ? error.message : 'Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'wallets') {
      const timeoutId = setTimeout(() => {
        loadAccounts();
      }, 0);

      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [loadAccounts, view]);

  async function handleCreateAccount() {
    const trimmedName = name.trim();
    const trimmedCurrency = currency.trim().toUpperCase();
    const normalizedBalance = initialBalance.trim().replace(/,/g, '');
    const parsedBalance = Number(normalizedBalance || '0');

    if (!trimmedName) {
      Alert.alert('Thiếu tên ví', 'Vui lòng nhập tên tài khoản.');
      return;
    }

    if (!trimmedCurrency) {
      Alert.alert('Thiếu tiền tệ', 'Vui lòng nhập mã tiền tệ, ví dụ VND.');
      return;
    }

    if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
      Alert.alert('Số dư không hợp lệ', 'Số dư ban đầu phải là số lớn hơn hoặc bằng 0.');
      return;
    }

    try {
      setIsSubmitting(true);
      await financialAccountApi.create({
        name: trimmedName,
        type,
        currency: trimmedCurrency,
        initialBalance: parsedBalance,
      });
      setName('');
      setType('Cash');
      setCurrency('VND');
      setInitialBalance('');
      setView('wallets');
      await loadAccounts();
    } catch (error) {
      Alert.alert('Tạo ví thất bại', error instanceof Error ? error.message : 'Không thể tạo tài khoản.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      setIsLoggingOut(true);
      const refreshToken = getAuthRefreshToken();

      await authApi.logout(refreshToken ? { refreshToken } : undefined);
    } catch {
      // Local logout should still proceed if the server cannot clear the refresh token.
    } finally {
      setApiAccessToken(null);
      setAuthUser(null);
      setAuthRefreshToken(null);
      setIsLoggingOut(false);
      router.replace('/auth/login');
    }
  }

  if (view === 'manage') {
    return (
      <View style={styles.screen}>
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView('menu')} hitSlop={12}>
            <Text style={styles.backText}>‹ Tài khoản</Text>
          </Pressable>
          <Text style={styles.topTitle}>Quản lý tài khoản</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.manageContent}>
          <View style={styles.profileMiniCard}>
            <View style={styles.smallAvatar}>
              <Text style={styles.smallAvatarText}>{initial}</Text>
            </View>
            <View style={styles.manageTextGroup}>
              <Text style={styles.manageTitle}>{user?.username ?? 'Người dùng'}</Text>
              <Text style={styles.manageSubtitle}>{user?.email ?? 'Chưa có email'}</Text>
            </View>
          </View>

          <Pressable
            style={[styles.logoutButton, isLoggingOut && styles.buttonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.logoutButtonText}>Đăng xuất</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  if (view === 'create') {
    return (
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <Pressable onPress={() => setView('wallets')} hitSlop={12}>
              <Text style={styles.backText}>‹ Ví của tôi</Text>
            </Pressable>
            <Text style={styles.topTitle}>Thêm ví</Text>
            <View style={styles.topSpacer} />
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Tên ví</Text>
              <TextInput
                placeholder="Cash wallet"
                placeholderTextColor="#6f7682"
                style={styles.input}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Loại tài khoản</Text>
              <View style={styles.typeGrid}>
                {accountTypes.map((accountType) => {
                  const isSelected = accountType.value === type;

                  return (
                    <Pressable
                      key={accountType.value}
                      style={[styles.typeOption, isSelected && styles.typeOptionSelected]}
                      onPress={() => setType(accountType.value)}
                    >
                      <Text style={[styles.typeOptionText, isSelected && styles.typeOptionTextSelected]}>
                        {accountType.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.currencyField]}>
                <Text style={styles.label}>Tiền tệ</Text>
                <TextInput
                  autoCapitalize="characters"
                  maxLength={3}
                  placeholder="VND"
                  placeholderTextColor="#6f7682"
                  style={styles.input}
                  value={currency}
                  onChangeText={setCurrency}
                />
              </View>

              <View style={[styles.field, styles.balanceField]}>
                <Text style={styles.label}>Số dư ban đầu</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="1000000"
                  placeholderTextColor="#6f7682"
                  style={styles.input}
                  value={initialBalance}
                  onChangeText={setInitialBalance}
                />
              </View>
            </View>

            <Pressable
              style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
              onPress={handleCreateAccount}
              disabled={isSubmitting}
            >
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Tạo ví</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (view === 'wallets') {
    return (
      <View style={styles.screen}>
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView('menu')} hitSlop={12}>
            <Text style={styles.backText}>‹ Tài khoản</Text>
          </Pressable>
          <Text style={styles.topTitle}>Ví của tôi</Text>
          <Pressable style={styles.addWalletButton} onPress={() => setView('create')}>
            <Text style={styles.addWalletText}>+</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.walletList}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadAccounts('refreshing')} tintColor="#fff" />}
        >
          <View style={styles.balanceSummary}>
            <Text style={styles.summaryLabel}>Tổng số dư</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalBalance, accounts[0]?.currency ?? 'VND')}</Text>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#31c452" />
          ) : accounts.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có ví nào. Bấm + để thêm ví đầu tiên.</Text>
          ) : (
            accounts.map((account) => (
              <View key={account.id} style={styles.walletCard}>
                <View style={styles.walletIcon}>
                  <Text style={styles.walletIconText}>▣</Text>
                </View>
                <View style={styles.walletInfo}>
                  <Text style={styles.walletName}>{account.name}</Text>
                  <Text style={styles.walletType}>{account.type}</Text>
                </View>
                <Text style={styles.walletBalance}>{formatMoney(account.initialBalance, account.currency)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerSide} />
        <Text style={styles.pageTitle}>Tài khoản</Text>
        <Text style={styles.supportText}>Hỗ trợ ?</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.username}>{user?.username ?? 'Người dùng'}</Text>
        <Text style={styles.email}>{user?.email ?? 'Chưa có email'}</Text>

        <View style={styles.divider} />

        <Pressable style={styles.manageRow} onPress={() => setView('manage')}>
          <Text style={styles.manageIcon}>♙</Text>
          <View style={styles.manageTextGroup}>
            <Text style={styles.manageTitle}>Quản lý tài khoản</Text>
            <Text style={styles.manageSubtitle}>Tài khoản miễn phí</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.menuCard}>
        <Pressable style={styles.menuRow} onPress={() => setView('wallets')}>
          <Text style={styles.menuIcon}>▰</Text>
          <Text style={styles.menuText}>Ví của tôi</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020204' },
  content: { padding: 24, paddingBottom: 96 },
  headerRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 32, marginTop: 36 },
  headerSide: { flex: 1 },
  pageTitle: { color: '#fff', flex: 1, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  supportText: { color: '#fff', flex: 1, fontSize: 16, textAlign: 'right' },
  profileCard: { backgroundColor: '#1e1e1f', borderRadius: 8, overflow: 'hidden', paddingTop: 34 },
  avatar: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#2fa9df',
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    marginBottom: 16,
    width: 88,
  },
  avatarText: { color: '#fff', fontSize: 44, fontWeight: '500' },
  username: { color: '#fff', fontSize: 23, fontWeight: '600', textAlign: 'center' },
  email: { color: '#9698a1', fontSize: 17, marginTop: 6, textAlign: 'center' },
  divider: { backgroundColor: '#303039', height: 1, marginTop: 34 },
  manageRow: { alignItems: 'center', flexDirection: 'row', minHeight: 78, paddingHorizontal: 22 },
  manageIcon: { color: '#fff', fontSize: 30, width: 46 },
  manageTextGroup: { flex: 1 },
  manageTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  manageSubtitle: { color: '#9698a1', fontSize: 16, marginTop: 3 },
  manageContent: { gap: 18, padding: 20 },
  profileMiniCard: { alignItems: 'center', backgroundColor: '#1e1e1f', borderRadius: 8, flexDirection: 'row', minHeight: 84, padding: 18 },
  smallAvatar: { alignItems: 'center', backgroundColor: '#2fa9df', borderRadius: 24, height: 48, justifyContent: 'center', marginRight: 14, width: 48 },
  smallAvatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  logoutButton: { alignItems: 'center', backgroundColor: '#d83b3b', borderRadius: 8, justifyContent: 'center', minHeight: 52 },
  logoutButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chevron: { color: '#6f727b', fontSize: 40, lineHeight: 42 },
  menuCard: { backgroundColor: '#1e1e1f', borderRadius: 8, marginTop: 34, overflow: 'hidden' },
  menuRow: { alignItems: 'center', flexDirection: 'row', minHeight: 76, paddingHorizontal: 22 },
  menuIcon: { color: '#fff', fontSize: 30, width: 46 },
  menuText: { color: '#fff', flex: 1, fontSize: 22, fontWeight: '500' },
  walletHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  backText: { color: '#31c452', fontSize: 17, fontWeight: '700' },
  topTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 32,
  },
  topSpacer: { width: 82 },
  addWalletButton: {
    alignItems: 'center',
    backgroundColor: '#31c452',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  addWalletText: { color: '#fff', fontSize: 30, fontWeight: '500', lineHeight: 33 },
  walletList: { gap: 14, padding: 20, paddingBottom: 96 },
  balanceSummary: { backgroundColor: '#1e1e1f', borderRadius: 8, padding: 18 },
  summaryLabel: { color: '#9698a1', fontSize: 14, marginBottom: 4 },
  summaryValue: { color: '#fff', fontSize: 26, fontWeight: '700' },
  walletCard: { alignItems: 'center', backgroundColor: '#1e1e1f', borderRadius: 8, flexDirection: 'row', minHeight: 78, padding: 16 },
  walletIcon: { alignItems: 'center', backgroundColor: '#303039', borderRadius: 20, height: 40, justifyContent: 'center', marginRight: 14, width: 40 },
  walletIconText: { color: '#fff', fontSize: 20 },
  walletInfo: { flex: 1 },
  walletName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  walletType: { color: '#9698a1', fontSize: 14, marginTop: 3 },
  walletBalance: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyText: { color: '#9698a1', fontSize: 16, lineHeight: 23, marginTop: 18, textAlign: 'center' },
  form: { gap: 18, paddingTop: 28 },
  field: { gap: 8 },
  label: { color: '#f4f6f8', fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: '#1e1e1f',
    borderColor: '#303039',
    borderRadius: 8,
    borderWidth: 1,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeOption: {
    alignItems: 'center',
    backgroundColor: '#1e1e1f',
    borderColor: '#303039',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 104,
    paddingHorizontal: 14,
  },
  typeOptionSelected: { backgroundColor: '#31c452', borderColor: '#31c452' },
  typeOptionText: { color: '#c8cbd2', fontWeight: '700' },
  typeOptionTextSelected: { color: '#fff' },
  row: { flexDirection: 'row', gap: 12 },
  currencyField: { flex: 0.8 },
  balanceField: { flex: 1.4 },
  primaryButton: { alignItems: 'center', backgroundColor: '#31c452', borderRadius: 8, justifyContent: 'center', minHeight: 50 },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
