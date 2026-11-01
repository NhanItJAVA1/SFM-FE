import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ArrowLeft, Check, ChevronRight, Pencil, Trash2, X } from 'lucide-react-native';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categoriesApi, type Category } from '@/api/categoriesApi';
import { financialAccountApi, type FinancialAccount } from '@/api/financialAccountApi';
import { transactionsApi, type Transaction, type UpdateTransactionPayload } from '@/api/transactionsApi';
import { transfersApi, type CreateTransferPayload, type Transfer } from '@/api/transfersApi';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-text';
import { BottomPopup, BottomPopupSheet } from '@/components/bottom-popup';
import { CategoryIconBadge } from '@/components/category-icon';
import { invalidateAIAnalysis } from '@/hooks/use-ai-analysis';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Typography } from '@/theme/typography';
import { buildUpdateTransactionPayload, createTransactionEditForm, getTransactionMutationError, parseTransactionDate, transactionDateFields, type TransactionEditForm } from '@/utils/transactionEditing';
import { formatTransactionTime, getTransactionDayHeading, isIncomingTransaction, isTransferTransaction } from '@/utils/transactionPresentation';
import { formatCashflowAmount } from '@/utils/walletCashflow';
import { buildTransferPayload, getTransferError } from '@/utils/transfer';

export type TransactionChange = { original: Transaction; updated: Transaction | null; transferUpdate?: CreateTransferPayload; message: string };

type Props = {
  transactionId: number | null;
  onClose: () => void;
  onChanged: (change: TransactionChange) => void;
};
type ViewMode = 'detail' | 'edit' | 'delete' | 'account' | 'toAccount' | 'category';

export function TransactionDetailsSheet({ transactionId, onClose, onChanged }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<TransactionEditForm | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [mode, setMode] = useState<ViewMode>('detail');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsReady, setOptionsReady] = useState(false);
  const [datePicker, setDatePicker] = useState<'date' | 'time' | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(async () => {
    if (transactionId === null) return;
    const request = ++generation.current;
    setMode('detail'); setDatePicker(null);
    setLoading(true); setError(null); setTransaction(null); setTransfer(null); setForm(null); setOptionsReady(false);
    const [detail, wallets, categoryList] = await Promise.allSettled([
      transactionsApi.get(transactionId), financialAccountApi.list(), categoriesApi.list(),
    ]);
    if (request !== generation.current) return;
    const walletsReady = wallets.status === 'fulfilled' && Array.isArray(wallets.value.data);
    const categoriesReady = categoryList.status === 'fulfilled' && Array.isArray(categoryList.value.data);
    setAccounts(walletsReady ? wallets.value.data : []);
    setCategories(categoriesReady ? categoryList.value.data : []);
    setOptionsReady(walletsReady && (categoriesReady || detail.status === 'fulfilled' && isTransferTransaction(detail.value.data)));
    if (detail.status === 'rejected') {
      setError(getTransactionMutationError(detail.reason));
    } else {
      setTransaction(detail.value.data);
      setForm(createTransactionEditForm(detail.value.data));
      if (detail.value.data.transferId != null) {
        try {
          const response = await transfersApi.get(detail.value.data.transferId);
          if (request !== generation.current) return;
          setTransfer(response.data);
          setToAccountId(response.data.toAccountId);
          setForm({ ...createTransactionEditForm(detail.value.data), accountId: response.data.fromAccountId,
            amount: String(response.data.amount), description: response.data.description ?? '',
            ...transactionDateFields(response.data.transferDate) });
        } catch {
          // The transaction still contains the transfer ID required for deleting both legs.
        }
      }
    }
    if (request === generation.current) setLoading(false);
  }, [transactionId]);

  const cancelLoad = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    // Reset the sheet while synchronizing the newly selected transaction with the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return cancelLoad;
  }, [cancelLoad, load]);

  const close = () => { if (!busy.current) { Keyboard.dismiss(); onClose(); } };
  const back = () => {
    if (busy.current) return;
    Keyboard.dismiss(); setDatePicker(null); setError(null);
    setMode(mode === 'account' || mode === 'toAccount' || mode === 'category' ? 'edit' : 'detail');
  };
  const updateForm = (patch: Partial<TransactionEditForm>) => {
    setForm(current => current ? { ...current, ...patch } : current);
    setError(null);
  };
  const changeMode = (next: ViewMode) => {
    Keyboard.dismiss(); setDatePicker(null); setError(null); setMode(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const isTransfer = transaction !== null && isTransferTransaction(transaction);
  const canDelete = transaction !== null && (!isTransfer || transaction.transferId != null);
  const canEdit = optionsReady && (!isTransfer || transfer !== null);
  const currency = accounts.find(account => account.id === transaction?.accountId)?.currency;
  const accountLabel = (id: number) => accounts.find(account => account.id === id)?.name ?? `Ví #${id}`;

  async function submit(action: 'save' | 'delete') {
    if (!transaction || !form || busy.current) return;
    let payload: UpdateTransactionPayload | undefined;
    let transferPayload: CreateTransferPayload | undefined;
    try {
      if (action === 'save') {
        if (!optionsReady) throw new Error('Vui lòng tải lại danh sách ví và danh mục trước khi sửa.');
        if (isTransfer) {
          if (!transfer) throw new Error('Vui lòng tải lại thông tin lần chuyển tiền trước khi sửa.');
          const initial = transactionDateFields(transfer.transferDate);
          const date = form.date === initial.date && form.time === initial.time
            ? new Date(transfer.transferDate) : parseTransactionDate(form.date, form.time);
          transferPayload = buildTransferPayload({ from: accounts.find(account => account.id === form.accountId),
            to: accounts.find(account => account.id === toAccountId), amount: form.amount, description: form.description, date });
        } else payload = buildUpdateTransactionPayload(transaction, form, accounts, categories);
      } else if (!canDelete) throw new Error('Chưa có thông tin liên kết để xóa toàn bộ lần chuyển tiền.');
    } catch (cause) {
      setError(getTransactionMutationError(cause));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    Keyboard.dismiss(); setDatePicker(null); setError(null);
    busy.current = true; setSaving(true);
    const request = generation.current;
    try {
      if (action === 'save') {
        if (transferPayload && transaction.transferId != null) await transfersApi.update(transaction.transferId, transferPayload);
        else if (payload) await transactionsApi.update(transaction.id, payload);
        else throw new Error('Chưa có dữ liệu hợp lệ để lưu thay đổi.');
      } else if (isTransfer && transaction.transferId != null) await transfersApi.delete(transaction.transferId);
      else await transactionsApi.delete(transaction.id);
    } catch (cause) {
      if (request === generation.current) {
        setError(isTransfer ? getTransferError(cause) : getTransactionMutationError(cause));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
      return;
    } finally {
      busy.current = false;
      if (request === generation.current) setSaving(false);
    }
    invalidateAIAnalysis();
    if (request !== generation.current) return;
    const updatedAt = new Date().toISOString();
    onChanged({
      original: transaction,
      updated: transferPayload ? { ...transaction, accountId: isIncomingTransaction(transaction.type) ? transferPayload.toAccountId : transferPayload.fromAccountId,
        amount: transferPayload.amount, description: transferPayload.description ?? null, transactionDate: transferPayload.transferDate,
        categoryId: null, categoryName: '', isExcluded: true, location: null, updatedAt }
        : payload ? { ...transaction, ...payload, categoryName: categories.find(category => category.id === payload.categoryId)?.name ?? '', updatedAt } : null,
      transferUpdate: transferPayload,
      message: action === 'save' ? isTransfer ? 'Đã cập nhật lần chuyển tiền và hai giao dịch liên quan.' : 'Đã cập nhật giao dịch.' : isTransfer ? 'Đã xóa lần chuyển tiền và hai giao dịch liên quan.' : 'Đã xóa giao dịch.',
    });
  }

  function openDatePicker(next: 'date' | 'time') {
    if (!form) return;
    try { parseTransactionDate(form.date, form.time); setDatePicker(next); }
    catch (cause) { setError(getTransactionMutationError(cause)); }
  }
  function onDateChange(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === 'android') setDatePicker(null);
    if (event.type !== 'dismissed' && next) updateForm(transactionDateFields(next.toISOString()));
  }

  const title = { detail: 'Chi tiết giao dịch', edit: isTransfer ? 'Sửa lần chuyển tiền' : 'Sửa giao dịch', delete: isTransfer ? 'Xóa lần chuyển tiền?' : 'Xóa giao dịch?', account: isTransfer ? 'Chọn ví chuyển' : 'Chọn ví', toAccount: 'Chọn ví nhận', category: 'Chọn danh mục' }[mode];
  const label = (text: string) => <Text style={[styles.label, { color: theme.textMuted }]}>{text}</Text>;
  const detailRow = (name: string, value: string) => <View style={[styles.detailRow, { borderBottomColor: theme.border }]}>{label(name)}<Text selectable style={[styles.detailValue, { color: theme.text }]}>{value}</Text></View>;
  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBackground }];

  return (
    <BottomPopup visible={transactionId !== null} onRequestClose={mode === 'detail' ? close : back}>
      <KeyboardAvoidingView style={[styles.overlay, { backgroundColor: theme.overlay }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết giao dịch" disabled={saving} onPress={close} style={StyleSheet.absoluteFill} />
        <BottomPopupSheet style={[styles.sheet, { backgroundColor: theme.sheet, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            {mode !== 'detail' ? <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" disabled={saving} onPress={back} style={styles.iconButton}><ArrowLeft size={22} color={theme.text} /></Pressable> : <View style={styles.iconButton} />}
            <Text accessibilityRole="header" style={[Typography.section, styles.title, { color: theme.text }]}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng" disabled={saving} onPress={close} style={styles.iconButton}><X size={22} color={theme.textMuted} /></Pressable>
          </View>
          <ScrollView ref={scrollRef} style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {loading ? <ActivityIndicator accessibilityLabel="Đang tải chi tiết giao dịch" color={theme.primary} style={styles.loading} /> : <>
              {error ? <Text accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.warningBackground, color: theme.dangerText }]}>{error}</Text> : null}
              {!transaction ? <ActionButton text="Tải lại" onPress={() => void load()} /> : <>
                {mode === 'detail' ? <>
                  <View style={styles.summary}>
                    <CategoryIconBadge icon={categories.find(category => category.id === transaction.categoryId)?.icon} name={isTransfer ? 'Chuyển tiền' : transaction.categoryName} type={transaction.type} transferId={transaction.transferId} size={48} iconSize={26} />
                    <Text selectable style={[styles.amount, { color: isIncomingTransaction(transaction.type) ? theme.goodText : theme.dangerText }]}>{isIncomingTransaction(transaction.type) ? '+' : '-'}{currency ? formatCashflowAmount(transaction.amount, currency) : String(transaction.amount)}</Text>
                    <Text selectable style={[Typography.body, { color: theme.text, textAlign: 'center' }]}>{transaction.description || (isTransfer ? 'Chuyển tiền giữa các ví' : transaction.type === 'Income' ? 'Thu nhập' : 'Chi tiêu')}</Text>
                  </View>
                  {detailRow('Loại giao dịch', isTransfer ? 'Chuyển tiền' : transaction.type === 'Income' ? 'Thu nhập' : 'Chi tiêu')}
                  {detailRow('Ví', accountLabel(transaction.accountId))}
                  {transfer ? <>{detailRow('Từ ví', accountLabel(transfer.fromAccountId))}{detailRow('Đến ví', accountLabel(transfer.toAccountId))}</> : null}
                  {!isTransfer ? detailRow('Danh mục', categories.find(category => category.id === transaction.categoryId)?.name || transaction.categoryName || 'Chưa phân loại') : null}
                  {detailRow('Thời gian', `${getTransactionDayHeading(transaction.transactionDate).date} · ${formatTransactionTime(transaction.transactionDate)}`)}
                  {transaction.location ? detailRow('Địa điểm', transaction.location) : null}
                  {detailRow('Thống kê thu/chi', transaction.isExcluded || isTransfer ? 'Không tính vào thống kê' : 'Tính vào thống kê')}
                  {isTransfer ? <Text style={[styles.notice, { backgroundColor: theme.cardAlt, color: theme.textMuted }]}>Sửa hoặc xóa lần chuyển sẽ cập nhật cả hai giao dịch và số dư của hai ví.</Text> : null}
                  {!canEdit ? <View style={styles.notice}><Text style={{ color: theme.dangerText }}>Chưa tải đủ dữ liệu để sửa giao dịch. Vui lòng tải lại.</Text><ActionButton text="Tải lại dữ liệu" onPress={() => void load()} /></View> : null}
                  <Pressable accessibilityRole="button" disabled={!canEdit} onPress={() => {
                    const next = createTransactionEditForm(transaction);
                    setForm(transfer ? { ...next, accountId: transfer.fromAccountId, amount: String(transfer.amount), description: transfer.description ?? '', ...transactionDateFields(transfer.transferDate) } : next);
                    setToAccountId(transfer?.toAccountId ?? null); changeMode('edit');
                  }} style={[styles.action, { borderColor: theme.border, opacity: canEdit ? 1 : 0.5 }]}><Pencil size={20} color={theme.primary} /><Text style={[Typography.button, { color: theme.primary }]}>{isTransfer ? 'Sửa lần chuyển tiền' : 'Sửa giao dịch'}</Text></Pressable>
                  {canDelete ? <Pressable accessibilityRole="button" onPress={() => changeMode('delete')} style={[styles.action, { borderColor: theme.border }]}><Trash2 size={20} color={theme.dangerText} /><Text style={[Typography.button, { color: theme.dangerText }]}>{isTransfer ? 'Xóa lần chuyển tiền' : 'Xóa giao dịch'}</Text></Pressable> : <Text style={{ color: theme.textMuted }}>Chưa có thông tin liên kết để xóa toàn bộ lần chuyển tiền.</Text>}
                </> : mode === 'delete' ? <>
                  <Text style={[Typography.body, { color: theme.text }]}>{isTransfer ? 'Cả hai giao dịch của lần chuyển này sẽ bị xóa. Số dư của ví chuyển và ví nhận sẽ được cập nhật.' : 'Giao dịch này sẽ bị xóa khỏi Sổ giao dịch. Số dư ví và thống kê liên quan sẽ được cập nhật.'}</Text>
                  {detailRow('Giao dịch', transaction.description || (isTransfer ? 'Chuyển tiền' : transaction.categoryName || 'Chưa phân loại'))}
                  {detailRow('Số tiền', currency ? formatCashflowAmount(transaction.amount, currency) : String(transaction.amount))}
                  <ActionButton text="Xác nhận xóa" onPress={() => void submit('delete')} danger saving={saving} />
                  <Pressable accessibilityRole="button" disabled={saving} onPress={back} style={styles.action}><Text style={[Typography.button, { color: theme.textMuted }]}>Hủy</Text></Pressable>
                </> : form ? mode === 'account' || mode === 'toAccount' ? <>
                  {accounts.filter(account => account.isActive && (mode !== 'toAccount' || (account.id !== form.accountId && account.currency.trim().toUpperCase() === accounts.find(from => from.id === form.accountId)?.currency.trim().toUpperCase()))).map(account => {
                    const selected = (mode === 'toAccount' ? toAccountId : form.accountId) === account.id;
                    return <Pressable key={account.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => {
                      if (mode === 'toAccount') setToAccountId(account.id);
                      else {
                        updateForm({ accountId: account.id });
                        const to = accounts.find(row => row.id === toAccountId);
                        if (isTransfer && (toAccountId === account.id || to?.currency.trim().toUpperCase() !== account.currency.trim().toUpperCase())) setToAccountId(null);
                      }
                      changeMode('edit');
                    }} style={[styles.option, { borderBottomColor: theme.border }]}><Text style={[styles.grow, { color: theme.text }]}>{account.name} · {account.currency}</Text>{selected ? <Check size={20} color={theme.primary} /> : null}</Pressable>;
                  })}
                  <Text style={{ color: theme.textMuted }}>{mode === 'toAccount' ? 'Ví nhận phải khác ví chuyển và có cùng loại tiền tệ.' : 'Chọn một ví đang hoạt động.'}</Text>
                </> : mode === 'category' ? <>
                  {[{ id: null, name: 'Chưa phân loại', icon: null }, ...categories.filter(category => category.type === form.type)].map(category => <Pressable key={category.id ?? 'uncategorized'} accessibilityRole="radio" accessibilityState={{ checked: form.categoryId === category.id }} onPress={() => { updateForm({ categoryId: category.id }); changeMode('edit'); }} style={[styles.option, { borderBottomColor: theme.border }]}><CategoryIconBadge icon={category.icon} name={category.name} type={form.type} size={32} iconSize={18} /><Text style={[styles.grow, { color: theme.text }]}>{category.name}</Text>{form.categoryId === category.id ? <Check size={20} color={theme.primary} /> : null}</Pressable>)}
                </> : <>
                  {!isTransfer ? <View style={styles.row}>{(['Expense', 'Income'] as const).map(type => <Pressable key={type} accessibilityRole="radio" accessibilityState={{ checked: form.type === type }} disabled={saving} onPress={() => updateForm({ type, categoryId: form.type === type ? form.categoryId : null })} style={[styles.typeButton, { borderColor: form.type === type ? theme.primary : theme.border, backgroundColor: form.type === type ? theme.primaryPressed : theme.card }]}><Text style={{ color: form.type === type ? theme.primary : theme.text }}>{type === 'Income' ? 'Thu nhập' : 'Chi tiêu'}</Text></Pressable>)}</View> : null}
                  {label(`Số tiền (${accounts.find(account => account.id === form.accountId)?.currency ?? '—'})`)}
                  <TextInput accessibilityLabel="Số tiền giao dịch" value={form.amount} onChangeText={amount => updateForm({ amount })} editable={!saving} keyboardType="decimal-pad" style={inputStyle} />
                  {label(isTransfer ? 'Từ ví' : 'Ví')}
                  <Pressable accessibilityRole="button" disabled={saving} onPress={() => changeMode('account')} style={[styles.selector, { borderColor: theme.border }]}><Text style={[styles.grow, { color: theme.text }]}>{accountLabel(form.accountId)}{accounts.find(account => account.id === form.accountId)?.isActive ? '' : ' (không hoạt động)'}</Text><ChevronRight size={18} color={theme.textMuted} /></Pressable>
                  {isTransfer ? <>{label('Đến ví')}<Pressable accessibilityRole="button" disabled={saving} onPress={() => changeMode('toAccount')} style={[styles.selector, { borderColor: theme.border }]}><Text style={[styles.grow, { color: theme.text }]}>{toAccountId === null ? 'Chọn ví nhận' : accountLabel(toAccountId)}</Text><ChevronRight size={18} color={theme.textMuted} /></Pressable></> : <>{label('Danh mục')}
                  <Pressable accessibilityRole="button" disabled={saving} onPress={() => changeMode('category')} style={[styles.selector, { borderColor: theme.border }]}><Text style={[styles.grow, { color: theme.text }]}>{form.categoryId === null ? 'Chưa phân loại' : categories.find(category => category.id === form.categoryId)?.name ?? transaction.categoryName ?? 'Chọn danh mục'}</Text><ChevronRight size={18} color={theme.textMuted} /></Pressable>
                  </>}
                  <View style={styles.row}>
                    <View style={styles.grow}>{label('Ngày (dd/MM/yyyy)')}{Platform.OS === 'web' ? <TextInput accessibilityLabel="Ngày giao dịch dd/MM/yyyy" value={form.date} onChangeText={date => updateForm({ date })} editable={!saving} style={inputStyle} /> : <Pressable accessibilityRole="button" accessibilityLabel="Chọn ngày giao dịch" disabled={saving} onPress={() => openDatePicker('date')} style={[styles.selector, { borderColor: theme.border }]}><Text style={{ color: theme.text }}>{form.date}</Text></Pressable>}</View>
                    <View style={styles.grow}>{label('Giờ (HH:mm)')}{Platform.OS === 'web' ? <TextInput accessibilityLabel="Giờ giao dịch HH:mm" value={form.time} onChangeText={time => updateForm({ time })} editable={!saving} style={inputStyle} /> : <Pressable accessibilityRole="button" accessibilityLabel="Chọn giờ giao dịch" disabled={saving} onPress={() => openDatePicker('time')} style={[styles.selector, { borderColor: theme.border }]}><Text style={{ color: theme.text }}>{form.time}</Text></Pressable>}</View>
                  </View>
                  {datePicker && Platform.OS !== 'web' ? <>
                    <DateTimePicker value={parseTransactionDate(form.date, form.time)} mode={datePicker} display={Platform.OS === 'ios' ? 'spinner' : 'default'} is24Hour onChange={onDateChange} />
                    {Platform.OS === 'ios' ? <Pressable accessibilityRole="button" onPress={() => setDatePicker(null)} style={styles.action}><Text style={{ color: theme.primary }}>Xong</Text></Pressable> : null}
                  </> : null}
                  {label('Ghi chú')}
                  <TextInput accessibilityLabel="Ghi chú giao dịch" value={form.description} onChangeText={description => updateForm({ description })} editable={!saving} maxLength={500} multiline style={[inputStyle, styles.note]} />
                  {!isTransfer ? <>{label('Địa điểm')}
                  <TextInput accessibilityLabel="Địa điểm giao dịch" value={form.location} onChangeText={location => updateForm({ location })} editable={!saving} maxLength={255} style={inputStyle} />
                  <View style={styles.row}><Text style={[styles.grow, { color: theme.text }]}>Không tính vào thống kê thu/chi</Text><Switch accessibilityLabel="Không tính vào thống kê thu chi" value={form.isExcluded} onValueChange={isExcluded => updateForm({ isExcluded })} disabled={saving} trackColor={{ true: theme.primary }} /></View>
                  </> : <Text style={{ color: theme.textMuted }}>Chuyển tiền giữa ví không tính vào thống kê thu/chi.</Text>}
                  <ActionButton text="Lưu thay đổi" onPress={() => void submit('save')} saving={saving} />
                </> : null}
              </>}
            </>}
          </ScrollView>
        </BottomPopupSheet>
      </KeyboardAvoidingView>
    </BottomPopup>
  );
}

function ActionButton({ text, onPress, danger = false, saving = false }: { text: string; onPress: () => void; danger?: boolean; saving?: boolean }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" disabled={saving} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: danger ? theme.danger : theme.primary, opacity: saving ? 0.5 : pressed ? 0.8 : 1 }]}>
    {saving ? <ActivityIndicator color={theme.textInverse} /> : <Text style={[Typography.button, { color: theme.textInverse }]}>{text}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  content: { padding: 20, gap: 12 },
  scroll: { flexShrink: 1 },
  loading: { padding: 36 },
  summary: { alignItems: 'center', gap: 12, paddingBottom: 12 },
  amount: { fontSize: 30, lineHeight: 40, fontWeight: '600', textAlign: 'center' },
  detailRow: { paddingVertical: 10, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  detailValue: { ...Typography.body, flexShrink: 1 },
  label: { ...Typography.caption, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  button: { minHeight: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 12 },
  action: { minHeight: 48, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  notice: { padding: 12, borderRadius: 10, lineHeight: 22, gap: 12 },
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 10, fontSize: 16 },
  note: { minHeight: 80, textAlignVertical: 'top' },
  selector: { minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  option: { minHeight: 56, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  typeButton: { flex: 1, minHeight: 46, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
