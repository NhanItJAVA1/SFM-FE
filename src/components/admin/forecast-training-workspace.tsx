import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, CircleDashed, Play, RotateCw, Search, SlidersHorizontal, Users } from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { aiApi, type ForecastTrainingResponse } from '@/api/aiApi';
import type { AdminUser } from '@/api/adminApi';
import { BottomPopup, BottomPopupSheet } from '@/components/bottom-popup';
import { FocusedScreenTransition } from '@/components/screen-transition';
import { adminStyleSheet, useAdminTheme, type AdminTheme } from './admin-design';
import { canTrainUser, getTrainingErrorMessage, getTrainingUserIssue, isTrainingDateValid, loadTrainingUsers } from './training-users';

const pageSize = 10;

export function ForecastTrainingWorkspace({ renderResult, active = true }: {
  renderResult: (result: ForecastTrainingResponse) => ReactNode;
  active?: boolean;
}) {
  const theme = useAdminTheme();
  const width = useWindowDimensions().width;
  const desktop = width >= 1200;
  const styles = createStyles(theme, desktop, width < 600);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTraining, setIsTraining] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [trainingError, setTrainingError] = useState('');
  const [selectionNotice, setSelectionNotice] = useState('');
  const [search, setSearch] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [asOf, setAsOf] = useState('2025-12-31');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [result, setResult] = useState<ForecastTrainingResponse | null>(null);
  const requestRef = useRef(0);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshUsers = useCallback(async () => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setLoadError('');
    try {
      const nextUsers = await loadTrainingUsers();
      if (request !== requestRef.current || !mountedRef.current) return;
      setUsers(nextUsers);
      const eligibleIds = new Set(nextUsers.filter(user => canTrainUser(user, asOf)).map(user => user.id));
      setSelectedIds(current => current.filter(id => eligibleIds.has(id)));
    } catch (error) {
      if (request === requestRef.current && mountedRef.current) {
        setLoadError(error instanceof Error ? error.message : 'Không tải được danh sách người dùng.');
      }
    } finally {
      if (request === requestRef.current && mountedRef.current) setIsLoading(false);
    }
  }, [asOf, setSelectedIds]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current += 1; };
  }, []);

  useEffect(() => {
    if (active && !runningRef.current && isTrainingDateValid(asOf)) void refreshUsers();
  }, [active, asOf, refreshUsers]);

  const eligibleUsers = users.filter(user => canTrainUser(user, asOf));
  const selectedUsers = eligibleUsers.filter(user => selectedIds.includes(user.id));
  const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
  const filteredUsers = users.filter(user =>
    (!onlySelected || selectedIds.includes(user.id)) &&
    (!normalizedSearch || [user.displayName, user.username, user.email].some(value => value?.toLocaleLowerCase('vi-VN').includes(normalizedSearch))),
  );
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleEligible = visibleUsers.filter(user => canTrainUser(user, asOf));
  const allVisibleSelected = visibleEligible.length > 0 && visibleEligible.every(user => selectedIds.includes(user.id));
  const trainingCount = scope === 'all' ? eligibleUsers.length : selectedUsers.length;
  const isBusy = isLoading || isTraining;
  const dateValid = isTrainingDateValid(asOf);
  const canSubmit = !isBusy && !loadError && dateValid && trainingCount >= 2;

  function toggleUser(user: AdminUser) {
    if (!canTrainUser(user, asOf) || isBusy) return;
    setScope('selected');
    setTrainingError('');
    setSelectionNotice('');
    setSelectedIds(current => current.includes(user.id) ? current.filter(id => id !== user.id) : [...current, user.id]);
  }

  function toggleVisible() {
    if (isBusy || visibleEligible.length === 0) return;
    setScope('selected');
    setSelectionNotice('');
    setSelectedIds(current => allVisibleSelected
      ? current.filter(id => !visibleEligible.some(user => user.id === id))
      : [...new Set([...current, ...visibleEligible.map(user => user.id)])]);
  }

  function changeAsOf(nextAsOf: string) {
    setAsOf(nextAsOf);
    setTrainingError('');
    setSelectionNotice('');
    if (!isTrainingDateValid(nextAsOf)) return;
    const allowedIds = new Set(users.filter(user => canTrainUser(user, nextAsOf)).map(user => user.id));
    const nextIds = selectedIds.filter(id => allowedIds.has(id));
    if (nextIds.length !== selectedIds.length) {
      setSelectedIds(nextIds);
      setSelectionNotice(`Đã bỏ chọn ${selectedIds.length - nextIds.length} người dùng không đủ điều kiện theo ngày chốt mới. Vui lòng kiểm tra lại lựa chọn.`);
    }
  }

  function handleDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android' || event.type === 'dismissed') setDatePickerVisible(false);
    if (event.type !== 'dismissed' && date) {
      changeAsOf(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
      setTrainingError('');
    }
  }

  async function train() {
    if (!canSubmit || runningRef.current) return;
    runningRef.current = true;
    setIsTraining(true);
    setTrainingError('');
    try {
      // Recheck roles before sending IDs, including selections made on earlier pages.
      const freshUsers = await loadTrainingUsers();
      if (!mountedRef.current) return;
      const freshEligible = freshUsers.filter(user => canTrainUser(user, asOf));
      const eligibleIds = new Set(freshEligible.map(user => user.id));
      setUsers(freshUsers);
      setSelectedIds(current => current.filter(id => eligibleIds.has(id)));
      const userIds = scope === 'all' ? [...eligibleIds] : selectedIds.filter(id => eligibleIds.has(id));
      if (scope === 'selected' && userIds.length !== selectedIds.length) {
        throw new Error('Một số người dùng không còn đủ điều kiện theo ngày chốt. Danh sách đã được cập nhật; vui lòng kiểm tra lý do và chọn lại trước khi huấn luyện.');
      }
      if (userIds.length < 2) throw new Error('Cần ít nhất 2 người dùng đang hoạt động và có tài khoản tài chính trước hoặc trong ngày chốt.');
      const response = await aiApi.trainForecast(scope === 'all' ? { asOf } : { asOf, userIds });
      if (mountedRef.current) setResult(response.data);
    } catch (error) {
      if (mountedRef.current) setTrainingError(getTrainingErrorMessage(error, asOf));
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setIsTraining(false);
    }
  }

  const dateValue = new Date(`${isTrainingDateValid(asOf) ? asOf : '2025-12-31'}T00:00:00`);

  return <FocusedScreenTransition variant="fade" style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={isLoading} enabled={!isTraining} onRefresh={() => { if (!isTraining) void refreshUsers(); }} tintColor={theme.primary} />}>
      <View style={styles.pageHeading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>MÔ HÌNH DỰ BÁO</Text>
          <Text style={styles.title}>Huấn luyện mô hình AI</Text>
          <Text style={styles.description}>Thiết lập dữ liệu và đánh giá chất lượng mô hình dự báo chi tiêu.</Text>
        </View>
        <View style={styles.stateBadge}><CircleDashed size={14} color={theme.textMuted} /><Text style={styles.stateText}>{isTraining ? 'Đang huấn luyện' : result ? 'Đã có kết quả' : 'Chưa chạy huấn luyện'}</Text></View>
      </View>

      <View style={styles.workspace}>
        <View style={styles.userPanel}>
          <View style={styles.panelHeading}>
            <View style={styles.headingCopy}><Text style={styles.panelTitle}>Người dùng huấn luyện</Text><Text style={styles.description}>{eligibleUsers.length} / {users.length} người dùng đủ điều kiện đến {asOf.split('-').reverse().join('/')} · Không bao gồm Admin</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Tải lại người dùng huấn luyện" disabled={isBusy} onPress={() => void refreshUsers()} style={[styles.iconButton, isBusy && styles.disabled]}><RotateCw size={15} color={theme.textMuted} /></Pressable>
          </View>
          <View style={styles.toolbar}>
            <View style={styles.searchField}><Search size={15} color={theme.textMuted} /><TextInput accessibilityLabel="Tìm người dùng huấn luyện" placeholder="Tìm tên, email…" placeholderTextColor={theme.inputPlaceholder} style={styles.searchInput} value={search} onChangeText={value => { setSearch(value); setPage(1); }} /></View>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: onlySelected }} onPress={() => { setOnlySelected(value => !value); setPage(1); }} style={[styles.selectedFilter, onlySelected && styles.selectedSurface]}><Text style={[styles.smallText, onlySelected && styles.accentText]}>Đã chọn ({selectedUsers.length})</Text></Pressable>
          </View>
          <View style={styles.tableHeader}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel="Chọn người dùng trên trang" accessibilityState={{ checked: allVisibleSelected, disabled: isBusy || !visibleEligible.length }} disabled={isBusy || !visibleEligible.length} onPress={toggleVisible} style={styles.checkboxHit}><View style={[styles.checkbox, allVisibleSelected && styles.checkboxChecked]}>{allVisibleSelected ? <Check size={12} color={theme.textInverse} /> : null}</View></Pressable>
            <Text style={[styles.columnLabel, styles.grow]}>NGƯỜI DÙNG</Text><Text style={styles.columnLabel}>ĐIỀU KIỆN</Text>
          </View>
          {isLoading ? <View style={styles.empty}><ActivityIndicator color={theme.primary} /><Text style={styles.description}>Đang tải người dùng…</Text></View> : loadError ? <View style={styles.empty}><Text accessibilityRole="alert" style={styles.errorText}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => void refreshUsers()} style={styles.secondaryButton}><Text style={styles.smallText}>Thử lại</Text></Pressable></View> : visibleUsers.length === 0 ? <View style={styles.empty}><Users size={25} color={theme.textMuted} /><Text style={styles.panelTitle}>{onlySelected ? 'Chưa có người dùng được chọn' : 'Không tìm thấy người dùng'}</Text><Text style={styles.description}>Thử thay đổi từ khóa hoặc bộ lọc đã chọn.</Text></View> : visibleUsers.map(user => {
            const checked = selectedIds.includes(user.id);
            const issue = getTrainingUserIssue(user, asOf);
            const eligible = issue === null;
            return <Pressable key={user.id} accessibilityRole="checkbox" accessibilityLabel={`Chọn ${user.displayName || user.username}`} accessibilityHint={issue ?? 'Đủ điều kiện theo ngày chốt đã chọn.'} accessibilityState={{ checked, disabled: !eligible || isBusy }} disabled={!eligible || isBusy} onPress={() => toggleUser(user)} style={({ hovered }) => [styles.userRow, checked && styles.selectedSurface, hovered && !checked && styles.hoverSurface, !eligible && styles.ineligible]}>
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Check size={12} color={theme.textInverse} /> : null}</View>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(user.displayName || user.username).charAt(0).toUpperCase()}</Text></View>
              <View style={styles.userCopy}><Text numberOfLines={1} style={styles.userName}>{user.displayName || user.username}</Text><Text numberOfLines={1} style={styles.userEmail}>{user.email}</Text>{issue ? <Text style={styles.userIssue}>{issue}</Text> : null}</View>
              <View style={styles.status}><View style={[styles.statusDot, eligible && styles.activeDot]} /><Text style={styles.statusText}>{eligible ? 'Đủ điều kiện' : 'Không đủ'}</Text></View>
            </Pressable>;
          })}
          <View style={styles.tableFooter}>
            <Text style={styles.smallText}>{filteredUsers.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredUsers.length)} / ${filteredUsers.length} người dùng` : '0 người dùng'}</Text>
            <View style={styles.pagination}><Pressable accessibilityRole="button" accessibilityLabel="Trang người dùng trước" disabled={currentPage <= 1 || isLoading} onPress={() => setPage(currentPage - 1)} style={[styles.iconButton, currentPage <= 1 && styles.disabled]}><ChevronLeft size={15} color={theme.textMuted} /></Pressable><Text style={styles.smallText}>{currentPage} / {totalPages}</Text><Pressable accessibilityRole="button" accessibilityLabel="Trang người dùng sau" disabled={currentPage >= totalPages || isLoading} onPress={() => setPage(currentPage + 1)} style={[styles.iconButton, currentPage >= totalPages && styles.disabled]}><ChevronRight size={15} color={theme.textMuted} /></Pressable></View>
          </View>
        </View>

        <View style={styles.configuration}>
          <View style={styles.configHeading}><SlidersHorizontal size={17} color={theme.textMuted} /><Text style={styles.panelTitle}>Cấu hình huấn luyện</Text></View>
          <View style={styles.configBody}>
            <View style={styles.field}><Text style={styles.label}>Ngày chốt dữ liệu</Text><Text style={styles.helpText}>Sử dụng lịch sử giao dịch đến ngày này.</Text>
              {Platform.OS === 'web' ? <input aria-label="Ngày chốt dữ liệu" type="date" disabled={isTraining} value={asOf} onChange={event => changeAsOf(event.currentTarget.value)} style={{ backgroundColor: theme.inputBackground, color: theme.text, colorScheme: theme.screen === '#14171c' ? 'dark' : 'light', fontFamily: 'AdminInter, sans-serif', fontSize: 13, border: `1px solid ${theme.border}`, borderRadius: 7, minHeight: 42, padding: '0 12px', width: '100%', boxSizing: 'border-box' }} /> : <Pressable accessibilityRole="button" accessibilityLabel="Ngày chốt dữ liệu" disabled={isTraining} onPress={() => setDatePickerVisible(true)} style={styles.dateButton}><CalendarDays size={16} color={theme.textMuted} /><Text style={styles.dateText}>{asOf.split('-').reverse().join('/')}</Text></Pressable>}
              {!dateValid ? <Text style={styles.errorText}>Chọn ngày hợp lệ để tiếp tục.</Text> : null}
            </View>
            <View style={styles.field}><View style={styles.summaryRow}><Text style={styles.label}>Phạm vi dữ liệu</Text>{selectedUsers.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Bỏ chọn tất cả người dùng" disabled={isTraining} onPress={() => { setSelectedIds([]); setScope('selected'); setTrainingError(''); }}><Text style={styles.accentText}>Bỏ chọn</Text></Pressable> : null}</View>
                {(['all', 'selected'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: scope === value, disabled: isTraining }} disabled={isTraining} onPress={() => { setScope(value); setTrainingError(''); }} style={[styles.scopeOption, scope === value && styles.scopeSelected]}><View style={[styles.radio, scope === value && styles.radioSelected]}>{scope === value ? <View style={styles.radioDot} /> : null}</View><View style={styles.grow}><Text style={styles.optionTitle}>{value === 'all' ? 'Tất cả người dùng' : 'Chọn người dùng cụ thể'}</Text><Text style={styles.helpText}>{value === 'all' ? `${eligibleUsers.length} người dùng đủ điều kiện` : `${selectedUsers.length} tài khoản đã chọn`}</Text></View></Pressable>)}
            </View>
            <View style={styles.summary}><View style={styles.summaryRow}><Text style={styles.helpText}>Người dùng huấn luyện</Text><Text style={styles.summaryValue}>{trainingCount}</Text></View><View style={styles.summaryRow}><Text style={styles.helpText}>Loại mô hình</Text><Text style={styles.smallText}>Dự báo chi tiêu</Text></View></View>
            <Text style={styles.helpText}>Cần ít nhất 2 người dùng đang hoạt động, có tài khoản tài chính trước hoặc trong ngày chốt. Ngày giao dịch không thay thế ngày tạo tài khoản.</Text>
            {selectionNotice ? <Text accessibilityRole="alert" style={styles.userIssue}>{selectionNotice}</Text> : null}
            {trainingError ? <Text accessibilityRole="alert" style={styles.errorText}>{trainingError}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Bắt đầu huấn luyện" accessibilityState={{ disabled: !canSubmit, busy: isTraining }} disabled={!canSubmit} onPress={() => void train()} style={[styles.trainButton, !canSubmit && styles.disabled]}>{isTraining ? <ActivityIndicator size="small" color={theme.textInverse} /> : <Play size={14} color={theme.textInverse} />}<Text style={styles.trainButtonText}>{isTraining ? 'Đang huấn luyện…' : 'Bắt đầu huấn luyện'}</Text></Pressable>
            {isTraining ? <Text style={styles.helpText}>Mô hình đang xử lý dữ liệu. Kết quả sẽ xuất hiện bên dưới khi hoàn tất.</Text> : null}
          </View>
        </View>
      </View>

      <View style={styles.resultsHeading}><Text style={styles.panelTitle}>Kết quả huấn luyện</Text><Text style={styles.helpText}>{result ? 'Kết quả của lần chạy gần nhất trong phiên này.' : 'Các chỉ số đánh giá sẽ được hiển thị sau khi chạy.'}</Text></View>
      {result ? renderResult(result) : <View style={styles.resultsEmpty}><View style={styles.resultsIcon}><CircleCheck size={24} strokeWidth={1.4} color={theme.textMuted} /></View><View style={styles.headingCopy}><Text style={styles.panelTitle}>{isTraining ? 'Đang chuẩn bị kết quả' : 'Chưa có kết quả huấn luyện'}</Text><Text style={styles.description}>Thiết lập dữ liệu, bắt đầu huấn luyện và so sánh chất lượng mô hình tại đây.</Text></View></View>}
    </ScrollView>
    {datePickerVisible && Platform.OS === 'android' ? <DateTimePicker value={dateValue} mode="date" display="default" onChange={handleDateChange} /> : null}
    {Platform.OS === 'ios' ? <BottomPopup transparent visible={datePickerVisible} onRequestClose={() => setDatePickerVisible(false)}><View style={styles.modalOverlay}><Pressable style={styles.backdrop} onPress={() => setDatePickerVisible(false)} /><BottomPopupSheet style={styles.dateSheet}><View style={styles.dateSheetHeader}><Text style={styles.panelTitle}>Ngày chốt dữ liệu</Text><Pressable accessibilityRole="button" onPress={() => setDatePickerVisible(false)}><Text style={styles.accentText}>Xong</Text></Pressable></View><DateTimePicker value={dateValue} mode="date" display="spinner" onChange={handleDateChange} /></BottomPopupSheet></View></BottomPopup> : null}
  </FocusedScreenTransition>;
}

function createStyles(theme: AdminTheme, desktop: boolean, narrow: boolean) {
  return adminStyleSheet({
    screen: { flex: 1, backgroundColor: theme.screen },
    content: { alignSelf: 'center', width: '100%', maxWidth: 1360, padding: narrow ? 18 : 36, paddingBottom: 48 },
    pageHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, justifyContent: 'space-between', marginBottom: 28 },
    headingCopy: { flex: 1, minWidth: narrow ? 220 : 280 },
    eyebrow: { color: theme.textMuted, fontSize: 10, fontWeight: '500', letterSpacing: 1.4, marginBottom: 9 },
    title: { color: theme.text, fontSize: narrow ? 23 : 27, fontWeight: '600', letterSpacing: -0.7, lineHeight: 36 },
    description: { color: theme.textMuted, fontSize: 12, lineHeight: 20, marginTop: 5 },
    stateBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10 },
    stateText: { color: theme.textMuted, fontSize: 11 },
    workspace: { flexDirection: desktop ? 'row' : 'column-reverse', alignItems: 'flex-start', gap: 22 },
    userPanel: { flex: desktop ? 1 : undefined, width: desktop ? undefined : '100%', minWidth: 0, borderWidth: 1, borderColor: theme.border, borderRadius: 10, backgroundColor: theme.card, overflow: 'hidden' },
    panelHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: narrow ? 16 : 20 },
    panelTitle: { color: theme.text, fontSize: 14, fontWeight: '600', lineHeight: 21 },
    grow: { flex: 1, minWidth: 0 },
    toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: narrow ? 16 : 20, paddingBottom: 16 },
    searchField: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.inputBackground, borderColor: theme.border, borderWidth: 1, borderRadius: 7, paddingHorizontal: 11, minHeight: 39 },
    searchInput: { flex: 1, minWidth: 0, color: theme.text, fontSize: 12, paddingVertical: 9, outlineWidth: 0 },
    selectedFilter: { justifyContent: 'center', paddingHorizontal: 11, borderColor: theme.border, borderWidth: 1, borderRadius: 7 },
    smallText: { color: theme.textMuted, fontSize: 11, lineHeight: 17 },
    accentText: { color: theme.primary, fontSize: 12, fontWeight: '500' },
    tableHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.cardAlt, paddingHorizontal: narrow ? 16 : 20, paddingVertical: 9, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
    columnLabel: { color: theme.textMuted, fontSize: 9, fontWeight: '500', letterSpacing: 0.7 },
    checkboxHit: { paddingVertical: 3 },
    checkbox: { width: 17, height: 17, borderWidth: 1, borderColor: theme.borderStrong, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { borderColor: theme.primary, backgroundColor: theme.primary },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: narrow ? 9 : 12, minHeight: 72, paddingHorizontal: narrow ? 16 : 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.border },
    selectedSurface: { backgroundColor: theme.primaryPressed },
    hoverSurface: { backgroundColor: theme.cardAlt },
    ineligible: { backgroundColor: theme.cardAlt },
    avatar: { display: narrow ? 'none' : 'flex', width: 32, height: 32, borderRadius: 8, backgroundColor: theme.cardAlt, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: theme.textMuted, fontSize: 12, fontWeight: '500' },
    userCopy: { flex: 1, minWidth: 0 },
    userName: { color: theme.text, fontSize: 12, fontWeight: '500', lineHeight: 19 },
    userEmail: { color: theme.textMuted, fontSize: 11, lineHeight: 17, marginTop: 2 },
    userIssue: { color: theme.warning, fontSize: 11, lineHeight: 18, marginTop: 4 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: narrow ? 79 : undefined },
    statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.textMuted },
    activeDot: { backgroundColor: theme.primary },
    statusText: { color: theme.textMuted, fontSize: 10, lineHeight: 16, flexShrink: 1 },
    tableFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: narrow ? 12 : 16 },
    pagination: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    iconButton: { width: 30, height: 30, borderColor: theme.border, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: 0.45 },
    empty: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
    errorText: { color: theme.dangerText, fontSize: 12, lineHeight: 19 },
    secondaryButton: { borderColor: theme.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
    configuration: { width: desktop ? 316 : '100%', backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 10, overflow: 'hidden' },
    configHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 20, borderBottomColor: theme.border, borderBottomWidth: 1 },
    configBody: { padding: 20, gap: 20 },
    field: { gap: 9 },
    label: { color: theme.text, fontSize: 12, fontWeight: '500' },
    helpText: { color: theme.textMuted, fontSize: 11, lineHeight: 18 },
    dateButton: { flexDirection: 'row', alignItems: 'center', gap: 9, borderColor: theme.border, borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, minHeight: 42 },
    dateText: { color: theme.text, fontSize: 13 },
    scopeOption: { flexDirection: 'row', gap: 10, alignItems: 'center', borderColor: theme.border, borderWidth: 1, borderRadius: 7, padding: 12 },
    scopeSelected: { borderColor: theme.primary, backgroundColor: theme.primaryPressed },
    radio: { width: 15, height: 15, borderRadius: 8, borderColor: theme.borderStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    radioSelected: { borderColor: theme.primary },
    radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.primary },
    optionTitle: { color: theme.text, fontSize: 11, fontWeight: '500', lineHeight: 19 },
    summary: { gap: 12, paddingVertical: 16, borderTopColor: theme.border, borderTopWidth: 1, borderBottomColor: theme.border, borderBottomWidth: 1 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    summaryValue: { color: theme.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
    trainButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 7, minHeight: 42, backgroundColor: theme.primary },
    trainButtonText: { color: theme.textInverse, fontSize: 12, fontWeight: '500' },
    resultsHeading: { gap: 3, marginTop: 30, marginBottom: 14 },
    resultsEmpty: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: 24, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 10 },
    resultsIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: theme.cardAlt, alignItems: 'center', justifyContent: 'center' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: theme.overlay },
    dateSheet: { backgroundColor: theme.sheet, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 18, paddingBottom: 32 },
    dateSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  });
}
