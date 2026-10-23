import { AlertTriangle, ChevronDown, ChevronUp, Clock3, Copy, Database, Gauge, Info, Play, RefreshCw, Square, Wifi } from 'lucide-react-native';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import type { LoadTestMetricPoint, LoadTestP95Point, LoadTestScenario, LoadTestTarget } from '@/api/adminApi';
import { useAdminLoadTesting } from '@/hooks/use-admin-load-testing';
import { formatLoadTestErrorDetails } from '@/utils/load-test-error';
import { adminStyleSheet, useAdminTheme, type AdminTheme } from './admin-design';

const scenarios: { id: LoadTestScenario; label: string; detail: string; vus: number; durationSeconds: number; help: string }[] = [
  { id: 'smoke', label: 'Smoke', detail: 'Kiểm tra nhanh ở mức tải rất nhỏ.', vus: 1, durationSeconds: 30, help: 'Kiểm tra nhanh xem API có hoạt động ổn định ở mức tải rất nhỏ hay không.' },
  { id: 'load', label: 'Load', detail: 'Mô phỏng mức truy cập dự kiến.', vus: 10, durationSeconds: 300, help: 'Kiểm tra hiệu năng khi nhiều người dùng truy cập đồng thời trong điều kiện tải dự kiến.' },
  { id: 'stress', label: 'Stress', detail: 'Quan sát hệ thống ở mức tải cao.', vus: 25, durationSeconds: 600, help: 'Kiểm tra hệ thống khi chịu tải cao để quan sát lỗi, độ trễ và giới hạn hiệu năng.' },
  { id: 'spike', label: 'Spike', detail: 'Mặc định 50 VUs trong 2 phút.', vus: 50, durationSeconds: 120, help: 'Kiểm tra phản ứng trước tình huống tải tăng đột biến. Cấu hình này dùng số VU cố định; Runner không tự tăng VU đột ngột.' },
];
const metricHelp = {
  rps: 'Số lượng HTTP request trung bình được gửi mỗi giây trong khoảng thời gian đo đã chọn. RPS càng cao cho thấy lượng request xử lý càng lớn, nhưng cần xem thêm lỗi và độ trễ.',
  p95: '95% request trong tập dữ liệu đo có thời gian phản hồi không vượt quá giá trị này. Đơn vị: mili giây (ms). P95 thấp thường cho thấy hệ thống phản hồi nhanh hơn.',
  errors: 'Tỷ lệ phần trăm HTTP request bị k6 đánh dấu là thất bại. Ví dụ: 2% nghĩa là khoảng 2 request lỗi trên 100 request.',
  vus: 'Số người dùng ảo đang thực thi kịch bản kiểm thử. Một VU có thể gửi nhiều request theo thời gian, vì vậy VUs không đồng nghĩa với RPS.',
  total: 'Tổng số HTTP request được gửi trong bài kiểm thử theo dữ liệu đã thu thập.',
};
const targets: { id: LoadTestTarget; label: string; Icon: typeof Wifi }[] = [
  { id: 'ping', label: 'API Ping', Icon: Wifi },
  { id: 'database', label: 'SQL Server', Icon: Database },
  { id: 'redis', label: 'Redis', Icon: Gauge },
];
const ratePresets = [
  { seconds: 30, label: '30s' }, { seconds: 60, label: '1m' }, { seconds: 120, label: '2m' },
  { seconds: 300, label: '5m' }, { seconds: 600, label: '10m' },
];
const refreshOptions = [2, 3, 5, 10];

type ChartPoint = { timestampUtc: string; value: number | null };
type ChartLine = { label: string; points: ChartPoint[] };

function metricValue(value: number | null | undefined, unit: string, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)}${unit}`;
}

function dateTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'N/A';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}

function displayStatus(status: string | undefined, stopping?: boolean) {
  if (stopping) return 'Đang dừng';
  switch (status) {
    case 'running': return 'Đang chạy';
    case 'completed': return 'Hoàn tất';
    case 'stopped': return 'Đã dừng';
    case 'failed': return 'Thất bại';
    default: return 'Chưa chạy';
  }
}

function statusColor(status: string | undefined, theme: AdminTheme) {
  if (status === 'running') return theme.primary;
  if (status === 'failed') return theme.dangerText;
  if (status === 'stopped') return theme.warning;
  if (status === 'completed') return theme.link;
  return theme.textMuted;
}

const statusHelp = 'Running: Runner xác nhận bài kiểm thử đang chạy. Completed: Runner xác nhận bài đã hoàn tất. Stopped: bài đã được dừng. Failed: bài kết thúc do lỗi. Trạng thái do Runner trả về là nguồn xác nhận cuối cùng.';

function p95Lines(points: LoadTestP95Point[]): ChartLine[] {
  const groups = new Map<string, ChartLine>();
  for (const point of points) {
    const label = [point.scenario, point.target, point.method, point.status].filter(Boolean).join(' · ') || 'P95';
    const key = JSON.stringify([point.scenario, point.target, point.method, point.status]);
    const line = groups.get(key) ?? { label, points: [] };
    line.points.push({ timestampUtc: point.timestampUtc, value: point.milliseconds });
    groups.set(key, line);
  }
  return Array.from(groups.values()).map(line => ({
    ...line,
    points: line.points.sort((a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc)),
  }));
}

export function AdminLoadTestingWorkspace({ active = true }: { active?: boolean }) {
  const theme = useAdminTheme();
  const width = useWindowDimensions().width;
  const desktop = width >= 1100;
  const columns = width >= 1250 ? 5 : width >= 720 ? 3 : 2;
  const [scenario, setScenario] = useState<LoadTestScenario>('smoke');
  const [vusDraft, setVusDraft] = useState('1');
  const [durationDraft, setDurationDraft] = useState('30');
  const [configError, setConfigError] = useState('');
  const [target, setTarget] = useState<LoadTestTarget>('ping');
  const [rateWindowSeconds, setRateWindowSeconds] = useState(60);
  const [rateWindowDraft, setRateWindowDraft] = useState('60');
  const [rateWindowError, setRateWindowError] = useState('');
  const [rangeMinutes, setRangeMinutes] = useState(5);
  const [rangeDraft, setRangeDraft] = useState('5');
  const [rangeError, setRangeError] = useState('');
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(3);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [statusHelpOpen, setStatusHelpOpen] = useState(false);
  const [rateWindowHelpOpen, setRateWindowHelpOpen] = useState(false);
  const [chartRangeHelpOpen, setChartRangeHelpOpen] = useState(false);
  const [refreshHelpOpen, setRefreshHelpOpen] = useState(false);
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [clock, setClock] = useState<{ key: string; timestamp: number } | null>(null);
  const settings = { rangeMinutes, rateWindowSeconds, refreshIntervalSeconds };
  const loadTest = useAdminLoadTesting(active, settings);
  const styles = createStyles(theme, desktop, columns);
  const status = loadTest.status;
  const isRunning = status?.running ?? false;
  const statusHasInformation = Boolean(status && (status.testId || status.scenario || status.target || status.startedAt || status.finishedAt
    || status.running || ['completed', 'stopped', 'failed'].includes(status.status ?? '')));
  const progressStart = status?.startedAt ? Date.parse(status.startedAt) : NaN;
  const progressKey = `${status?.startedAt ?? ''}:${status?.durationSeconds ?? ''}`;
  const progressEnd = status?.finishedAt && Number.isFinite(Date.parse(status.finishedAt)) ? Date.parse(status.finishedAt)
    : clock?.key === progressKey ? clock.timestamp : progressStart;
  const hasProgress = Number.isFinite(progressStart) && Number.isFinite(status?.durationSeconds) && (status?.durationSeconds ?? 0) > 0;
  const progress = hasProgress && status?.durationSeconds
    ? Math.min(100, Math.max(0, ((progressEnd - progressStart) / (status.durationSeconds * 1000)) * 100))
    : null;
  const elapsedSeconds = hasProgress ? Math.max(0, Math.floor((progressEnd - progressStart) / 1000)) : null;
  const p95CurrentLines = useMemo(() => p95Lines(loadTest.metrics?.httpP95LatencyBySeries ?? []), [loadTest.metrics?.httpP95LatencyBySeries]);
  const chartP95Lines = useMemo(() => p95Lines(loadTest.history?.httpP95LatencyBySeries ?? []), [loadTest.history?.httpP95LatencyBySeries]);
  const currentP95Summary = p95CurrentLines.map(line => ({ label: line.label, value: line.points[line.points.length - 1]?.value ?? null }));
  const p95CardValue = typeof loadTest.metrics?.httpP95LatencyMilliseconds === 'number'
    ? metricValue(loadTest.metrics.httpP95LatencyMilliseconds, ' ms')
    : currentP95Summary.length > 1 ? 'Per-series' : 'N/A';
  const configurationDisabled = isRunning || loadTest.action !== null;

  useEffect(() => {
    if (!status?.startedAt || !status.durationSeconds || status.finishedAt) return;
    const key = `${status.startedAt}:${status.durationSeconds}`;
    const updateClock = () => setClock({ key, timestamp: Date.now() });
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [status?.startedAt, status?.durationSeconds, status?.finishedAt]);

  function selectScenario(nextScenario: LoadTestScenario) {
    const preset = scenarios.find(option => option.id === nextScenario);
    if (!preset) return;
    setScenario(nextScenario);
    setVusDraft(String(preset.vus));
    setDurationDraft(String(preset.durationSeconds));
    setConfigError('');
  }

  function startLoadTest() {
    const vus = Number(vusDraft);
    const durationSeconds = Number(durationDraft);
    if (!/^\d+$/.test(vusDraft.trim()) || !Number.isInteger(vus) || vus < 1 || vus > 100) {
      setConfigError('VUs phải là số nguyên từ 1 đến 100.');
      return;
    }
    if (!/^\d+$/.test(durationDraft.trim()) || !Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 3600) {
      setConfigError('Thời lượng phải là số nguyên từ 10 đến 3600 giây.');
      return;
    }
    setConfigError('');
    void loadTest.start(scenario, target, { vus, durationSeconds });
  }

  function applyRateWindow() {
    const seconds = Number(rateWindowDraft);
    if (!Number.isInteger(seconds) || seconds < 15 || seconds > 1800) {
      setRateWindowError('Nhập số giây từ 15 đến 1800.');
      return;
    }
    setRateWindowSeconds(seconds);
    setRateWindowDraft(String(seconds));
    setRateWindowError('');
  }

  function applyRange() {
    const minutes = Number(rangeDraft);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      setRangeError('Nhập số phút từ 1 đến 60.');
      return;
    }
    setRangeMinutes(minutes);
    setRangeDraft(String(minutes));
    setRangeError('');
  }

  async function copyErrorDetails() {
    if (!loadTest.error) return;
    const value = formatLoadTestErrorDetails(loadTest.error);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== 'undefined') {
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(input);
        if (!copied) throw new Error('Clipboard is unavailable');
      } else throw new Error('Clipboard is unavailable');
      setCopyMessage('Đã sao chép chi tiết lỗi đã được lọc thông tin nhạy cảm.');
    } catch {
      setCopyMessage('Không thể truy cập clipboard trên thiết bị này.');
    }
  }

  function confirmStop() {
    if (!isRunning || loadTest.action !== null) return;
    const message = status?.testId
      ? `Runner sẽ dừng bài đang chạy (${status.testId}). Stop chỉ dừng bài hiện tại, không thể chọn bài lịch sử.`
      : 'Runner sẽ dừng bài đang chạy. Stop chỉ dừng bài hiện tại, không thể chọn bài lịch sử.';
    const onConfirm = () => void loadTest.stop();
    if (Platform.OS === 'web') {
      if (window.confirm(`Dừng bài kiểm thử hiện tại?\n\n${message}`)) onConfirm();
      return;
    }
    Alert.alert('Dừng bài kiểm thử hiện tại?', message, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Dừng bài kiểm thử', style: 'destructive', onPress: onConfirm },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Kiểm thử tải API</Text>
          <Text style={styles.muted}>Khởi chạy k6 an toàn trên các mục tiêu backend đã cấu hình.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Làm mới trạng thái kiểm thử tải" disabled={loadTest.refreshing}
          onPress={loadTest.refresh} style={({ hovered }) => [styles.iconButton, hovered && styles.hover, loadTest.refreshing && styles.disabled]}>
          {loadTest.refreshing ? <ActivityIndicator size="small" color={theme.textMuted} /> : <RefreshCw size={16} color={theme.textMuted} />}
        </Pressable>
      </View>

      <View style={styles.controlGrid}>
        <View style={styles.panel}>
          <View style={styles.panelHeading}><Play size={16} color={theme.primary} /><Text style={styles.panelTitle}>Cấu hình bài kiểm thử</Text></View>
          <HelpLabel label="Kịch bản / Scenario" text="Loại kiểm thử quyết định cấu hình mặc định và mục tiêu kiểm tra. Có thể tùy chỉnh VUs và Duration." styles={styles} theme={theme} />
          <View style={styles.optionGrid}>
            {scenarios.map(option => <ScenarioOption key={option.id} option={option} selected={scenario === option.id} disabled={configurationDisabled}
              onSelect={() => selectScenario(option.id)} styles={styles} theme={theme} />)}
          </View>
          <HelpLabel label="Mục tiêu / Target" text="Thành phần Backend được chọn để kiểm thử: Ping, Database hoặc Redis." styles={styles} theme={theme} />
          <View style={styles.targetRow}>
            {targets.map(({ id, label, Icon }) => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: target === id }}
              disabled={configurationDisabled} onPress={() => setTarget(id)} style={[styles.target, target === id && styles.optionSelected, configurationDisabled && styles.disabled]}>
              <Icon size={15} color={target === id ? theme.primary : theme.textMuted} /><Text style={[styles.targetText, target === id && styles.selectedText]}>{label}</Text>
            </Pressable>)}
          </View>
          <View style={styles.configFields}>
            <View style={styles.configField}>
              <HelpLabel label="Virtual Users (VUs)" text="Số người dùng ảo chạy đồng thời. Ví dụ: 20 VUs nghĩa là có 20 người dùng ảo thực thi kịch bản." styles={styles} theme={theme} />
              <TextInput accessibilityLabel="Virtual Users (VUs)" accessibilityHint="Số nguyên từ 1 đến 100" editable={!configurationDisabled} inputMode="numeric" keyboardType="number-pad" value={vusDraft} onChangeText={value => { setVusDraft(value); setConfigError(''); }} style={[styles.input, configurationDisabled && styles.disabled]} />
            </View>
            <View style={styles.configField}>
              <HelpLabel label="Duration · giây" text="Thời gian duy trì bài kiểm thử trước khi tự kết thúc." styles={styles} theme={theme} />
              <TextInput accessibilityLabel="Duration in seconds" accessibilityHint="Số nguyên từ 10 đến 3600 giây" editable={!configurationDisabled} inputMode="numeric" keyboardType="number-pad" value={durationDraft} onChangeText={value => { setDurationDraft(value); setConfigError(''); }} style={[styles.input, configurationDisabled && styles.disabled]} />
            </View>
          </View>
          <Text style={styles.hint}>Thay đổi VUs hoặc Duration chỉ áp dụng cho bài test tiếp theo, không làm thay đổi bài đang chạy.</Text>
          {configError ? <Text accessibilityRole="alert" style={styles.validationText}>{configError}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable accessibilityRole="button" disabled={loadTest.loading || isRunning || loadTest.action !== null}
              onPress={startLoadTest} style={({ hovered, pressed }) => [styles.primaryButton, (hovered || pressed) && styles.primaryPressed, (loadTest.loading || isRunning || loadTest.action) && styles.disabled]}>
              {loadTest.action === 'start' ? <ActivityIndicator size="small" color={theme.textInverse} /> : <Play size={15} color={theme.textInverse} fill={theme.textInverse} />}
              <Text style={styles.primaryButtonText}>Bắt đầu</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeading}><Clock3 size={16} color={isRunning ? theme.primary : theme.textMuted} /><Text style={styles.panelTitle}>Bài kiểm thử hiện tại</Text>
            {loadTest.refreshing ? <ActivityIndicator size="small" color={theme.textMuted} /> : null}</View>
          {statusHasInformation ? <>
            <View style={[styles.activeStatusRow, statusHelpOpen && styles.helpFront]}>
              <View style={styles.statusLine}><View style={[styles.statusDot, { backgroundColor: statusColor(status?.status ?? undefined, theme) }]} /><Text style={[styles.statusText, { color: statusColor(status?.status ?? undefined, theme) }]}>{displayStatus(status?.status ?? undefined, status?.stopping)}</Text></View>
              <HelpIcon label="Trạng thái bài kiểm thử" text={statusHelp} styles={styles} theme={theme} onOpenChange={setStatusHelpOpen} />
            </View>
            <InfoRow label="Test ID" value={status?.testId ?? 'N/A'} help="Mã định danh do Runner cung cấp cho bài kiểm thử. Nếu Runner không trả về mã này, Dashboard hiển thị N/A." selectable styles={styles} theme={theme} />
            <InfoRow label="Scenario" value={status?.scenario ?? 'N/A'} styles={styles} theme={theme} />
            <InfoRow label="Target" value={status?.target ?? 'N/A'} styles={styles} theme={theme} />
            <InfoRow label="Effective VUs" value={status?.vus == null ? 'N/A' : String(status.vus)} styles={styles} theme={theme} />
            <InfoRow label="Duration" value={status?.durationSeconds == null ? 'N/A' : `${status.durationSeconds} giây`} styles={styles} theme={theme} />
            <InfoRow label="Bắt đầu" value={dateTime(status?.startedAt)} styles={styles} theme={theme} />
            {status?.finishedAt ? <InfoRow label="Kết thúc" value={dateTime(status.finishedAt)} styles={styles} theme={theme} /> : null}
            {status?.exitCode !== null && status?.exitCode !== undefined ? <InfoRow label="Exit code" value={String(status.exitCode)} styles={styles} theme={theme} /> : null}
            {progress !== null && elapsedSeconds !== null && status?.durationSeconds ? <View style={styles.progressSection}>
              <HelpLabel label="Tiến độ thời gian" text="Tiến độ biểu thị thời gian đã trôi qua so với Duration cấu hình. Chạm 100% không xác nhận bài đã kết thúc; trạng thái Runner mới là nguồn xác nhận." styles={styles} theme={theme} />
              <View accessibilityRole="progressbar" accessibilityLabel="Tiến độ thời gian đã trôi qua" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
              <Text style={styles.hint}>{elapsedSeconds} / {status.durationSeconds} giây ({Math.round(progress)}%). {progress >= 100 ? 'Đã đủ thời lượng cấu hình; chờ trạng thái Runner xác nhận kết quả.' : 'Trạng thái Runner vẫn là nguồn xác nhận bài kiểm thử.'}</Text>
            </View> : null}
            <View style={styles.stopActionBlock}>
              <Pressable accessibilityRole="button" accessibilityLabel="Dừng bài kiểm thử đang chạy" disabled={!isRunning || loadTest.action !== null}
                onPress={confirmStop} style={({ hovered, pressed }) => [styles.stopButton, styles.prominentStopButton, (hovered || pressed) && styles.stopPressed, (!isRunning || loadTest.action) && styles.disabled]}>
                {loadTest.action === 'stop' ? <ActivityIndicator size="small" color={theme.dangerText} /> : <Square size={14} color={theme.dangerText} fill={theme.dangerText} />}
                <Text style={styles.stopButtonText}>{loadTest.action === 'stop' ? 'Đang dừng…' : 'Dừng bài kiểm thử'}</Text>
              </Pressable>
              <Text style={styles.hint}>Stop chỉ dừng bài đang chạy trên Runner; không thể chọn hoặc dừng bài lịch sử.</Text>
            </View>
          </> : <View style={styles.emptyTestState}>{loadTest.loading ? <ActivityIndicator size="small" color={theme.primary} /> : null}<Text style={styles.emptyTestText}>{loadTest.loading ? 'Đang tải trạng thái từ Runner…' : 'Runner chưa có thông tin bài kiểm thử hiện tại hoặc gần nhất.'}</Text></View>}
        </View>
      </View>

      {loadTest.error ? <View accessibilityRole="alert" style={styles.errorPanel}>
        <View style={styles.errorPanelHeader}>
          <AlertTriangle size={18} color={theme.dangerText} />
          <View style={styles.errorPanelCopy}><Text style={styles.errorTitle}>{loadTest.error.title}</Text><Text style={styles.errorText}>{loadTest.error.explanation}</Text></View>
        </View>
        {loadTest.error.statusCode === 409 && isRunning ? <Text style={styles.errorText}>Runner hiện xác nhận bài ở trên vẫn đang chạy, vì vậy Backend chưa khởi chạy bài mới.</Text> : null}
        <ErrorDetailRow label="HTTP status" value={loadTest.error.statusCode === null ? 'Không có phản hồi HTTP' : String(loadTest.error.statusCode)} theme={theme} styles={styles} />
        <View style={styles.errorSuggestion}><Text style={styles.errorSuggestionLabel}>Đề xuất</Text><Text style={styles.errorText}>{loadTest.error.suggestion}</Text></View>
        <View style={styles.errorActions}>
          <Pressable accessibilityRole="button" onPress={() => { setErrorDetailsOpen(value => !value); setCopyMessage(''); }} style={styles.errorActionButton}>
            {errorDetailsOpen ? <ChevronUp size={14} color={theme.primary} /> : <ChevronDown size={14} color={theme.primary} />}
            <Text style={styles.errorActionText}>{errorDetailsOpen ? 'Ẩn chi tiết kỹ thuật' : 'Chi tiết kỹ thuật'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void copyErrorDetails()} style={styles.errorActionButton}>
            <Copy size={14} color={theme.primary} /><Text style={styles.errorActionText}>Sao chép chi tiết lỗi</Text>
          </Pressable>
        </View>
        {copyMessage ? <Text style={styles.errorCopyMessage}>{copyMessage}</Text> : null}
        {errorDetailsOpen ? <View style={styles.errorTechnical}>
          <ErrorDetailRow label="Error code" value={loadTest.error.errorCode ?? 'Backend không cung cấp'} theme={theme} styles={styles} />
          <ErrorDetailRow label="Thông điệp Backend" value={loadTest.error.backendMessage ?? 'Backend không cung cấp thông điệp chi tiết.'} theme={theme} styles={styles} />
          <ErrorDetailRow label="Request path" value={loadTest.error.requestPath ?? 'Không có'} theme={theme} styles={styles} />
          <ErrorDetailRow label="Timestamp" value={loadTest.error.timestamp ?? 'Không có'} theme={theme} styles={styles} />
          {loadTest.error.detailsUnavailable ? <Text style={styles.errorCopyMessage}>Backend chưa cung cấp đủ thông tin để xác định chi tiết nguyên nhân hoặc trạng thái Runner.</Text> : null}
        </View> : null}
      </View> : null}

      <View style={styles.settingsPanel}>
        <View style={styles.panelHeading}><Gauge size={16} color={theme.primary} /><Text style={styles.panelTitle}>Quan sát và làm mới</Text></View>
        <View style={styles.settingsGrid}>
          <View style={[styles.settingBlock, rateWindowHelpOpen && styles.helpFront]}>
            <HelpLabel label={`Rate Window · ${rateWindowSeconds}s`} text="Khoảng thời gian dùng để tính RPS trung bình. Ví dụ: 30 giây nghĩa là RPS được tính dựa trên dữ liệu trong cửa sổ 30 giây gần nhất tại mỗi thời điểm." styles={styles} theme={theme} onOpenChange={setRateWindowHelpOpen} />
            <View style={styles.presetRow}>{ratePresets.map(preset => <Pressable key={preset.seconds} accessibilityRole="button" accessibilityState={{ selected: rateWindowSeconds === preset.seconds }}
              onPress={() => { setRateWindowSeconds(preset.seconds); setRateWindowDraft(String(preset.seconds)); setRateWindowError(''); }} style={[styles.preset, rateWindowSeconds === preset.seconds && styles.presetActive]}>
              <Text style={[styles.presetText, rateWindowSeconds === preset.seconds && styles.selectedText]}>{preset.label}</Text>
            </Pressable>)}</View>
            <View style={styles.customInputRow}>
              <TextInput accessibilityLabel="Custom rate window seconds" keyboardType="number-pad" value={rateWindowDraft} onChangeText={setRateWindowDraft} onSubmitEditing={applyRateWindow} placeholder="Seconds" placeholderTextColor={theme.textMuted} style={styles.input} />
              <Pressable accessibilityRole="button" onPress={applyRateWindow} style={styles.smallButton}><Text style={styles.smallButtonText}>Áp dụng</Text></Pressable>
            </View>
            {rateWindowError ? <Text style={styles.validationText}>{rateWindowError}</Text> : <Text style={styles.hint}>Từ 15 đến 1800 giây. Không khởi động lại bài test.</Text>}
          </View>
          <View style={[styles.settingBlock, chartRangeHelpOpen && styles.helpFront]}>
            <HelpLabel label={`Chart Range · ${rangeMinutes} phút`} text="Khoảng thời gian lịch sử được hiển thị trên biểu đồ. Ví dụ: 5 phút sẽ hiển thị dữ liệu của 5 phút gần nhất." styles={styles} theme={theme} onOpenChange={setChartRangeHelpOpen} />
            <View style={styles.customInputRow}>
              <TextInput accessibilityLabel="Chart range minutes" keyboardType="number-pad" value={rangeDraft} onChangeText={setRangeDraft} onSubmitEditing={applyRange} placeholder="Minutes" placeholderTextColor={theme.textMuted} style={styles.input} />
              <Pressable accessibilityRole="button" onPress={applyRange} style={styles.smallButton}><Text style={styles.smallButtonText}>Áp dụng</Text></Pressable>
            </View>
            {rangeError ? <Text style={styles.validationText}>{rangeError}</Text> : <Text style={styles.hint}>Từ 1 đến 60 phút. Độc lập với Rate Window.</Text>}
          </View>
          <View style={[styles.settingBlock, refreshHelpOpen && styles.helpFront]}>
            <HelpLabel label="Refresh Interval" text="Khoảng thời gian giữa các lần giao diện yêu cầu dữ liệu mới. Ví dụ: 3 giây nghĩa là Dashboard cập nhật khoảng 3 giây một lần." styles={styles} theme={theme} onOpenChange={setRefreshHelpOpen} />
            <View style={styles.presetRow}>{refreshOptions.map(seconds => <Pressable key={seconds} accessibilityRole="radio" accessibilityState={{ checked: refreshIntervalSeconds === seconds }}
              onPress={() => setRefreshIntervalSeconds(seconds)} style={[styles.preset, refreshIntervalSeconds === seconds && styles.presetActive]}>
              <Text style={[styles.presetText, refreshIntervalSeconds === seconds && styles.selectedText]}>{seconds}s</Text>
            </Pressable>)}</View>
            <Text style={styles.hint}>Cập nhật trạng thái và số liệu khi test đang chạy.</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}><View><Text accessibilityRole="header" style={styles.sectionTitle}>Chỉ số trực tiếp</Text><Text style={styles.muted}>Rate Window: {rateWindowSeconds}s</Text></View><Text style={styles.muted}>{loadTest.metrics ? `Đo lúc ${dateTime(loadTest.metrics.timestampUtc)}` : 'N/A'}</Text></View>
      <View style={styles.kpiGrid}>
        <Kpi label="RPS · Requests Per Second" help={metricHelp.rps} value={metricValue(loadTest.metrics?.requestsPerSecond, ' req/s')} styles={styles} theme={theme} />
        <Kpi label="HTTP Error Rate" help={metricHelp.errors} value={metricValue(loadTest.metrics?.httpErrorRatePercent, '%')} styles={styles} theme={theme} />
        <P95Kpi value={p95CardValue} styles={styles} theme={theme} />
        <Kpi label="Active VUs" help={metricHelp.vus} value={metricValue(loadTest.metrics?.activeVus, '', 0)} styles={styles} theme={theme} />
        <Kpi label="Total HTTP Requests" help={metricHelp.total} value={metricValue(loadTest.metrics?.totalHttpRequests, '', 0)} styles={styles} theme={theme} />
      </View>
      <View style={styles.guidePanel}><View style={styles.panelHeading}><Info size={15} color={theme.primary} /><Text style={styles.panelTitle}>Hướng dẫn đọc kết quả</Text></View><Text style={styles.guideText}>Đọc RPS cùng HTTP Error Rate và P95 Latency: RPS cho biết lượng request mỗi giây; Error Rate cho biết tỷ lệ request thất bại; P95 cho biết thời gian phản hồi mà 95% request không vượt quá. Hãy xem cả ba chỉ số trong cùng khoảng đo để hiểu tác động của tải, không kết luận chỉ từ một chỉ số.</Text></View>
      {currentP95Summary.length > 1 ? <View style={styles.p95Rows}>
        {currentP95Summary.map(series => <View key={series.label} style={styles.p95Row}><Text style={styles.p95Label}>{series.label}</Text><Text style={styles.p95Value}>{metricValue(series.value, ' ms')}</Text></View>)}
      </View> : null}

      <View style={styles.chartHeader}><View><Text accessibilityRole="header" style={styles.sectionTitle}>Diễn biến trong {rangeMinutes} phút</Text><Text style={styles.muted}>Lịch sử Prometheus · Mẫu thiếu được hiển thị gián đoạn</Text></View>
        <Pressable accessibilityRole="button" onPress={loadTest.refresh} style={styles.textButton}><Text style={styles.textButtonLabel}>Làm mới</Text></Pressable></View>
      <View style={styles.chartGrid}>
        <LoadTestChart title="RPS · Requests Per Second" help={metricHelp.rps} unit="req/s" lines={oneLine(loadTest.history?.requestsPerSecond ?? [], 'RPS')} theme={theme} />
        <LoadTestChart title="P95 Latency" help={metricHelp.p95} unit="ms" lines={chartP95Lines} theme={theme} />
        <LoadTestChart title="HTTP Error Rate" help={metricHelp.errors} unit="%" lines={oneLine(loadTest.history?.httpErrorRatePercent ?? [], 'Errors')} theme={theme} />
        <LoadTestChart title="Active VUs" help={metricHelp.vus} unit="VUs" lines={oneLine(loadTest.history?.activeVus ?? [], 'VUs')} theme={theme} />
      </View>

      <View style={styles.diagnosticsPanel}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: diagnosticsOpen }} onPress={() => setDiagnosticsOpen(value => !value)} style={styles.diagnosticsToggle}>
          <View><Text style={styles.panelTitle}>Chẩn đoán cuối bài test</Text><Text style={styles.hint}>Chi tiết tiến trình k6 do Runner trả về</Text></View>
          {diagnosticsOpen ? <ChevronUp size={17} color={theme.textMuted} /> : <ChevronDown size={17} color={theme.textMuted} />}
        </Pressable>
        {diagnosticsOpen ? <View style={styles.diagnosticsBody}>
          <Text style={styles.diagnosticLabel}>STDOUT</Text><Text selectable style={styles.diagnosticOutput}>{status?.diagnostics?.stdout?.trim() || 'Không có stdout được lưu.'}</Text>
          <Text style={styles.diagnosticLabel}>STDERR</Text><Text selectable style={[styles.diagnosticOutput, status?.status === 'failed' && styles.errorText]}>{status?.diagnostics?.stderr?.trim() || 'Không có stderr được lưu.'}</Text>
          {status?.status === 'completed' ? <Text style={styles.diagnosticState}>Bài test hoàn tất thành công.</Text> : null}
          {status?.status === 'stopped' ? <Text style={styles.diagnosticState}>Bài test được dừng theo yêu cầu.</Text> : null}
          {status?.status === 'failed' ? <Text style={styles.errorText}>Bài test kết thúc với lỗi. Kiểm tra stderr và exit code.</Text> : null}
        </View> : null}
      </View>
    </ScrollView>
  );
}

function oneLine(points: LoadTestMetricPoint[], label: string): ChartLine[] {
  return [{ label, points }];
}

function ScenarioOption({ option, selected, disabled, onSelect, styles, theme }: {
  option: typeof scenarios[number]; selected: boolean; disabled: boolean; onSelect: () => void;
  styles: ReturnType<typeof createStyles>; theme: AdminTheme;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return <View style={[styles.scenarioOption, helpOpen && styles.helpFront]}>
    <Pressable accessibilityRole="radio" accessibilityHint={option.help} accessibilityState={{ checked: selected, disabled }} disabled={disabled}
      onPress={onSelect} style={[styles.option, selected && styles.optionSelected, disabled && styles.disabled]}>
      <Text style={[styles.optionTitle, selected && styles.selectedText]}>{option.label}</Text>
      <Text style={styles.optionDetail}>{option.detail}</Text>
    </Pressable>
    <View style={styles.scenarioHelp}><HelpIcon label={option.label} text={option.help} styles={styles} theme={theme} onOpenChange={setHelpOpen} /></View>
  </View>;
}

function HelpLabel({ label, text, styles, theme, onOpenChange }: { label: string; text: string; styles: ReturnType<typeof createStyles>; theme: AdminTheme; onOpenChange?: (open: boolean) => void }) {
  const [helpOpen, setHelpOpen] = useState(false);
  function updateOpen(open: boolean) {
    setHelpOpen(open);
    onOpenChange?.(open);
  }
  return <View style={[styles.helpLabel, helpOpen && styles.helpFront]}><Text style={styles.label}>{label}</Text><HelpIcon label={label} text={text} styles={styles} theme={theme} onOpenChange={updateOpen} /></View>;
}

function HelpIcon({ label, text, styles, theme, onOpenChange }: { label: string; text: string; styles: ReturnType<typeof createStyles>; theme: AdminTheme; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  function updateOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }
  return <View style={[styles.helpRoot, open && styles.helpFront]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Thông tin ${label}`} accessibilityHint={text} accessibilityState={{ expanded: open }}
      onHoverIn={() => updateOpen(true)} onHoverOut={() => updateOpen(false)} onFocus={() => updateOpen(true)} onBlur={() => updateOpen(false)} onPress={() => updateOpen(!open)} style={styles.helpButton}>
      <Info size={14} color={theme.textMuted} />
    </Pressable>
    {open ? <View style={[styles.tooltip, styles.tooltipNoPointerEvents]}><Text style={styles.tooltipText}>{text}</Text></View> : null}
  </View>;
}

function InfoRow({ label, value, selectable = false, help, styles, theme }: { label: string; value: string; selectable?: boolean; help?: string; styles: ReturnType<typeof createStyles>; theme: AdminTheme }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return <View style={[styles.infoRow, helpOpen && styles.helpFront]}>
    <View style={styles.infoLabelRow}><Text style={styles.infoLabel}>{label}</Text>{help ? <HelpIcon label={label} text={help} styles={styles} theme={theme} onOpenChange={setHelpOpen} /> : null}</View>
    <Text selectable={selectable} style={styles.infoValue}>{value}</Text>
  </View>;
}

function ErrorDetailRow({ label, value, theme, styles }: { label: string; value: string; theme: AdminTheme; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.errorDetailRow}><Text style={styles.errorDetailLabel}>{label}</Text><Text selectable style={[styles.errorDetailValue, { color: theme.text }]}>{value}</Text></View>;
}

function Kpi({ label, help, value, styles, theme }: { label: string; help: string; value: string; styles: ReturnType<typeof createStyles>; theme: AdminTheme }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return <View style={[styles.kpi, helpOpen && styles.helpFront]}><View style={styles.kpiHeading}><Text style={styles.kpiLabel}>{label}</Text><HelpIcon label={label} text={help} styles={styles} theme={theme} onOpenChange={setHelpOpen} /></View><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiHint}>Thiếu số liệu sẽ hiển thị N/A.</Text></View>;
}

function P95Kpi({ value, styles, theme }: { value: string; styles: ReturnType<typeof createStyles>; theme: AdminTheme }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return <View style={[styles.kpi, helpOpen && styles.helpFront]}><View style={styles.kpiHeading}><Text style={styles.kpiLabel}>P95 Latency</Text><HelpIcon label="P95 Latency" text={metricHelp.p95} styles={styles} theme={theme} onOpenChange={setHelpOpen} /></View><Text style={styles.kpiValue}>{value}</Text>
    <Text style={styles.kpiHint}>Phân vị không được gộp giữa các chuỗi.</Text></View>;
}

function LoadTestChart({ title, help, unit, lines, theme }: { title: string; help: string; unit: string; lines: ChartLine[]; theme: AdminTheme }) {
  const styles = createStyles(theme, false, 1);
  const [width, setWidth] = useState(480);
  const [helpOpen, setHelpOpen] = useState(false);
  const palette = [theme.primary, theme.link, theme.dangerText, theme.warning, theme.avatar, '#8c6bb1', '#3c99a3', '#bb7852'];
  const allPoints = lines.flatMap(line => line.points).filter(point => Number.isFinite(Date.parse(point.timestampUtc)));
  const timestamps = allPoints.map(point => Date.parse(point.timestampUtc));
  let start = timestamps.length ? Math.min(...timestamps) : 0;
  let end = timestamps.length ? Math.max(...timestamps) : 1;
  if (end === start) { start -= 1000; end += 1000; }
  const values = allPoints.flatMap(point => typeof point.value === 'number' && Number.isFinite(point.value) ? [point.value] : []);
  const minValue = Math.min(0, ...values);
  const maxValue = values.length ? Math.max(...values) * 1.12 || 1 : 1;
  const left = 48, right = Math.max(left + 1, width - 12), top = 12, bottom = 160;
  const x = (time: number) => left + ((time - start) / (end - start)) * (right - left);
  const y = (value: number) => bottom - ((value - minValue) / (maxValue - minValue || 1)) * (bottom - top);
  const validLines = lines.filter(line => line.points.some(point => point.value !== null && Number.isFinite(point.value)));

  return <View style={[styles.chartCard, helpOpen && styles.helpFront]} onLayout={event => setWidth(Math.max(200, event.nativeEvent.layout.width - 28))}>
    <View style={styles.chartTitleRow}><Text style={styles.chartTitle}>{title} <Text style={styles.chartUnit}>({unit})</Text></Text><HelpIcon label={title} text={help} styles={styles} theme={theme} onOpenChange={setHelpOpen} /></View>
    {validLines.length ? <>
      <Svg width={width} height={188} accessibilityRole="image" accessibilityLabel={`${title} chart`}>
        {[0, 0.5, 1].map(ratio => <Line key={ratio} x1={left} x2={right} y1={top + ratio * (bottom - top)} y2={top + ratio * (bottom - top)} stroke={theme.border} strokeDasharray={ratio ? '3 4' : undefined} />)}
        {[0, 0.5, 1].map(ratio => <SvgText key={`v-${ratio}`} x={left - 7} y={bottom - ratio * (bottom - top) + 3} fill={theme.textMuted} fontSize={9} textAnchor="end">{new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(minValue + ratio * (maxValue - minValue))}</SvgText>)}
        {validLines.map((line, lineIndex) => {
          const paths: string[] = [];
          const markers: { x: number; y: number }[] = [];
          let current: string[] = [];
          let previousTime: number | null = null;
          const flush = () => {
            if (current.length > 1) paths.push(current.join(' '));
            else if (current.length === 1) {
              const coords = current[0].split(' ');
              markers.push({ x: Number(coords[1]), y: Number(coords[2]) });
            }
            current = [];
          };
          for (const point of line.points) {
            const time = Date.parse(point.timestampUtc);
            if (point.value === null || !Number.isFinite(point.value) || !Number.isFinite(time)
              || (previousTime !== null && time - previousTime > 30000)) {
              flush();
              previousTime = null;
              if (point.value === null || !Number.isFinite(point.value) || !Number.isFinite(time)) continue;
            }
            if (!Number.isFinite(point.value)) {
              continue;
            }
            const command = `${current.length ? 'L' : 'M'} ${x(time).toFixed(2)} ${y(point.value!).toFixed(2)}`;
            current.push(command);
            previousTime = time;
          }
          flush();
          return <Fragment key={line.label}>
            {paths.map((path, pathIndex) => <Path key={`${line.label}-${pathIndex}`} d={path} fill="none" stroke={palette[lineIndex % palette.length]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
            {markers.map((marker, markerIndex) => <Circle key={`${line.label}-point-${markerIndex}`} cx={marker.x} cy={marker.y} r={2.5} fill={palette[lineIndex % palette.length]} />)}
          </Fragment>;
        })}
        <SvgText x={left} y={180} fill={theme.textMuted} fontSize={9}>{new Date(start).toLocaleTimeString()}</SvgText>
        <SvgText x={right} y={180} fill={theme.textMuted} fontSize={9} textAnchor="end">{new Date(end).toLocaleTimeString()}</SvgText>
      </Svg>
      <View style={styles.legend}>{validLines.map((line, index) => <View key={line.label} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: palette[index % palette.length] }]} /><Text numberOfLines={1} style={styles.legendText}>{line.label}</Text></View>)}</View>
    </> : <View style={styles.chartEmpty}><Text style={styles.hint}>N/A · Chưa có mẫu trong khoảng này.</Text></View>}
  </View>;
}

function createStyles(theme: AdminTheme, desktop: boolean, columns: number) {
  return adminStyleSheet({
    root: { flex: 1, backgroundColor: theme.screen }, content: { alignSelf: 'center', width: '100%', maxWidth: 1420, padding: desktop ? 34 : 16, paddingBottom: 48, gap: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }, headerCopy: { flex: 1, gap: 5 }, title: { color: theme.text, fontSize: desktop ? 23 : 21, fontWeight: '600' }, muted: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },
    iconButton: { width: 38, height: 38, borderWidth: 1, borderColor: theme.border, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.card }, hover: { backgroundColor: theme.cardAlt }, disabled: { opacity: 0.55 },
    controlGrid: { flexDirection: desktop ? 'row' : 'column', gap: 14, alignItems: 'stretch' }, panel: { flex: 1, minWidth: 0, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 9, padding: desktop ? 20 : 16, gap: 14 }, activeTestPanel: { borderColor: theme.primary }, panelHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 22 }, panelTitle: { color: theme.text, fontSize: 14, fontWeight: '600' },
    label: { color: theme.text, fontSize: 12, fontWeight: '500' }, helpLabel: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3 }, helpRoot: { position: 'relative' }, helpFront: { zIndex: 10000, elevation: 10000 }, helpButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }, tooltip: { position: 'absolute', top: 28, right: 0, width: 240, padding: 10, borderRadius: 6, backgroundColor: theme.sheet, borderColor: theme.border, borderWidth: 1, zIndex: 10000, elevation: 10000 }, tooltipNoPointerEvents: { pointerEvents: 'none' }, tooltipText: { color: theme.text, fontSize: 11, lineHeight: 17 }, optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, scenarioOption: { flexGrow: 1, minWidth: 100, position: 'relative' }, scenarioHelp: { position: 'absolute', top: 0, right: 0 }, option: { flexGrow: 1, minWidth: 100, padding: 11, paddingRight: 34, gap: 4, borderWidth: 1, borderColor: theme.border, borderRadius: 7, backgroundColor: theme.screen }, optionSelected: { borderColor: theme.primary, backgroundColor: theme.primaryPressed }, optionTitle: { color: theme.text, fontSize: 12, fontWeight: '600' }, optionDetail: { color: theme.textMuted, fontSize: 10 }, selectedText: { color: theme.primary },
    targetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, target: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 7 }, targetText: { color: theme.text, fontSize: 11, fontWeight: '500' }, configFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, configField: { flex: 1, minWidth: 120, gap: 5 }, infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 32 }, infoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 }, infoLabel: { color: theme.textMuted, fontSize: 12 }, infoValue: { color: theme.text, fontSize: 12, fontWeight: '500', flexShrink: 1, textAlign: 'right' }, activeStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, progressSection: { gap: 5, paddingTop: 6 }, progressTrack: { width: '100%', height: 8, overflow: 'hidden', borderRadius: 5, backgroundColor: theme.cardAlt }, progressFill: { height: '100%', borderRadius: 5, backgroundColor: theme.primary }, stopActionBlock: { gap: 6, paddingTop: 8 }, prominentStopButton: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, backgroundColor: theme.warningBackground }, emptyTestState: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: 7, backgroundColor: theme.cardAlt }, emptyTestText: { color: theme.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' }, actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingTop: 2 },
    primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 42, paddingHorizontal: 16, borderRadius: 7, backgroundColor: theme.primary, minWidth: 130 }, primaryPressed: { opacity: 0.82 }, primaryButtonText: { color: theme.textInverse, fontSize: 12, fontWeight: '600' }, stopButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 42, paddingHorizontal: 16, borderWidth: 1, borderColor: theme.dangerText, borderRadius: 7 }, stopPressed: { backgroundColor: theme.cardAlt }, stopButtonText: { color: theme.dangerText, fontSize: 12, fontWeight: '600' },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 }, statusDot: { width: 9, height: 9, borderRadius: 5 }, statusText: { fontSize: 14, fontWeight: '600' }, errorPanel: { gap: 10, padding: 15, borderColor: theme.dangerText, borderWidth: 1, borderRadius: 8, backgroundColor: theme.card }, errorPanelHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, errorPanelCopy: { flex: 1, gap: 4 }, errorTitle: { color: theme.dangerText, fontSize: 14, fontWeight: '600' }, errorText: { color: theme.text, fontSize: 12, lineHeight: 18, flexShrink: 1 }, errorSuggestion: { padding: 10, gap: 4, borderRadius: 6, backgroundColor: theme.cardAlt }, errorSuggestionLabel: { color: theme.textMuted, fontSize: 10, fontWeight: '600' }, errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, errorActionButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 6 }, errorActionText: { color: theme.primary, fontSize: 11, fontWeight: '500' }, errorCopyMessage: { color: theme.textMuted, fontSize: 11, lineHeight: 16 }, errorTechnical: { paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border, gap: 6 }, errorDetailRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }, errorDetailLabel: { width: 135, color: theme.textMuted, fontSize: 11, fontWeight: '500' }, errorDetailValue: { flex: 1, minWidth: 150, fontSize: 11, lineHeight: 17 },
    settingsPanel: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 9, padding: desktop ? 20 : 16, gap: 14 }, settingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 }, settingBlock: { flexGrow: 1, flexBasis: desktop ? 250 : 190, gap: 9 }, presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, preset: { minWidth: 45, minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: theme.border, borderRadius: 6 }, presetActive: { borderColor: theme.primary, backgroundColor: theme.primaryPressed }, presetText: { color: theme.textMuted, fontSize: 11, fontWeight: '500' }, customInputRow: { flexDirection: 'row', gap: 7 }, input: { flex: 1, minWidth: 75, height: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 6, color: theme.text, backgroundColor: theme.screen, fontSize: 12 }, smallButton: { justifyContent: 'center', paddingHorizontal: 11, borderRadius: 6, backgroundColor: theme.primaryPressed }, smallButtonText: { color: theme.primary, fontSize: 11, fontWeight: '600' }, hint: { color: theme.textMuted, fontSize: 10, lineHeight: 16 }, validationText: { color: theme.dangerText, fontSize: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '600', marginBottom: 3 }, kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, kpi: { width: columns >= 5 ? '17%' : columns >= 3 ? '31%' : '48%', flexGrow: 1, minWidth: 150, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 8, padding: 15, gap: 8 }, kpiHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }, kpiLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '500', flexShrink: 1 }, kpiValue: { color: theme.text, fontSize: 23, fontWeight: '600', lineHeight: 31, fontVariant: ['tabular-nums'] }, kpiHint: { color: theme.textMuted, fontSize: 9, lineHeight: 14 }, guidePanel: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 8, padding: 15, gap: 8 }, guideText: { color: theme.textMuted, fontSize: 11, lineHeight: 18 }, p95Rows: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14 }, p95Row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.border }, p95Label: { flex: 1, color: theme.textMuted, fontSize: 11 }, p95Value: { color: theme.text, fontSize: 11, fontWeight: '600' },
    chartHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }, textButton: { paddingVertical: 8, paddingHorizontal: 10 }, textButtonLabel: { color: theme.primary, fontSize: 12, fontWeight: '500' }, chartGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, chartCard: { flexBasis: desktop ? '48%' : '100%', flexGrow: 1, minWidth: 0, overflow: 'visible', backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 8, padding: 14 }, chartTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, chartTitle: { color: theme.text, fontSize: 12, fontWeight: '600', flexShrink: 1 }, chartUnit: { color: theme.textMuted, fontWeight: '400' }, chartEmpty: { height: 180, alignItems: 'center', justifyContent: 'center' }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingTop: 5 }, legendItem: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5 }, legendDot: { width: 7, height: 7, borderRadius: 4 }, legendText: { color: theme.textMuted, fontSize: 9, flexShrink: 1 },
    diagnosticsPanel: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 8, overflow: 'hidden' }, diagnosticsToggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }, diagnosticsBody: { gap: 8, paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: theme.border }, diagnosticLabel: { color: theme.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, marginTop: 10 }, diagnosticOutput: { color: theme.text, fontSize: 10, lineHeight: 16, fontFamily: 'monospace' }, diagnosticState: { color: theme.primary, fontSize: 11, fontWeight: '500', paddingTop: 4 },
  });
}
