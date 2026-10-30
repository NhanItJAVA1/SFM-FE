import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowRightLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, Clock3, History, Plus, Trash2, Wallet, X } from 'lucide-react-native';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { financialAccountApi, type FinancialAccount } from '@/api/financialAccountApi';
import { transfersApi, type Transfer } from '@/api/transfersApi';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-text';
import { BottomPopup, BottomPopupSheet } from '@/components/bottom-popup';
import { ScreenGradientBackground } from '@/components/screen-gradient-background';
import { invalidateAIAnalysis } from '@/hooks/use-ai-analysis';
import { useAppTheme } from '@/hooks/use-app-theme';
import { getAuthAccessToken } from '@/stores/authSession';
import { Typography } from '@/theme/typography';
import { getAccountCurrentBalance } from '@/utils/accountBalance';
import { formatTransactionTime, getTransactionDayKey } from '@/utils/transactionPresentation';
import { buildTransferPayload, getTransferError } from '@/utils/transfer';
import { formatCashflowAmount } from '@/utils/walletCashflow';

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

type TransferPanelProps = {
  embedded?: boolean;
  active?: boolean;
  bottomPadding?: number;
  initialFromAccountId?: number;
  initialView?: 'create' | 'history';
  onBusyChange?: (busy: boolean) => void;
  onChange?: () => void | Promise<void>;
};

export function TransferPanel({ embedded = false, active = true, bottomPadding, initialFromAccountId, initialView = 'create', onBusyChange, onChange }: TransferPanelProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<'create' | 'history'>(initialView);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [fromId, setFromId] = useState<number | null>(initialFromAccountId ?? null);
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date());
  const [webDate, setWebDate] = useState(() => dateLabel(new Date()));
  const [webTime, setWebTime] = useState(() => formatTransactionTime(new Date().toISOString()));
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [datePicker, setDatePicker] = useState<'date' | 'time' | null>(null);
  const [detail, setDetail] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const generation = useRef(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const busy = useRef(false);
  const focused = useRef(false);
  const mounted = useRef(true);
  const signedIn = Boolean(getAuthAccessToken());

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    const [wallets, history] = await Promise.allSettled([financialAccountApi.list(), transfersApi.list()]);
    if (!focused.current || request !== generation.current) return;
    if (wallets.status === 'fulfilled' && Array.isArray(wallets.value.data)) {
      const rows = wallets.value.data;
      setAccounts(rows);
      setFromId(current => rows.some(account => account.id === current && account.isActive) ? current : rows.find(account => account.isActive)?.id ?? null);
      setAccountError(null);
    } else setAccountError('Không tải được danh sách ví. Vui lòng tải lại trước khi chuyển tiền.');
    if (history.status === 'fulfilled' && Array.isArray(history.value.data)) {
      setTransfers([...history.value.data].sort((a, b) => new Date(b.transferDate).getTime() - new Date(a.transferDate).getTime() || b.id - a.id));
      setHistoryError(null);
    } else setHistoryError('Không tải được lịch sử chuyển tiền. Vui lòng thử lại.');
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = active;
    if (active && signedIn) void load();
    return () => { focused.current = false; generation.current++; };
  }, [active, load, signedIn]));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    onBusyChange?.(saving);
    return () => onBusyChange?.(false);
  }, [onBusyChange, saving]);

  const activeAccounts = accounts.filter(account => account.isActive);
  const from = activeAccounts.find(account => account.id === fromId);
  const currency = from?.currency.trim().toUpperCase() ?? null;
  const to = activeAccounts.find(account => account.id === toId && account.id !== fromId && account.currency.trim().toUpperCase() === currency);
  const hasDestination = activeAccounts.some(account => account.id !== fromId && account.currency.trim().toUpperCase() === currency);
  const parsedAmount = Number(amount.replace(',', '.'));
  const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const accountName = (id: number) => accounts.find(account => account.id === id)?.name ?? `Ví #${id}`;
  const accountCurrency = (id: number) => accounts.find(account => account.id === id)?.currency ?? null;
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/transactions');

  async function submit() {
    if (busy.current || accountError || loading) return;
    setFormError(null);
    setSuccess(null);
    try {
      let transferDate = date;
      if (Platform.OS === 'web') {
        const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(webDate.trim());
        const time = /^(\d{1,2}):(\d{2})$/.exec(webTime.trim());
        if (!parts || !time) throw new Error('Nhập ngày theo dd/MM/yyyy và giờ theo HH:mm.');
        transferDate = new Date(+parts[3], +parts[2] - 1, +parts[1], +time[1], +time[2]);
        if (transferDate.getFullYear() !== +parts[3] || transferDate.getMonth() !== +parts[2] - 1 || transferDate.getDate() !== +parts[1] || +time[1] > 23 || +time[2] > 59) throw new Error('Ngày hoặc giờ chuyển tiền không hợp lệ.');
      }
      const payload = buildTransferPayload({ from, to, amount, description, date: transferDate });
      Keyboard.dismiss();
      busy.current = true;
      setSaving(true);
      await transfersApi.create(payload);
      invalidateAIAnalysis();
      if (!mounted.current) return;
      void onChange?.();
      setAmount(''); setDescription('');
      setSuccess('Đã chuyển tiền giữa hai ví.');
      setView('history');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      if (focused.current) await load();
    } catch (error) {
      if (focused.current) {
        setFormError(getTransferError(error));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function deleteTransfer() {
    if (!detail || busy.current) return;
    busy.current = true;
    setSaving(true); setFormError(null); setSuccess(null);
    try {
      await transfersApi.delete(detail.id);
      invalidateAIAnalysis();
      if (!mounted.current) return;
      void onChange?.();
      setTransfers(current => current.filter(item => item.id !== detail.id));
      setDetail(null);
      setSuccess('Đã xóa lần chuyển tiền và hai giao dịch liên quan.');
      if (focused.current) await load();
    } catch (error) {
      if (focused.current) setFormError(getTransferError(error));
    } finally { busy.current = false; setSaving(false); }
  }

  function onDateChange(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === 'android') setDatePicker(null);
    if (event.type !== 'dismissed' && next) setDate(next);
  }

  if (!signedIn) return <Redirect href="/auth/login" />;

  const walletButton = (side: 'from' | 'to', account: FinancialAccount | undefined) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${side === 'from' ? 'Ví chuyển' : 'Ví nhận'}: ${account?.name ?? 'Chưa chọn'}`} disabled={saving} onPress={() => { setPicker(side); setFormError(null); }} style={({ pressed }) => [styles.wallet, { borderColor: theme.border, backgroundColor: pressed ? theme.primaryPressed : theme.card }]}>
      <View style={styles.row}>
        {side === 'from' ? <ArrowUpRight size={18} color={theme.dangerText} /> : <ArrowDownLeft size={18} color={theme.goodText} />}
        <Text style={[styles.label, { color: theme.textMuted }]}>{side === 'from' ? 'Từ ví' : 'Đến ví'}</Text>
        <ChevronDown size={18} color={theme.textMuted} />
      </View>
      <Text numberOfLines={2} style={[Typography.label, { fontWeight: '600', color: theme.text }]}>{account?.name ?? 'Chọn ví'}</Text>
      <Text style={[Typography.caption, { color: theme.textMuted }]}>{account ? `Số dư ${formatCashflowAmount(getAccountCurrentBalance(account), account.currency)}` : 'Chọn ví nhận tiền'}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: embedded ? 'transparent' : theme.screen, paddingTop: embedded ? 0 : insets.top }]}>
      {!embedded ? <ScreenGradientBackground /> : null}
      {!embedded ? <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={goBack} disabled={saving} style={styles.iconButton}><ArrowLeft size={23} color={theme.text} /></Pressable>
        <Text style={[Typography.section, { color: theme.text }]}>Chuyển tiền</Text>
        <View style={styles.iconButton} />
      </View> : null}
      {embedded ? <View style={styles.embeddedToolbar}>
        <Text style={[Typography.small, { color: theme.textMuted }]}>{view === 'create' ? 'Chuyển tiền giữa các ví' : 'Lịch sử chuyển tiền'}</Text>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setView(view === 'create' ? 'history' : 'create'); setFormError(null); }} style={[styles.historyAction, { backgroundColor: theme.primaryPressed }]}>
          {view === 'create' ? <History size={16} color={theme.primary} /> : <Plus size={16} color={theme.primary} />}
          <Text style={[Typography.small, { color: theme.primary, fontWeight: '600' }]}>{view === 'create' ? 'Lịch sử' : 'Chuyển mới'}</Text>
        </Pressable>
      </View> : <View style={[styles.tabs, { backgroundColor: theme.cardAlt }]}>
        {(['create', 'history'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: view === tab }} disabled={saving} onPress={() => { setView(tab); setFormError(null); }} style={[styles.tab, view === tab && { backgroundColor: theme.card }]}>
          {tab === 'create' ? <ArrowRightLeft size={18} color={view === tab ? theme.primary : theme.textMuted} /> : <History size={18} color={view === tab ? theme.primary : theme.textMuted} />}
          <Text style={[Typography.label, { color: view === tab ? theme.primary : theme.textMuted }]}>{tab === 'create' ? 'Chuyển giữa các ví' : 'Lịch sử'}</Text>
        </Pressable>)}
      </View>}
      <KeyboardAvoidingView style={styles.screen} enabled={!embedded} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: bottomPadding ?? insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { if (!busy.current) void load(); }} tintColor={theme.primary} />}>
          {success ? <Text accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.goodBackground, color: theme.goodText }]}>{success}</Text> : null}
          {formError && !detail ? <Text accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.warningBackground, color: theme.dangerText }]}>{formError}</Text> : null}
          {accountError ? <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.notice}><Text style={{ color: theme.dangerText }}>{accountError} Nhấn để tải lại.</Text></Pressable> : null}
          {view === 'create' ? <>
            {!loading && !accountError && !hasDestination ? <View style={[styles.notice, { backgroundColor: theme.card }]}>
              <Text style={{ color: theme.textMuted }}>Bạn cần ít nhất hai ví đang hoạt động và cùng tiền tệ để chuyển tiền.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={styles.smallAction}><Plus size={18} color={theme.primary} /><Text style={{ color: theme.primary, fontWeight: '600' }}>Quản lý ví</Text></Pressable>
            </View> : null}
            <View style={styles.wallets}>
              {walletButton('from', from)}
              <Pressable accessibilityRole="button" accessibilityLabel="Đổi ví chuyển và ví nhận" disabled={!from || !to || saving} onPress={() => { setFromId(toId); setToId(fromId); setFormError(null); }} style={[styles.swap, { backgroundColor: theme.primaryPressed, opacity: from && to ? 1 : 0.4 }]}><ArrowRightLeft size={20} color={theme.primary} /></Pressable>
              {walletButton('to', to)}
            </View>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[Typography.label, { color: theme.textMuted }]}>Số tiền chuyển{currency ? ` (${currency})` : ''}</Text>
              <TextInput accessibilityLabel="Số tiền chuyển" value={amount} onChangeText={setAmount} editable={!saving} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.textSubtle} style={[styles.amount, { color: theme.primary }]} />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              {Platform.OS === 'web' ? <View style={styles.row}>
                <TextInput accessibilityLabel="Ngày chuyển dd/MM/yyyy" value={webDate} onChangeText={setWebDate} editable={!saving} placeholder="dd/MM/yyyy" placeholderTextColor={theme.textSubtle} style={[styles.dateInput, { color: theme.text }]} />
                <TextInput accessibilityLabel="Giờ chuyển HH:mm" value={webTime} onChangeText={setWebTime} editable={!saving} placeholder="HH:mm" placeholderTextColor={theme.textSubtle} style={[styles.dateInput, { color: theme.text }]} />
              </View> : <View style={styles.row}>
                <Pressable accessibilityRole="button" accessibilityLabel="Chọn ngày chuyển" disabled={saving} onPress={() => setDatePicker('date')} style={styles.dateButton}><CalendarDays size={18} color={theme.textMuted} /><Text style={{ color: theme.text }}>{dateLabel(date)}</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Chọn giờ chuyển" disabled={saving} onPress={() => setDatePicker('time')} style={styles.dateButton}><Clock3 size={18} color={theme.textMuted} /><Text style={{ color: theme.text }}>{formatTransactionTime(date.toISOString())}</Text></Pressable>
              </View>}
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Text style={[Typography.label, { color: theme.textMuted }]}>Ghi chú</Text>
              <TextInput accessibilityLabel="Ghi chú chuyển tiền" value={description} onChangeText={setDescription} editable={!saving} maxLength={500} multiline placeholder="Ví dụ: Chuyển tiền vào ví tiết kiệm" placeholderTextColor={theme.textSubtle} style={[styles.noteInput, { color: theme.text }]} />
            </View>
            {from && to && hasAmount ? <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[Typography.label, { color: theme.textMuted }]}>Số dư sau chuyển</Text>
              {[{ account: from, change: -parsedAmount }, { account: to, change: parsedAmount }].map(({ account, change }) => <View key={account.id} style={styles.row}>
                <Text numberOfLines={1} style={[styles.label, { color: theme.text }]}>{account.name}</Text>
                <Text style={{ color: getAccountCurrentBalance(account) + change < 0 ? theme.dangerText : theme.text, fontWeight: '600' }}>{formatCashflowAmount(getAccountCurrentBalance(account) + change, account.currency)}</Text>
              </View>)}
            </View> : null}
            <Text style={[styles.hint, { color: theme.textMuted }]}>Chuyển giữa các ví cùng tiền tệ. Khoản chuyển không tính vào tổng thu, tổng chi.</Text>
            <Pressable accessibilityRole="button" disabled={saving || loading || !!accountError || !from || !to} onPress={() => void submit()} style={({ pressed }) => [styles.submit, { backgroundColor: theme.primary, opacity: saving || loading || !!accountError || !from || !to ? 0.5 : pressed ? 0.8 : 1 }]}>
              {saving ? <ActivityIndicator color={theme.textInverse} /> : <><ArrowRightLeft size={20} color={theme.textInverse} /><Text style={[Typography.button, { color: theme.textInverse }]}>Chuyển tiền</Text></>}
            </Pressable>
          </> : <>
            {historyError ? <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.notice}><Text style={{ color: theme.dangerText }}>{historyError} Nhấn để tải lại.</Text></Pressable> : null}
            {!loading && !historyError && transfers.length === 0 ? <View style={styles.empty}><History size={36} color={theme.textSubtle} /><Text style={[Typography.bodyLarge, { color: theme.text }]}>Chưa có lần chuyển tiền nào</Text><Text style={{ color: theme.textMuted, textAlign: 'center' }}>Các lần chuyển giữa ví sẽ hiển thị ở đây.</Text></View> : null}
            {transfers.map((item, index) => <View key={item.id}>
              {index === 0 || getTransactionDayKey(item.transferDate) !== getTransactionDayKey(transfers[index - 1].transferDate) ? <Text style={[styles.day, { color: theme.textMuted }]}>{dateLabel(new Date(item.transferDate))}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Chi tiết chuyển từ ${accountName(item.fromAccountId)} đến ${accountName(item.toAccountId)}`} disabled={saving} onPress={() => { setDetail(item); setFormError(null); }} style={({ pressed }) => [styles.historyRow, { backgroundColor: pressed ? theme.primaryPressed : theme.card, borderColor: theme.border }]}>
                <View style={[styles.historyIcon, { backgroundColor: theme.primaryPressed }]}><ArrowRightLeft size={21} color={theme.primary} /></View>
                <View style={styles.label}>
                  <Text numberOfLines={2} style={{ color: theme.text, fontWeight: '500' }}>{accountName(item.fromAccountId)} → {accountName(item.toAccountId)}</Text>
                  <View style={styles.row}><Text style={[Typography.caption, { color: theme.textMuted }]}>{formatTransactionTime(item.transferDate)}</Text>{item.description ? <Text numberOfLines={1} style={[styles.label, Typography.caption, { color: theme.textMuted }]}>{item.description}</Text> : null}</View>
                </View>
                <Text style={[Typography.label, { color: theme.text, flexShrink: 1 }]}>{formatCashflowAmount(item.amount, accountCurrency(item.fromAccountId))}</Text>
              </Pressable>
            </View>)}
          </>}
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomPopup visible={picker !== null} onRequestClose={() => setPicker(null)}>
        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          <Pressable accessibilityLabel="Đóng chọn ví" onPress={() => setPicker(null)} style={StyleSheet.absoluteFill} />
          <BottomPopupSheet style={[styles.sheet, { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.row}><Text style={[styles.label, Typography.section, { color: theme.text }]}>{picker === 'from' ? 'Chọn ví chuyển' : 'Chọn ví nhận'}</Text><Pressable accessibilityLabel="Đóng" onPress={() => setPicker(null)} style={styles.iconButton}><X size={21} color={theme.text} /></Pressable></View>
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              {activeAccounts.map(account => {
                const other = picker === 'from' ? to : from;
                const disabled = account.id === other?.id || (picker === 'to' && !!other && account.currency.trim().toUpperCase() !== other.currency.trim().toUpperCase());
                const selected = account.id === (picker === 'from' ? fromId : toId);
                return <Pressable key={account.id} accessibilityRole="radio" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => {
                  if (picker === 'from') {
                    setFromId(account.id);
                    if (to && account.currency.trim().toUpperCase() !== to.currency.trim().toUpperCase()) setToId(null);
                  } else setToId(account.id);
                  setPicker(null);
                }} style={({ pressed }) => [styles.pickerRow, { opacity: disabled ? 0.4 : 1, backgroundColor: selected || pressed ? theme.primaryPressed : 'transparent' }]}>
                  <Wallet size={22} color={theme.primary} /><View style={styles.label}><Text style={{ color: theme.text, fontWeight: '500' }}>{account.name}</Text><Text style={[Typography.caption, { color: theme.textMuted }]}>{formatCashflowAmount(getAccountCurrentBalance(account), account.currency)}{disabled ? account.id === other?.id ? ' · Đã chọn ở ví còn lại' : ' · Khác tiền tệ' : ''}</Text></View>{selected ? <Check size={20} color={theme.primary} /> : null}
                </Pressable>;
              })}
            </ScrollView>
          </BottomPopupSheet>
        </View>
      </BottomPopup>
      <BottomPopup visible={detail !== null} onRequestClose={() => { if (!saving) setDetail(null); }}>
        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          <Pressable accessibilityLabel="Đóng chi tiết" disabled={saving} onPress={() => setDetail(null)} style={StyleSheet.absoluteFill} />
          <BottomPopupSheet style={[styles.sheet, { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.row}><Text style={[styles.label, Typography.section, { color: theme.text }]}>Chi tiết chuyển tiền</Text><Pressable accessibilityLabel="Đóng" disabled={saving} onPress={() => setDetail(null)} style={styles.iconButton}><X size={21} color={theme.text} /></Pressable></View>
            {detail ? <ScrollView contentContainerStyle={{ gap: 14 }}>
              <Text style={[Typography.amount, { color: theme.primary, textAlign: 'center' }]}>{formatCashflowAmount(detail.amount, accountCurrency(detail.fromAccountId))}</Text>
              <View style={styles.row}><Text style={[styles.label, { color: theme.text }]}>{accountName(detail.fromAccountId)}</Text><ArrowRight size={20} color={theme.primary} /><Text style={[styles.label, { color: theme.text, textAlign: 'right' }]}>{accountName(detail.toAccountId)}</Text></View>
              <Text style={{ color: theme.textMuted }}>{dateLabel(new Date(detail.transferDate))} · {formatTransactionTime(detail.transferDate)}</Text>
              {detail.description ? <Text style={{ color: theme.text }}>{detail.description}</Text> : null}
              <Text style={{ color: theme.textMuted }}>Xóa lần chuyển này sẽ xóa cả giao dịch trừ ở ví chuyển và cộng ở ví nhận, đồng thời cập nhật số dư hai ví.</Text>
              {formError ? <Text accessibilityRole="alert" style={{ color: theme.dangerText }}>{formError}</Text> : null}
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void deleteTransfer()} style={[styles.submit, { backgroundColor: theme.warningBackground }]}>{saving ? <ActivityIndicator color={theme.dangerText} /> : <><Trash2 size={19} color={theme.dangerText} /><Text style={{ color: theme.dangerText, fontWeight: '600' }}>Xóa chuyển tiền</Text></>}</Pressable>
            </ScrollView> : null}
          </BottomPopupSheet>
        </View>
      </BottomPopup>
      {datePicker && Platform.OS === 'android' ? <DateTimePicker value={date} mode={datePicker} is24Hour onChange={onDateChange} /> : null}
      {Platform.OS === 'ios' ? <BottomPopup visible={datePicker !== null} onRequestClose={() => setDatePicker(null)}><View style={[styles.overlay, { backgroundColor: theme.overlay }]}><Pressable accessibilityLabel="Đóng chọn thời gian" onPress={() => setDatePicker(null)} style={StyleSheet.absoluteFill} /><BottomPopupSheet style={[styles.sheet, { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 16 }]}><DateTimePicker value={date} mode={datePicker ?? 'date'} display="spinner" locale="vi-VN" onChange={onDateChange} /><Pressable onPress={() => setDatePicker(null)} style={[styles.submit, { backgroundColor: theme.primary }]}><Text style={{ color: theme.textInverse, fontWeight: '600' }}>Xong</Text></Pressable></BottomPopupSheet></View></BottomPopup> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  embeddedToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  historyAction: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', gap: 6, alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, padding: 4, borderRadius: 14, marginBottom: 4 },
  tab: { flex: 1, minHeight: 44, paddingHorizontal: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  content: { padding: 16, gap: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, label: { flex: 1, minWidth: 0 },
  wallets: { flexDirection: 'row', gap: 40, alignItems: 'stretch' }, wallet: { flex: 1, minWidth: 0, padding: 12, borderRadius: 16, borderWidth: 1, gap: 8 },
  swap: { position: 'absolute', left: '50%', top: '50%', marginLeft: -18, marginTop: -18, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 }, amount: { fontSize: 38, lineHeight: 48, fontWeight: '600', paddingVertical: 6 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 }, dateButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: { flex: 1, minHeight: 44 }, noteInput: { minHeight: 56, textAlignVertical: 'top', paddingVertical: 6 },
  hint: { ...Typography.small, paddingHorizontal: 4 }, submit: { minHeight: 50, padding: 12, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  notice: { padding: 14, borderRadius: 12 }, smallAction: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingTop: 12 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 44 }, day: { ...Typography.small, fontWeight: '600', marginTop: 10, marginBottom: 8 },
  historyRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginBottom: 4 },
  historyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end' }, sheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, padding: 12, borderRadius: 12 },
});
