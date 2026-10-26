import { Link } from 'expo-router';
import { Activity, CircleAlert, CircleCheck, CircleHelp, CircleX, Database, ExternalLink, Info, RotateCw, Server } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { useAdminMonitoring } from '@/hooks/use-admin-monitoring';
import { adminStyleSheet, useAdminTheme, type AdminTheme } from './admin-design';
import { formatMonitoringMetric, formatMonitoringTime, formatMonitoringWindow, monitoringDashboardUrl, hasMonitoringData, monitoringHealth } from './monitoring-helpers';
import { MonitoringTimeseriesCharts } from './monitoring-timeseries-charts';

const dashboards = [
  { label: 'Grafana', url: monitoringDashboardUrl(process.env.EXPO_PUBLIC_GRAFANA_DASHBOARD_URL) },
  { label: 'Prometheus', url: monitoringDashboardUrl(process.env.EXPO_PUBLIC_PROMETHEUS_URL) },
];

export function SystemMonitoringWorkspace() {
  const theme = useAdminTheme();
  const width = useWindowDimensions().width;
  const desktop = width >= 1100;
  const columns = width >= 1400 ? 4 : width >= 650 ? 2 : 1;
  const styles = createStyles(theme, desktop, columns);
  const { data, loading, refreshing, error, refresh } = useAdminMonitoring();
  const empty = !loading && !error && !hasMonitoringData(data);
  const windowLabel = formatMonitoringWindow(data?.observationWindow);
  const observedAt = formatMonitoringTime(data?.observedAtUtc);
  const metrics = [
    { label: 'Request Rate', value: data?.requestsPerSecond, unit: 'req/s', tip: 'Số request trung bình mỗi giây trong cửa sổ quan sát.' },
    { label: 'P95 Response Time', value: data?.p95LatencyMilliseconds, unit: 'ms', tip: '95% request có thời gian phản hồi không vượt quá giá trị này trong cửa sổ quan sát.' },
    { label: 'HTTP 5xx Error Rate', value: data?.http5xxErrorRatePercent, unit: '%', tip: 'Tỷ lệ request trả mã HTTP 5xx trong cửa sổ quan sát. N/A nghĩa là chưa có số liệu.' },
    { label: 'API Availability', value: data?.apiAvailabilityPercent, unit: '%', tip: 'Tỷ lệ thời gian API được hệ thống giám sát ghi nhận sẵn sàng trong cửa sổ quan sát.' },
  ] as const;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing && !loading} onRefresh={refresh} tintColor={theme.primary} />}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Giám sát hệ thống</Text>
          <Text style={styles.metadata}>Cửa sổ quan sát: {windowLabel} · Tự động làm mới: 30 giây</Text>
          <Text style={styles.metadata}>Quan sát gần nhất: {observedAt}</Text>
        </View>
        <View style={styles.actions}>
          {dashboards.map(({ label, url }) => url ? (
            <Link key={label} href={url} target="_blank" rel="noopener noreferrer" accessibilityLabel={`Mở ${label} trong tab mới`} style={[styles.button, styles.externalLink]}>
              <ExternalLink size={14} color={theme.primary} /><Text style={styles.linkText}>{label}</Text>
            </Link>
          ) : (
            <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`Chưa cấu hình URL ${label}`} disabled style={[styles.button, styles.disabled]}>
              <ExternalLink size={14} color={theme.textMuted} /><Text style={styles.buttonText}>{label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Làm mới giám sát" disabled={refreshing || loading} onPress={refresh} style={({ hovered }) => [styles.button, hovered && styles.hover, (refreshing || loading) && styles.disabled]}>
            {refreshing || loading ? <ActivityIndicator size="small" color={theme.textMuted} /> : <RotateCw size={15} color={theme.textMuted} />}
            <Text style={styles.buttonText}>Làm mới</Text>
          </Pressable>
        </View>
      </View>

      {error || empty ? <View accessibilityRole="alert" style={styles.notice}>
        <CircleAlert size={18} color={theme.textMuted} />
        <View style={styles.noticeCopy}><Text style={styles.noticeTitle}>{error ? 'Dữ liệu giám sát không khả dụng' : 'Chưa có số liệu giám sát'}</Text><Text style={styles.noticeText}>{error ?? 'Chưa xác định được các chỉ số và trạng thái dịch vụ tại lần quan sát này.'}</Text></View>
        <Pressable accessibilityRole="button" onPress={refresh} disabled={refreshing} style={styles.retry}><Text style={styles.linkText}>Thử lại</Text></Pressable>
      </View> : null}

      <View style={styles.kpiGrid}>
        {metrics.map(metric => <View key={metric.label} testID={`monitoring-kpi-${metric.unit === 'req/s' ? 'rate' : metric.unit === 'ms' ? 'p95' : metric.label.startsWith('HTTP') ? 'errors' : 'availability'}`} style={styles.kpi}>
          <View style={styles.kpiHeading}><Text style={styles.kpiLabel}>{metric.label}</Text><MetricHelp label={metric.label} text={metric.tip} theme={theme} /></View>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.kpiValue}>{loading ? '...' : formatMonitoringMetric(metric.value, metric.unit)}</Text>
          <Text style={styles.kpiWindow}>{loading ? 'Đang tải số liệu' : `Cửa sổ ${windowLabel}`}</Text>
        </View>)}
      </View>

      <MonitoringTimeseriesCharts />

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Trạng thái dịch vụ</Text>
        {[
          { label: 'SFM Backend API', description: 'Ứng dụng backend', value: data?.apiHealth, Icon: Server },
          { label: 'SQL Server', description: 'Cơ sở dữ liệu', value: data?.sqlServerHealth, Icon: Database },
          { label: 'Redis', description: 'Bộ nhớ đệm', value: data?.redisHealth, Icon: Activity },
        ].map(service => {
          const status = monitoringHealth(service.value);
          const Icon = service.Icon;
          const StatusIcon = status === 'Healthy' ? CircleCheck : status === 'Unhealthy' ? CircleX : status === 'Degraded' ? CircleAlert : CircleHelp;
          const color = status === 'Healthy' ? theme.primary : status === 'Unhealthy' ? theme.dangerText : status === 'Degraded' ? theme.warning : theme.textMuted;
          return <View key={service.label} style={styles.serviceRow} testID={`monitoring-service-${service.label.split(' ')[0].toLowerCase()}`}>
            <View style={styles.serviceIcon}><Icon size={18} color={theme.textMuted} /></View>
            <View style={styles.serviceCopy}><Text style={styles.serviceName}>{service.label}</Text><Text style={styles.serviceDescription}>{service.description}</Text></View>
            <View style={styles.status}><StatusIcon size={15} color={color} /><Text style={[styles.statusText, { color }]}>{status}</Text></View>
          </View>;
        })}
      </View>

    </ScrollView>
  );
}

function MetricHelp({ label, text, theme }: { label: string; text: string; theme: AdminTheme }) {
  const [open, setOpen] = useState(false);
  const styles = createHelpStyles(theme);
  return <View style={[styles.root, open && styles.front]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Thông tin ${label}`} accessibilityHint={text} accessibilityState={{ expanded: open }} onHoverIn={() => setOpen(true)} onHoverOut={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onPress={() => setOpen(value => !value)} style={styles.button}><Info size={14} color={theme.textMuted} /></Pressable>
    {open ? <View pointerEvents="none" style={styles.tooltip}><Text style={styles.text}>{text}</Text></View> : null}
  </View>;
}

function createHelpStyles(theme: AdminTheme) {
  return adminStyleSheet({
    root: { position: 'relative' }, front: { zIndex: 10 }, button: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    tooltip: { position: 'absolute', top: 30, right: 0, width: 220, padding: 10, borderRadius: 6, backgroundColor: theme.sheet, borderColor: theme.border, borderWidth: 1, zIndex: 10 },
    text: { color: theme.text, fontSize: 12, lineHeight: 18 },
  });
}

function createStyles(theme: AdminTheme, desktop: boolean, columns: number) {
  return adminStyleSheet({
    root: { flex: 1, backgroundColor: theme.screen },
    content: { alignSelf: 'center', width: '100%', maxWidth: 1360, padding: desktop ? 36 : 18, paddingBottom: 48, gap: 28 },
    header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 },
    headerCopy: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 6 }, title: { color: theme.text, fontSize: desktop ? 23 : 21, fontWeight: '600', lineHeight: 30 },
    metadata: { color: theme.textMuted, fontSize: 12, lineHeight: 19 },
    actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 },
    button: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingHorizontal: 12, borderColor: theme.border, borderWidth: 1, borderRadius: 6, backgroundColor: theme.card },
    buttonText: { color: theme.text, fontSize: 12, fontWeight: '500' }, hover: { backgroundColor: theme.cardAlt }, disabled: { opacity: 0.65 },
    linkText: { color: theme.primary, fontSize: 12, fontWeight: '500' },
    externalLink: { display: 'flex', justifyContent: 'center' },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    kpi: { width: columns === 4 ? '23.5%' : columns === 2 ? '48%' : '100%', flexGrow: 1, minWidth: 0, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 8, padding: 18, gap: 12 },
    kpiHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, zIndex: 1 }, kpiLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '500', flexShrink: 1, lineHeight: 18 },
    kpiValue: { color: theme.text, fontSize: 27, fontWeight: '600', lineHeight: 36, fontVariant: ['tabular-nums'] }, kpiWindow: { color: theme.textMuted, fontSize: 11, lineHeight: 16 },
    section: { gap: 14 }, sectionTitle: { color: theme.text, fontSize: 14, fontWeight: '600', lineHeight: 22 },
    serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 78, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
    serviceIcon: { width: 36, height: 36, borderRadius: 6, backgroundColor: theme.cardAlt, alignItems: 'center', justifyContent: 'center' },
    serviceCopy: { flex: 1, minWidth: 0, gap: 4 }, serviceName: { color: theme.text, fontSize: 13, fontWeight: '500', lineHeight: 19 }, serviceDescription: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 7 }, statusText: { fontSize: 12, fontWeight: '500' },
    notice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
    noticeCopy: { flex: 1, minWidth: 160, gap: 4 }, noticeTitle: { color: theme.text, fontSize: 13, fontWeight: '500' }, noticeText: { color: theme.textMuted, fontSize: 12, lineHeight: 19 }, retry: { padding: 8 },
  });
}
