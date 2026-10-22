import { Check, ChevronLeft, ChevronRight, Eye, Plus, RotateCw, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { aiApi, type ForecastModelArtifact, type ForecastTrainingResponse, type ForecastVersion, type ForecastVersionPage } from '@/api/aiApi';
import { adminStyleSheet, useAdminTheme, type AdminTheme } from './admin-design';
import { ForecastTrainingResult } from './forecast-training-result';

const pageSize = 10;
const statuses: Record<ForecastVersion['status'], string> = {
  succeeded: 'Hoàn tất', failed: 'Có lỗi', running: 'Chưa hoàn tất', imported: 'Bản được sao lưu',
};
const parameters: Record<string, string> = {
  n_estimators: 'Số cây', learning_rate: 'Tốc độ học', max_depth: 'Độ sâu tối đa',
  min_samples_leaf: 'Số mẫu tối thiểu mỗi lá', max_bins: 'Số khoảng chia', min_gain: 'Mức cải thiện tối thiểu',
};
const reasons: Record<string, string> = {
  first_eligible_model: 'Đã chọn vì đây là model đầu tiên đạt điều kiện.',
  candidate_better_on_same_validation: 'Ứng viên tốt hơn model đang dùng trên cùng tập đánh giá.',
  active_model_is_better_or_equal: 'Giữ model đang dùng vì ứng viên chưa tốt hơn.',
  candidate_did_not_pass_mean14: 'Ứng viên chưa đạt mô hình tham chiếu Mean14.',
  active_training_period_unknown_manual_review_required: 'Chưa đủ thông tin thời gian train của bản đang dùng để so sánh tự động.',
  active_training_overlaps_validation_manual_review_required: 'Dữ liệu model đang dùng đã học chồng với tập đánh giá mới; cần xem xét thủ công.',
  active_calibration_uses_later_data_manual_review_required: 'Bản đang dùng đã hiệu chỉnh từ dữ liệu muộn hơn tập đánh giá mới.',
  active_evaluation_failed_manual_review_required: 'Chưa đánh giá lại được bản đang dùng; cần xem xét thủ công.',
  comparison_metric_undefined: 'Chỉ số so sánh chưa xác định nên giữ bản đang dùng.',
};

function formatTime(value?: string) {
  if (!value) return '—';
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '—' : time.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
function number(value: unknown, digits = 4) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value) : '—';
}
function errorMessage(error: unknown) {
  const response = (error as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || (error instanceof Error ? error.message : 'Không xử lý được yêu cầu. Vui lòng thử lại.');
}
function resultFor(run: ForecastVersion, activeModelVersion: string | null): ForecastTrainingResponse | null {
  // Run lỗi và bản cũ có thể thiếu báo cáo, không đưa chúng vào component cần đủ metrics.
  if (!run.dataset || !run.split?.train || !run.split.validation || !run.split.test
    || !run.evaluation?.validation?.models || !run.evaluation.test?.models || !run.evaluation.saveCheck) return null;
  return { status: run.status, saved: run.isActive, archived: run.hasModel,
    modelVersion: run.modelVersion, activeModelVersion, runId: run.runId, dataset: run.dataset, split: run.split,
    evaluation: run.evaluation, selection: run.selection };
}

export function ForecastModelVersions({ active, busy = false, refreshKey, onTrainNew }: {
  active: boolean; busy?: boolean; refreshKey?: string; onTrainNew: () => void;
}) {
  const theme = useAdminTheme();
  const { width, height } = useWindowDimensions();
  const styles = createStyles(theme, width < 600);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ForecastVersionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<ForecastVersion | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [model, setModel] = useState<ForecastModelArtifact | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [tree, setTree] = useState(0);
  const [tab, setTab] = useState<'report' | 'model'>('report');
  const [confirmation, setConfirmation] = useState<{ run: ForecastVersion; action: 'activate' | 'delete' } | null>(null);
  const [changing, setChanging] = useState(false);
  const mounted = useRef(true);
  const request = useRef(0);
  const detailRequest = useRef(0);
  const changingRef = useRef(false);

  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
  }; }, []);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setError('');
    try {
      const response = await aiApi.forecastVersions(pageSize, page * pageSize);
      if (!mounted.current || request.current !== id) return;
      if (page > 0 && response.data.items.length === 0) { setPage(Math.max(0, Math.ceil(response.data.total / pageSize) - 1)); return; }
      setData(response.data);
    } catch (failure) {
      if (mounted.current && request.current === id) setError(errorMessage(failure));
    } finally { if (mounted.current && request.current === id) setLoading(false); }
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    if (active) queueMicrotask(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; };
  }, [active, refresh, refreshKey]);

  async function open(runId: string) {
    const id = ++detailRequest.current;
    setOpening(runId); setDetail(null); setModel(null); setModelError(''); setModelLoading(false); setTree(0); setTab('report');
    try {
      const response = await aiApi.forecastVersion(runId);
      if (mounted.current && id === detailRequest.current) setDetail(response.data);
    } catch (failure) {
      if (mounted.current && id === detailRequest.current) { setError(errorMessage(failure)); setOpening(null); }
    }
  }
  function close() { detailRequest.current++; setOpening(null); setDetail(null); }

  async function showModel() {
    setTab('model');
    if (!detail || model || modelLoading) return;
    const id = detailRequest.current;
    setModelLoading(true); setModelError('');
    try {
      const response = await aiApi.forecastModel(detail.runId);
      if (mounted.current && id === detailRequest.current) setModel(response.data);
    } catch (failure) { if (mounted.current && id === detailRequest.current) setModelError(errorMessage(failure)); }
    finally { if (mounted.current && id === detailRequest.current) setModelLoading(false); }
  }

  async function change() {
    if (!confirmation || changingRef.current || busy) return;
    changingRef.current = true; setChanging(true); setError(''); setNotice('');
    const { run, action } = confirmation;
    try {
      const response = action === 'activate' ? await aiApi.activateForecastVersion(run.runId) : await aiApi.deleteForecastVersion(run.runId);
      if (!mounted.current) return;
      setConfirmation(null);
      setNotice(response.data.catalogWarning || (action === 'activate' ? 'Đã chọn phiên bản để dự báo.' : 'Đã xóa phiên bản khỏi kho sử dụng.'));
      if (action === 'delete' && detail?.runId === run.runId) close();
      else if (opening) await open(opening);
      await refresh();
    } catch (failure) { if (mounted.current) { setError(errorMessage(failure)); setConfirmation(null); } }
    finally { changingRef.current = false; if (mounted.current) setChanging(false); }
  }

  const unavailable = busy || changing;
  const historical = detail ? resultFor(detail, data?.activeModelVersion ?? null) : null;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return <View style={styles.root}>
    <View style={styles.toolbar}>
      <View style={styles.grow}><Text style={styles.title}>Kho phiên bản</Text><Text style={styles.help}>Mỗi lần huấn luyện giữ riêng model và báo cáo để bạn xem lại hoặc chọn sử dụng.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Làm mới phiên bản model" disabled={loading || unavailable} onPress={() => void refresh()} style={[styles.button, (loading || unavailable) && styles.disabled]}><RotateCw size={15} color={theme.text} /><Text style={styles.buttonText}>Làm mới</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={unavailable} onPress={onTrainNew} style={[styles.primaryButton, unavailable && styles.disabled]}><Plus size={15} color={theme.textInverse} /><Text style={styles.primaryText}>Thêm qua huấn luyện</Text></Pressable>
    </View>
    <View style={styles.activeCard}><Text style={styles.label}>MODEL ĐANG SỬ DỤNG</Text><Text selectable style={styles.version}>{data ? data.activeModelVersion || 'Chưa có model được chọn' : loading ? 'Đang tải thông tin…' : 'Chưa tải được trạng thái model'}</Text><Text style={styles.help}>Bản mới được lưu vào kho trước khi quyết định thay bản đang dùng. Xóa phiên bản không làm thay đổi các bản còn lại.</Text></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><Text style={styles.help}>Đang đồng bộ danh mục phiên bản…</Text></View> : null}
    {!loading && data?.total === 0 ? <View style={styles.empty}><Text style={styles.title}>Chưa có phiên bản</Text><Text style={styles.help}>Bắt đầu một lần huấn luyện để tạo model và lưu kết quả tại đây.</Text></View> : null}
    {data && data.total > 0 ? <View style={styles.panel}>
      <ScrollView horizontal contentContainerStyle={styles.tableScroll}>
        <View style={styles.table}>
          <View style={[styles.row, styles.header]}>{['Phiên bản', 'Thời gian', 'Trạng thái', 'WAPE 7 ngày · Validation', 'Thao tác'].map((title, i) => <Text key={title} style={[styles.label, i === 0 ? styles.versionColumn : i === 4 ? styles.actionsColumn : styles.column]}>{title}</Text>)}</View>
          {data.items.map(run => <View key={run.runId} style={styles.row}>
            <View style={styles.versionColumn}><Text numberOfLines={2} selectable style={styles.rowVersion}>{run.modelVersion}</Text><Text style={styles.help}>{run.dataset ? `${number(run.dataset.usableUserCount, 0)} người dùng · đến ${run.dataset.asOf}` : 'Không có thông tin tập dữ liệu'}</Text></View>
            <View style={styles.column}><Text style={styles.text}>{formatTime(run.startedAt)}</Text><Text style={styles.help}>{run.source === 'existing_active_model' ? 'Sao lưu model hiện có' : 'Huấn luyện'}</Text></View>
            <View style={styles.column}><Text style={run.isActive ? styles.activeText : run.status === 'failed' ? styles.error : styles.text}>{run.isActive ? 'Đang sử dụng' : statuses[run.status] || run.status}</Text><Text style={styles.help}>{run.hasModel ? 'Có file model' : 'Chỉ có báo cáo'}</Text></View>
            <Text style={[styles.text, styles.column]}>{number(run.evaluation?.validation?.models?.ScratchGradientBoosting?.sevenDayTotalWAPE, 2)}{typeof run.evaluation?.validation?.models?.ScratchGradientBoosting?.sevenDayTotalWAPE === 'number' ? '%' : ''}</Text>
            <View style={styles.actionsColumn}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Xem phiên bản ${run.runId}`} disabled={unavailable} onPress={() => void open(run.runId)} style={styles.icon}><Eye size={17} color={theme.text} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Sử dụng phiên bản ${run.runId}`} disabled={unavailable || run.isActive || !run.hasModel || !['succeeded', 'imported'].includes(run.status)} onPress={() => setConfirmation({ run, action: 'activate' })} style={[styles.icon, (run.isActive || !run.hasModel || !['succeeded', 'imported'].includes(run.status)) && styles.disabled]}><Check size={17} color={theme.primary} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Xóa phiên bản ${run.runId}`} accessibilityHint={run.isActive ? 'Chọn model khác trước khi xóa phiên bản đang dùng.' : 'Xóa model và kết quả khỏi kho sử dụng.'} disabled={unavailable || run.isActive} onPress={() => setConfirmation({ run, action: 'delete' })} style={[styles.icon, run.isActive && styles.disabled]}><Trash2 size={16} color={theme.danger} /></Pressable>
            </View>
          </View>)}
        </View>
      </ScrollView>
      <View style={styles.footer}><Text style={styles.help}>{data.total} phiên bản · Chỉ so sánh điểm giữa các model trên cùng tập đánh giá.</Text><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Trang phiên bản trước" disabled={page === 0 || loading || unavailable} onPress={() => setPage(page - 1)} style={[styles.icon, page === 0 && styles.disabled]}><ChevronLeft size={17} color={theme.text} /></Pressable><Text style={styles.text}>{page + 1} / {totalPages}</Text><Pressable accessibilityRole="button" accessibilityLabel="Trang phiên bản sau" disabled={page + 1 >= totalPages || loading || unavailable} onPress={() => setPage(page + 1)} style={[styles.icon, page + 1 >= totalPages && styles.disabled]}><ChevronRight size={17} color={theme.text} /></Pressable></View></View>
    </View> : null}

    <Modal transparent visible={opening !== null} animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}><View style={[styles.dialog, { height: Math.min(height * .9, 960) }]}>
        <View style={styles.dialogHeader}><View style={styles.grow}><Text style={styles.title}>Chi tiết phiên bản</Text><Text selectable style={styles.help}>{opening}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết phiên bản" onPress={close} style={styles.icon}><X size={20} color={theme.text} /></Pressable></View>
        {!detail ? <View style={styles.empty}><ActivityIndicator color={theme.primary} /></View> : <>
          <View style={styles.tabs}><Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'report' }} onPress={() => setTab('report')} style={[styles.button, tab === 'report' && styles.selected]}><Text style={styles.buttonText}>Báo cáo huấn luyện</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'model' }} disabled={!detail.hasModel || !['succeeded', 'imported'].includes(detail.status)} onPress={() => void showModel()} style={[styles.button, tab === 'model' && styles.selected, !detail.hasModel && styles.disabled]}><Text style={styles.buttonText}>Thông số file model</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.detailContent}>
            {tab === 'report' ? <>
              <Text style={detail.isActive ? styles.activeText : styles.text}>{detail.isActive ? 'Đang sử dụng để dự báo' : statuses[detail.status]}</Text>
              <Text style={styles.help}>Bắt đầu {formatTime(detail.startedAt)} · Kết thúc {formatTime(detail.finishedAt)}</Text>
              {detail.selection?.reason ? <Text style={styles.notice}>{reasons[detail.selection.reason] || 'Xem xét kết quả đánh giá trước khi chọn phiên bản.'}</Text> : null}
              {detail.error ? <Text accessibilityRole="alert" style={styles.error}>{detail.error.message}</Text> : null}
              <Text style={styles.sectionTitle}>Tham số lúc huấn luyện</Text>
              <View style={styles.parameterGrid}>{Object.entries(detail.parameters || {}).map(([key, value]) => <View key={key} style={styles.parameter}><Text style={styles.help}>{parameters[key] || key}</Text><Text style={styles.text}>{number(value, 12)}</Text></View>)}</View>
              {detail.trainLogMSE ? <Text style={styles.help}>MSE trên nhãn log: {detail.trainLogMSE.initial.toExponential(4)} → {detail.trainLogMSE.final.toExponential(4)} · Calibration: {number(detail.calibration, 6)}</Text> : null}
              {historical ? <ForecastTrainingResult result={historical} /> : <Text style={styles.help}>Phiên bản này chưa có đủ báo cáo đánh giá theo ngày và theo tuần.</Text>}
              <Text style={styles.help}>Đồng bộ danh mục lúc {formatTime(detail.syncedAt)}. Quyết định tự động ở trên là kết quả của lần train; trạng thái đang dùng phản ánh lựa chọn hiện tại.</Text>
            </> : <>
              {modelLoading ? <ActivityIndicator color={theme.primary} /> : null}
              {modelError ? <><Text accessibilityRole="alert" style={styles.error}>{modelError}</Text><Pressable accessibilityRole="button" onPress={() => void showModel()} style={styles.button}><Text style={styles.buttonText}>Thử tải lại file</Text></Pressable></> : null}
              {model ? <>
                <Text style={styles.sectionTitle}>{model.model} · Định dạng {model.formatVersion}</Text>
                <Text style={styles.help}>{model.trees.length} cây · {model.nFeatures} đặc trưng · Base value (log): {number(model.baseValue, 8)} · Calibration: {number(model.metadata.calibration ?? 1, 6)}</Text>
                <View style={styles.parameterGrid}>{Object.entries(model.params).map(([key, value]) => <View key={key} style={styles.parameter}><Text style={styles.help}>{parameters[key] || key}</Text><Text style={styles.text}>{number(value, 12)}</Text></View>)}</View>
                <Text style={styles.sectionTitle}>Thứ tự đặc trưng trong file</Text>
                {model.metadata.featureNames.map((feature, index) => <Text key={feature} selectable style={styles.code}>{index + 1}. {feature}</Text>)}
                <View style={styles.footer}><Text style={styles.sectionTitle}>Cấu trúc cây {tree + 1} / {model.trees.length}</Text><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Cây trước" disabled={tree === 0} onPress={() => setTree(tree - 1)} style={styles.icon}><ChevronLeft size={17} color={theme.text} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Cây tiếp theo" disabled={tree + 1 >= model.trees.length} onPress={() => setTree(tree + 1)} style={styles.icon}><ChevronRight size={17} color={theme.text} /></Pressable></View></View>
                <Text selectable style={styles.code}>{JSON.stringify(model.trees[tree], null, 2).slice(0, 30000)}</Text>
              </> : null}
            </>}
          </ScrollView>
          <View style={styles.footer}>
            <Text style={detail.isActive ? styles.activeText : styles.help}>{detail.isActive ? 'Đang sử dụng' : 'Chọn phiên bản sau khi xem báo cáo'}</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={unavailable || detail.isActive} onPress={() => setConfirmation({ run: detail, action: 'delete' })} style={[styles.button, detail.isActive && styles.disabled]}><Trash2 size={15} color={theme.danger} /><Text style={styles.buttonText}>Xóa</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={unavailable || detail.isActive || !detail.hasModel || !['succeeded', 'imported'].includes(detail.status)} onPress={() => setConfirmation({ run: detail, action: 'activate' })} style={[styles.primaryButton, (detail.isActive || !detail.hasModel || !['succeeded', 'imported'].includes(detail.status)) && styles.disabled]}><Text style={styles.primaryText}>Sử dụng phiên bản này</Text></Pressable>
            </View>
          </View>
        </>}
      </View></View>
    </Modal>

    <Modal transparent visible={confirmation !== null} animationType="fade" onRequestClose={() => { if (!changing) setConfirmation(null); }}>
      <View style={styles.overlay}><View style={styles.confirmDialog}>
        <Text style={styles.title}>{confirmation?.action === 'delete' ? 'Xóa phiên bản này?' : 'Sử dụng phiên bản này?'}</Text>
        <Text selectable style={styles.version}>{confirmation?.run.modelVersion}</Text>
        <Text style={styles.help}>{confirmation?.action === 'delete' ? 'File model sẽ bị xóa khỏi kho và không thể khôi phục bằng thao tác này. Báo cáo đối soát vẫn được giữ trong lịch sử hệ thống.' : 'Các lần dự báo tiếp theo sẽ dùng phiên bản này. Việc chọn thủ công có thể dùng cả ứng viên chưa đạt điều kiện tự động; hãy kiểm tra báo cáo trước khi chọn.'}</Text>
        <View style={styles.actions}><Pressable accessibilityRole="button" disabled={changing} onPress={() => setConfirmation(null)} style={styles.button}><Text style={styles.buttonText}>Hủy</Text></Pressable><Pressable accessibilityRole="button" disabled={changing || busy} onPress={() => void change()} style={[styles.primaryButton, confirmation?.action === 'delete' && { backgroundColor: theme.danger }]}>{changing ? <ActivityIndicator size="small" color={theme.textInverse} /> : null}<Text style={styles.primaryText}>{confirmation?.action === 'delete' ? 'Xóa phiên bản' : 'Chọn sử dụng'}</Text></Pressable></View>
      </View></View>
    </Modal>
  </View>;
}

function createStyles(theme: AdminTheme, narrow: boolean) {
  return adminStyleSheet({
    root: { gap: 18 }, grow: { flex: 1, minWidth: 180 },
    toolbar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    title: { color: theme.text, fontSize: 18, fontWeight: '600' }, sectionTitle: { color: theme.text, fontSize: 14, fontWeight: '600' },
    help: { color: theme.textMuted, fontSize: 12, lineHeight: 20 }, label: { color: theme.textMuted, fontSize: 10, fontWeight: '600', lineHeight: 17 },
    text: { color: theme.text, fontSize: 12, lineHeight: 20 }, version: { color: theme.text, fontSize: 12, lineHeight: 22 },
    rowVersion: { color: theme.text, fontSize: 11, lineHeight: 18 }, activeText: { color: theme.primary, fontSize: 12, fontWeight: '600' },
    notice: { color: theme.primary, backgroundColor: theme.primaryPressed, padding: 12, borderRadius: 7, fontSize: 12, lineHeight: 20 },
    error: { color: theme.danger, fontSize: 12, lineHeight: 20 }, disabled: { opacity: .4 },
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, borderRadius: 7, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card },
    buttonText: { color: theme.text, fontSize: 12, fontWeight: '500' },
    primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 11, borderRadius: 7, backgroundColor: theme.primary },
    primaryText: { color: theme.textInverse, fontSize: 12, fontWeight: '600' },
    activeCard: { padding: 18, gap: 7, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card },
    panel: { borderRadius: 9, borderWidth: 1, borderColor: theme.border, overflow: 'hidden', backgroundColor: theme.card },
    tableScroll: { minWidth: '100%' }, table: { minWidth: '100%' },
    row: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 15, borderBottomWidth: 1, borderBottomColor: theme.border },
    header: { backgroundColor: theme.cardAlt }, versionColumn: { width: 310, gap: 5 }, column: { width: 165, gap: 4 },
    actionsColumn: { width: 120, flexDirection: 'row', gap: 5 }, actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9 },
    icon: { width: 34, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    footer: { padding: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    empty: { padding: 30, alignItems: 'center', gap: 12 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', alignItems: 'center', justifyContent: 'center', padding: narrow ? 10 : 25 },
    dialog: { width: '100%', maxWidth: 1100, borderRadius: 12, backgroundColor: theme.screen, overflow: 'hidden' },
    dialogHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, padding: 15 }, selected: { borderColor: theme.primary, backgroundColor: theme.primaryPressed },
    detailContent: { padding: narrow ? 15 : 24, gap: 15, paddingBottom: 40 },
    parameterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, parameter: { flexBasis: narrow ? '45%' : '30%', flexGrow: 1, gap: 6, padding: 14, borderRadius: 7, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
    code: { color: theme.text, fontSize: 11, lineHeight: 19, fontFamily: 'monospace', backgroundColor: theme.cardAlt, padding: 7 },
    confirmDialog: { width: '100%', maxWidth: 520, padding: 24, gap: 18, borderRadius: 12, backgroundColor: theme.card },
  });
}
