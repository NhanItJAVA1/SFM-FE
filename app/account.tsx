import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, ArrowRightLeft, Check, CheckCircle2, ChevronRight, LockKeyhole, Pencil, Plus, Trash2, Wallet, X, type LucideIcon } from 'lucide-react-native';
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { financialAccountApi, type AccountType, type FinancialAccount } from '@/api/financialAccountApi';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-text';
import { MoneyInput } from '@/components/money-input';
import { BottomPopup, BottomPopupSheet } from '@/components/bottom-popup';
import { AccountIcon, accountTypes, getAccountTypeMeta, WalletCard } from '@/components/wallet-card';
import { ScreenGradientBackground } from '@/components/screen-gradient-background';
import { FocusedScreenTransition } from '@/components/screen-transition';
import { invalidateAIAnalysis } from '@/hooks/use-ai-analysis';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { AppTheme } from '@/theme/appTheme';
import { Typography } from '@/theme/typography';
import { getAccountCurrentBalance } from '@/utils/accountBalance';
import { formatCashflowAmount } from '@/utils/walletCashflow';

type AccountStyles = ReturnType<typeof createStyles>;

export default function AccountScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [view, setView] = useState<'wallets' | 'form'>('wallets');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('Cash');
  const [initialBalance, setInitialBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const hasLoaded = useRef(false);
  const formScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const initialBalanceRef = useRef<ComponentRef<typeof TextInput>>(null);
  const balanceFocused = useRef(false);
  const scrollFrame = useRef<number | null>(null);

  const revealInitialBalance = useCallback(() => {
    if (!balanceFocused.current) return;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      if (balanceFocused.current) formScrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', revealInitialBalance);
    return () => {
      subscription.remove();
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    };
  }, [revealInitialBalance]);

  const activeAccounts = accounts.filter(account => account.isActive);
  const balanceGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const account of accounts.filter(row => row.isActive)) {
      const key = account.currency.trim().toUpperCase();
      groups.set(key, (groups.get(key) ?? 0) + getAccountCurrentBalance(account));
    }
    return [...groups.entries()];
  }, [accounts]);

  const loadAccounts = useCallback(async (mode: 'loading' | 'refreshing' | 'silent' = 'loading') => {
    const request = ++generation.current;
    if (mode === 'loading') setIsLoading(true);
    if (mode === 'refreshing') setIsRefreshing(true);
    setLoadError(null);
    try {
      const response = await financialAccountApi.list();
      if (request !== generation.current) return;
      setAccounts(Array.isArray(response.data) ? response.data : []);
      hasLoaded.current = true;
    } catch {
      if (request === generation.current) setLoadError('Không tải được danh sách ví. Vui lòng thử lại.');
    } finally {
      if (request === generation.current) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (view === 'wallets') void loadAccounts(hasLoaded.current ? 'silent' : 'loading');
    return () => { generation.current++; };
  }, [loadAccounts, view]));

  function openForm(account?: FinancialAccount) {
    setEditingAccount(account ?? null);
    setName(account?.name ?? '');
    setType(account?.type ?? 'Cash');
    balanceFocused.current = false;
    setInitialBalance(account ? String(account.initialBalance) : '');
    setFormError(null); setNotice(null); setSelectedAccount(null);
    setView('form');
  }

  function closeForm() {
    if (busy.current) return;
    balanceFocused.current = false;
    Keyboard.dismiss(); setEditingAccount(null); setFormError(null); setView('wallets');
  }

  async function saveAccount() {
    if (busy.current) return;
    const trimmedName = name.trim();
    const parsedBalance = Number(initialBalance.trim().replace(/,/g, '') || '0');
    let validationError: string | null = null;
    if (!trimmedName) validationError = 'Bạn hãy đặt tên cho ví.';
    else if (!editingAccount && (!Number.isFinite(parsedBalance) || parsedBalance < 0)) validationError = 'Số dư ban đầu phải lớn hơn hoặc bằng 0.';
    if (validationError) {
      balanceFocused.current = false;
      Keyboard.dismiss();
      setFormError(validationError);
      formScrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    balanceFocused.current = false;
    busy.current = true; setIsSubmitting(true); setFormError(null); Keyboard.dismiss();
    try {
      if (editingAccount) {
        await financialAccountApi.update(editingAccount.id, { name: trimmedName, type, currency: editingAccount.currency, isActive: editingAccount.isActive });
      } else {
        await financialAccountApi.create({ name: trimmedName, type, currency: 'VND', initialBalance: parsedBalance });
      }
      invalidateAIAnalysis();
      setNotice(editingAccount ? 'Đã cập nhật thông tin ví.' : 'Đã thêm ví mới.');
      setEditingAccount(null); setView('wallets');
    } catch {
      setFormError('Chưa thể lưu ví. Vui lòng kiểm tra kết nối và thử lại.');
      formScrollRef.current?.scrollTo({ y: 0, animated: true });
    } finally { busy.current = false; setIsSubmitting(false); }
  }

  function closeActions() {
    if (busy.current) return;
    setSelectedAccount(null); setDeleteError(null);
  }

  async function deleteAccount() {
    if (!selectedAccount || busy.current) return;
    busy.current = true; setIsDeleting(true); setDeleteError(null);
    try {
      await financialAccountApi.delete(selectedAccount.id);
      setAccounts(current => current.filter(account => account.id !== selectedAccount.id));
      invalidateAIAnalysis();
      setNotice('Đã xóa ví.'); setSelectedAccount(null);
    } catch {
      setDeleteError('Chưa thể xóa ví. Vui lòng thử lại.');
    } finally { busy.current = false; setIsDeleting(false); }
  }

  const previewBalance = editingAccount ? getAccountCurrentBalance(editingAccount) : Number(initialBalance.replace(/,/g, '') || '0');
  const previewCurrency = editingAccount?.currency ?? 'VND';
  const selectedType = getAccountTypeMeta(type);

  return (
    <FocusedScreenTransition style={styles.screen} triggerKey={view} variant={view === 'form' ? 'slide-left' : 'fade'} reanimateOnFocus={false}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenGradientBackground darkOnly />
        <KeyboardAvoidingView style={styles.screenBody} enabled={view === 'form' && Platform.OS !== 'web'} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={view === 'form' ? 'Quay lại danh sách ví' : 'Quay lại'} disabled={isSubmitting} onPress={view === 'form' ? closeForm : () => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}><ArrowLeft size={22} color={theme.text} /></Pressable>
            <Text accessibilityRole="header" style={styles.headerTitle}>{view === 'form' ? editingAccount ? 'Sửa ví' : 'Thêm ví' : 'Ví của tôi'}</Text>
            <View style={styles.headerButton}>{view === 'wallets' ? <Wallet size={21} color={theme.primary} /> : null}</View>
          </View>

          {view === 'form' ? <ScrollView
            ref={formScrollRef}
            style={styles.formScroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            onLayout={revealInitialBalance}
            onContentSizeChange={revealInitialBalance}
            contentContainerStyle={styles.formContent}
          >
            <Text style={styles.intro}>{editingAccount ? 'Cập nhật thông tin để dễ quản lý ví của bạn.' : 'Thêm nơi bạn giữ tiền và bắt đầu theo dõi số dư.'}</Text>
            <View style={[styles.preview, { borderColor: `${selectedType.color}40` }]}>
              <View style={styles.previewTop}>
                <AccountIcon type={type} />
                <View style={styles.grow}><Text numberOfLines={2} style={styles.previewName}>{name.trim() || 'Ví mới của bạn'}</Text><Text style={styles.muted}>{selectedType.label} · {previewCurrency}</Text></View>
                <View style={styles.previewDot} />
              </View>
              <Text style={styles.balanceCaption}>{editingAccount ? 'Số dư hiện tại' : 'Số dư ban đầu'}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.previewAmount}>{formatCashflowAmount(Number.isFinite(previewBalance) ? previewBalance : 0, previewCurrency)}</Text>
            </View>

            {formError ? <Text accessibilityRole="alert" style={styles.errorNotice}>{formError}</Text> : null}
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Thông tin ví</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Tên ví</Text>
                <TextInput accessibilityLabel="Tên ví" value={name} onChangeText={value => { setName(value); setFormError(null); }} editable={!isSubmitting} maxLength={100} placeholder="Ví dụ: Tiền mặt, Tài khoản lương" placeholderTextColor={theme.inputPlaceholder} style={styles.input} returnKeyType={editingAccount ? 'done' : 'next'} onSubmitEditing={() => editingAccount ? Keyboard.dismiss() : initialBalanceRef.current?.focus()} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Loại ví</Text>
                <View accessibilityRole="radiogroup" style={styles.typeGrid}>
                  {accountTypes.map(option => {
                    const selected = type === option.value;
                    const Icon = option.Icon;
                    return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} disabled={isSubmitting} onPress={() => setType(option.value)} style={({ pressed }) => [styles.typeOption, selected && styles.typeSelected, pressed && styles.pressed]}>
                      {selected ? <View style={styles.typeCheck}><Check size={10} color={theme.textInverse} strokeWidth={3} /></View> : null}
                      <Icon size={25} color={selected ? theme.primary : theme.textMuted} strokeWidth={1.7} />
                      <Text style={[styles.typeLabel, selected && { color: theme.primary, fontWeight: '600' }]}>{option.label}</Text>
                    </Pressable>;
                  })}
                </View>
              </View>
              <View style={styles.field}>
                <View style={styles.inline}><Text style={styles.label}>Số dư ban đầu</Text>{editingAccount ? <LockKeyhole size={14} color={theme.textMuted} /> : null}</View>
                <View style={[styles.currencyInput, editingAccount && styles.inputDisabled]}>
                  <MoneyInput
                    ref={initialBalanceRef}
                    accessibilityLabel="Số dư ban đầu"
                    editable={!editingAccount && !isSubmitting}
                    value={initialBalance}
                    onChangeText={value => { setInitialBalance(value); setFormError(null); }}
                    onFocus={() => { balanceFocused.current = true; revealInitialBalance(); }}
                    onBlur={() => { balanceFocused.current = false; }}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    placeholder="0"
                    placeholderTextColor={theme.inputPlaceholder}
                    style={[styles.currencyText, editingAccount && { color: theme.textMuted }]}
                  />
                  <Text style={styles.muted}>{previewCurrency}</Text>
                </View>
                <Text style={styles.fieldHint}>{editingAccount ? 'Số dư ban đầu được giữ nguyên khi sửa ví.' : 'Nhập số tiền đang có trong ví. Bạn có thể để 0.'}</Text>
              </View>
            </View>
          </ScrollView> : <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadAccounts('refreshing')} tintColor={theme.primary} />}>
            <View style={styles.summary}>
              <View pointerEvents="none" style={styles.summaryDecoration} />
              <View style={styles.inline}><View style={styles.summaryIcon}><Wallet size={20} color={theme.primary} /></View><Text style={styles.summaryLabel}>Tổng số dư</Text></View>
              {isLoading || loadError && accounts.length === 0 ? <Text style={styles.summaryAmount}>—</Text> : (balanceGroups.length ? balanceGroups : [['VND', 0] as const]).map(([code, amount]) => <Text key={code} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.summaryAmount}>{formatCashflowAmount(amount, code)}</Text>)}
              <View style={styles.summaryFooter}><View style={styles.activeDot} /><Text style={styles.summaryFootnote}>{activeAccounts.length} ví đang hoạt động</Text></View>
            </View>

            {notice ? <View style={styles.successNotice}><CheckCircle2 size={18} color={theme.goodText} /><Text accessibilityRole="alert" style={[styles.grow, { color: theme.goodText }]}>{notice}</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo" onPress={() => setNotice(null)} hitSlop={8}><X size={16} color={theme.goodText} /></Pressable></View> : null}
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Danh sách ví</Text><Text style={styles.countLabel}>{accounts.length} ví</Text></View>
            {loadError ? <View style={styles.emptyCard}><Text accessibilityRole="alert" style={styles.errorText}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => void loadAccounts('refreshing')} style={styles.retryButton}><Text style={styles.retryText}>Tải lại danh sách</Text></Pressable></View> : null}
            {isLoading ? <View style={styles.emptyCard}><ActivityIndicator color={theme.primary} /><Text style={styles.muted}>Đang tải ví của bạn...</Text></View> : accounts.length === 0 && !loadError ? <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Wallet size={34} color={theme.primary} strokeWidth={1.5} /></View>
              <Text style={styles.emptyTitle}>Bắt đầu với ví đầu tiên</Text>
              <Text style={styles.emptyDescription}>Quản lý tiền mặt, tài khoản ngân hàng và tiền tiết kiệm ở cùng một nơi.</Text>
            </View> : accounts.map(account => <WalletCard key={account.id} account={account} actionIcon="menu" onPress={() => { setSelectedAccount(account); setConfirmDelete(false); setDeleteError(null); }} />)}
          </ScrollView>}

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={view === 'form' ? () => void saveAccount() : () => openForm()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, isSubmitting && styles.disabled]}>
              {isSubmitting ? <ActivityIndicator color={theme.textInverse} /> : <>{view === 'form' && editingAccount ? <Check size={20} color={theme.textInverse} /> : <Plus size={20} color={theme.textInverse} />}<Text style={styles.primaryButtonText}>{view === 'wallets' ? 'Thêm ví mới' : editingAccount ? 'Lưu thay đổi' : 'Tạo ví'}</Text></>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        <BottomPopup visible={selectedAccount !== null} onRequestClose={closeActions}>
          <View style={styles.overlay}>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng thao tác ví" disabled={isDeleting} onPress={closeActions} style={StyleSheet.absoluteFill} />
            <BottomPopupSheet style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}><Text style={styles.sectionTitle}>{confirmDelete ? 'Xóa ví?' : 'Quản lý ví'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng" disabled={isDeleting} onPress={closeActions} style={styles.headerButton}><X size={20} color={theme.textMuted} /></Pressable></View>
              {selectedAccount ? <>
                <View style={styles.selectedWallet}><AccountIcon type={selectedAccount.type} /><View style={styles.grow}><Text numberOfLines={2} style={styles.walletName}>{selectedAccount.name}</Text><Text style={styles.muted}>{formatCashflowAmount(getAccountCurrentBalance(selectedAccount), selectedAccount.currency)}</Text></View></View>
                {deleteError ? <Text accessibilityRole="alert" style={styles.errorNotice}>{deleteError}</Text> : null}
                {confirmDelete ? <>
                  <Text style={styles.deleteDescription}>Bạn muốn xóa ví “{selectedAccount.name}”? Ví sẽ không còn hiển thị trong danh sách.</Text>
                  <Pressable accessibilityRole="button" disabled={isDeleting} onPress={() => void deleteAccount()} style={[styles.primaryButton, { backgroundColor: theme.danger }, isDeleting && styles.disabled]}>{isDeleting ? <ActivityIndicator color={theme.textInverse} /> : <><Trash2 size={19} color={theme.textInverse} /><Text style={styles.primaryButtonText}>Xác nhận xóa ví</Text></>}</Pressable>
                  <Pressable accessibilityRole="button" disabled={isDeleting} onPress={() => { setConfirmDelete(false); setDeleteError(null); }} style={styles.cancelButton}><Text style={styles.muted}>Hủy</Text></Pressable>
                </> : <>
                  {selectedAccount.isActive ? <WalletAction label="Chuyển tiền đến ví khác" Icon={ArrowRightLeft} styles={styles} onPress={() => { closeActions(); router.push({ pathname: '/transfer', params: { fromAccountId: String(selectedAccount.id) } }); }} /> : null}
                  <WalletAction label="Sửa thông tin ví" Icon={Pencil} styles={styles} onPress={() => openForm(selectedAccount)} />
                  <WalletAction label="Xóa ví" Icon={Trash2} danger styles={styles} onPress={() => setConfirmDelete(true)} />
                </>}
              </> : null}
            </BottomPopupSheet>
          </View>
        </BottomPopup>
      </SafeAreaView>
    </FocusedScreenTransition>
  );
}

function WalletAction({ label, Icon, onPress, danger = false, styles }: { label: string; Icon: LucideIcon; onPress: () => void; danger?: boolean; styles: AccountStyles }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.actionPressed]}><Icon size={20} color={danger ? theme.dangerText : theme.textMuted} /><Text style={[styles.actionLabel, danger && { color: theme.dangerText }]}>{label}</Text><ChevronRight size={18} color={theme.textSubtle} /></Pressable>;
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.screen },
    screenBody: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
    headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
    headerTitle: { ...Typography.section, color: theme.text, flex: 1, textAlign: 'center' },
    grow: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.55 },
    listContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 },
    summary: { backgroundColor: theme.primaryPressed, borderRadius: 24, borderWidth: 1, borderColor: `${theme.primary}30`, padding: 22, overflow: 'hidden', gap: 12 },
    summaryDecoration: { position: 'absolute', right: -35, top: -54, width: 180, height: 180, borderRadius: 90, borderWidth: 28, borderColor: `${theme.primary}0B` },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    summaryIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: `${theme.primary}18` },
    summaryLabel: { ...Typography.label, color: theme.textMuted },
    summaryAmount: { fontSize: 32, lineHeight: 42, fontWeight: '600', color: theme.text },
    summaryFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
    activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary },
    summaryFootnote: { ...Typography.caption, color: theme.textMuted },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2 },
    sectionTitle: { ...Typography.section, color: theme.text, fontSize: 17 },
    countLabel: { ...Typography.caption, color: theme.textMuted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: theme.cardAlt },
    walletName: { ...Typography.bodyLarge, fontWeight: '600', color: theme.text },
    balanceCaption: { ...Typography.caption, color: theme.textMuted },
    footer: { paddingTop: 12, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, backgroundColor: theme.sheet },
    primaryButton: { minHeight: 52, borderRadius: 16, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    primaryButtonText: { ...Typography.button, color: theme.textInverse },
    muted: { ...Typography.small, color: theme.textMuted },
    emptyCard: { padding: 24, paddingVertical: 32, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 20, alignItems: 'center', gap: 12 },
    emptyIcon: { width: 76, height: 76, borderRadius: 26, backgroundColor: theme.primaryPressed, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { ...Typography.bodyLarge, fontWeight: '600', color: theme.text, textAlign: 'center' },
    emptyDescription: { ...Typography.body, color: theme.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
    successNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: theme.goodBackground },
    errorNotice: { ...Typography.body, color: theme.dangerText, backgroundColor: theme.warningBackground, padding: 14, borderRadius: 12 },
    errorText: { ...Typography.body, color: theme.dangerText, textAlign: 'center' },
    retryButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
    retryText: { ...Typography.label, color: theme.primary },
    formContent: { padding: 20, paddingTop: 0, paddingBottom: 28, gap: 20 },
    formScroll: { flex: 1 },
    intro: { ...Typography.body, color: theme.textMuted, lineHeight: 22 },
    preview: { borderRadius: 20, borderWidth: 1, backgroundColor: theme.card, padding: 20, gap: 4 },
    previewTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    previewName: { ...Typography.bodyLarge, color: theme.text, fontWeight: '600', marginBottom: 3 },
    previewDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.primary },
    previewAmount: { fontSize: 29, lineHeight: 40, fontWeight: '600', color: theme.text },
    formCard: { borderRadius: 20, padding: 18, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, gap: 20 },
    field: { gap: 9 },
    label: { ...Typography.label, color: theme.text },
    input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBackground, color: theme.text, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
    currencyInput: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBackground, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
    currencyText: { flex: 1, minWidth: 0, fontSize: 16, color: theme.text, paddingVertical: 12 },
    inputDisabled: { backgroundColor: theme.cardAlt },
    fieldHint: { ...Typography.caption, color: theme.textMuted, lineHeight: 18 },
    typeGrid: { flexDirection: 'row', gap: 8 },
    typeOption: { flex: 1, minWidth: 0, minHeight: 90, borderRadius: 14, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 2 },
    typeSelected: { borderColor: theme.primary, backgroundColor: theme.primaryPressed },
    typeLabel: { ...Typography.caption, color: theme.textMuted, textAlign: 'center' },
    typeCheck: { position: 'absolute', top: 6, right: 6, width: 15, height: 15, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay },
    sheet: { backgroundColor: theme.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 8 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, alignSelf: 'center', marginBottom: 2 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectedWallet: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginBottom: 6 },
    actionRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, borderRadius: 12 },
    actionPressed: { backgroundColor: theme.cardAlt },
    actionLabel: { ...Typography.body, color: theme.text, flex: 1 },
    deleteDescription: { ...Typography.body, color: theme.textMuted, lineHeight: 22, marginBottom: 12 },
    cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  });
}
