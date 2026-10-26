import { RotateCw } from 'lucide-react-native';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import type { MonitoringPoint, MonitoringRange, MonitoringSeriesKey } from '@/api/adminApi';
import { useAdminMonitoringTimeseries } from '@/hooks/use-admin-monitoring-timeseries';
import { adminStyleSheet, useAdminTheme, type AdminTheme } from './admin-design';
import { formatMonitoringMetric, formatMonitoringTime } from './monitoring-helpers';
import { monitoringAxisTime, monitoringAxisValue, monitoringRanges, monitoringTimeBounds, splitMonitoringSegments } from './monitoring-timeseries-data';

const metrics: { key: MonitoringSeriesKey; label: string; unit: 'req/s' | 'ms' | '%' }[] = [
  { key: 'requestsPerSecond', label: 'Request Rate', unit: 'req/s' },
  { key: 'p95LatencyMilliseconds', label: 'P95 Response Time', unit: 'ms' },
  { key: 'http5xxErrorRatePercent', label: 'HTTP 5xx Error Rate', unit: '%' },
];

export const MonitoringTimeseriesCharts = memo(function MonitoringTimeseriesCharts() {
  const theme = useAdminTheme();
  const styles = createStyles(theme);
  const [range, setRange] = useState<MonitoringRange>('1h');
  const { data, loading, refreshing, error, refresh } = useAdminMonitoringTimeseries(range);
  const bounds = useMemo(() => data ? monitoringTimeBounds(data) : null, [data]);

  return (
    <View style={styles.section} testID="monitoring-timeseries">
      <View style={styles.toolbar}>
        <View style={styles.copy}><Text accessibilityRole="header" style={styles.title}>Diễn biến hệ thống</Text><Text style={styles.muted}>Bước lấy mẫu: {data?.stepSeconds ?? 15} giây · Cập nhật: 15 giây</Text></View>
        <View style={styles.controls}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Khoảng thời gian biểu đồ" style={styles.ranges}>
            {monitoringRanges.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Khoảng ${value}`} accessibilityState={{ checked: value === range }} onPress={() => setRange(value)} style={({ hovered }) => [styles.range, hovered && styles.hover, value === range && styles.selected]}><Text style={[styles.rangeText, value === range && styles.selectedText]}>{value}</Text></Pressable>)}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Làm mới biểu đồ" disabled={refreshing} onPress={refresh} style={({ hovered }) => [styles.refresh, hovered && styles.hover, refreshing && styles.disabled]}>
            {refreshing ? <ActivityIndicator size="small" color={theme.textMuted} /> : <RotateCw size={15} color={theme.textMuted} />}
          </Pressable>
        </View>
      </View>
      {bounds ? <Text style={styles.muted}>Dữ liệu: {formatMonitoringTime(new Date(bounds.start).toISOString())} - {formatMonitoringTime(new Date(bounds.end).toISOString())}</Text> : null}
      {error ? <View accessibilityRole="alert" style={styles.notice}>
        <View style={styles.copy}><Text style={styles.error}>{error}</Text>{data ? <Text style={styles.muted}>Đang hiển thị lần tải thành công trước đó.</Text> : null}</View>
        <Pressable accessibilityRole="button" onPress={refresh} disabled={refreshing} style={styles.retry}><Text style={styles.link}>Thử lại biểu đồ</Text></Pressable>
      </View> : null}
      {metrics.map((metric, index) => <View key={metric.key} style={styles.chartSection}>
        {loading ? <View style={styles.loading}><Text style={styles.chartTitle}>{metric.label}</Text><ActivityIndicator color={theme.primary} /></View> : (
          <MonitoringLineChart label={metric.label} metricKey={metric.key} unit={metric.unit}
            points={data?.series[metric.key] ?? emptyPoints} start={bounds?.start ?? 0} end={bounds?.end ?? 0}
            stepSeconds={data?.stepSeconds ?? 15} range={range} unavailable={!data && !!error}
            color={index === 0 ? theme.primary : index === 1 ? theme.link : theme.dangerText} />
        )}
      </View>)}
    </View>
  );
});

const emptyPoints: MonitoringPoint[] = [];
const chartHeight = 200;
const left = 54, top = 12, bottom = 172;

const MonitoringLineChart = memo(function MonitoringLineChart({ label, metricKey, points, start, end, stepSeconds, unit, range, color, unavailable }: {
  label: string; metricKey: MonitoringSeriesKey; points: MonitoringPoint[]; start: number; end: number; stepSeconds: number;
  unit: 'req/s' | 'ms' | '%'; range: MonitoringRange; color: string; unavailable: boolean;
}) {
  const theme = useAdminTheme();
  const styles = createStyles(theme);
  const [width, setWidth] = useState(320);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const selected = points.find(point => point.timestampUtc === selectedTime) ?? points[points.length - 1];
  const geometry = useMemo(() => {
    const right = Math.max(left + 1, width - 12);
    let highest = 0;
    for (const point of points) if (point.value !== null) highest = Math.max(highest, point.value);
    const max = highest > 0 ? highest * 1.12 : 1;
    const x = (timestamp: number) => left + (timestamp - start) / Math.max(end - start, 1) * (right - left);
    const y = (value: number) => bottom - value / max * (bottom - top);
    const segments = splitMonitoringSegments(points, stepSeconds).map(segment => ({
      path: segment.map((point, index) => `${index ? 'L' : 'M'} ${x(Date.parse(point.timestampUtc)).toFixed(2)} ${y(point.value!).toFixed(2)}`).join(' '),
      singleton: segment.length === 1 ? { x: x(Date.parse(segment[0].timestampUtc)), y: y(segment[0].value!) } : null,
    }));
    return { x, y, max, right, segments };
  }, [points, start, end, stepSeconds, width]);
  const hasData = geometry.segments.length > 0;
  const tickCount = width >= 600 ? 5 : 3;

  return <View testID={`monitoring-chart-${metricKey}`} onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))}>
    <View style={styles.chartHeader}><Text accessibilityRole="header" style={styles.chartTitle}>{label} <Text style={styles.unit}>({unit})</Text></Text><Text style={[styles.value, { color: selected?.value != null ? color : theme.textMuted }]}>{formatMonitoringMetric(selected?.value, unit)}</Text></View>
    <Text style={styles.sampleTime}>{selected ? formatMonitoringTime(selected.timestampUtc) : 'Chưa có mẫu'}</Text>
    {hasData ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`Chọn mẫu ${label}`} onPress={event => {
          const mouse = event.nativeEvent as unknown as { clientX?: number };
          const element = event.currentTarget as unknown as { getBoundingClientRect: () => { left: number } };
          const pressedX = Platform.OS === 'web' && typeof mouse.clientX === 'number'
            ? mouse.clientX - element.getBoundingClientRect().left : event.nativeEvent.locationX;
          if (!Number.isFinite(pressedX)) return;
          const target = start + Math.min(1, Math.max(0, (pressedX - left) / (geometry.right - left))) * (end - start);
          let nearest = points[0];
          for (const point of points) if (Math.abs(Date.parse(point.timestampUtc) - target) < Math.abs(Date.parse(nearest.timestampUtc) - target)) nearest = point;
          if (nearest) setSelectedTime(nearest.timestampUtc);
        }}>
      <Svg pointerEvents="none" width={width} height={chartHeight} accessibilityRole="image" accessibilityLabel={`${label}, ${formatMonitoringMetric(selected?.value, unit)}, ${selected ? formatMonitoringTime(selected.timestampUtc) : ''}`}>
        {[0, 0.5, 1].map(ratio => <Line key={`grid-${ratio}`} x1={left} x2={geometry.right} y1={geometry.y(geometry.max * ratio)} y2={geometry.y(geometry.max * ratio)} stroke={theme.border} strokeDasharray={ratio === 0 ? undefined : '3 4'} />)}
        {[0, 0.5, 1].map(ratio => <SvgText key={`value-${ratio}`} x={left - 8} y={geometry.y(geometry.max * ratio) + 3} fill={theme.textMuted} fontSize={10} textAnchor="end">{monitoringAxisValue(geometry.max * ratio)}</SvgText>)}
        {Array.from({ length: tickCount }, (_, index) => {
          const timestamp = start + index / (tickCount - 1) * (end - start);
          return <SvgText key={`time-${index}`} x={geometry.x(timestamp)} y={194} fill={theme.textMuted} fontSize={10} textAnchor={index === 0 ? 'start' : index === tickCount - 1 ? 'end' : 'middle'}>{monitoringAxisTime(timestamp, range === '24h')}</SvgText>;
        })}
        {geometry.segments.map((segment, index) => segment.singleton ? <Circle key={index} testID={`monitoring-point-${metricKey}`} cx={segment.singleton.x} cy={segment.singleton.y} r={2.5} fill={color} /> : <Path key={index} testID={`monitoring-path-${metricKey}`} d={segment.path} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />)}
        {selected && selected.value !== null ? <Circle cx={geometry.x(Date.parse(selected.timestampUtc))} cy={geometry.y(selected.value)} r={3} fill={theme.screen} stroke={color} strokeWidth={1.5} /> : null}
      </Svg>
      </Pressable>
    ) : <View style={styles.empty}><Text style={styles.muted}>{unavailable ? 'Dữ liệu không khả dụng' : 'Chưa có số liệu trong khoảng thời gian này.'}</Text></View>}
  </View>;
});

function createStyles(theme: AdminTheme) {
  return adminStyleSheet({
    section: { gap: 16 }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
    copy: { flexGrow: 1, flexShrink: 1, gap: 5 }, title: { color: theme.text, fontSize: 14, fontWeight: '600', lineHeight: 22 }, muted: { color: theme.textMuted, fontSize: 12, lineHeight: 19 },
    controls: { flexDirection: 'row', alignItems: 'center', gap: 8 }, ranges: { flexDirection: 'row', borderColor: theme.border, borderWidth: 1, borderRadius: 6, padding: 3, gap: 2 },
    range: { minWidth: 44, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 4 }, rangeText: { color: theme.textMuted, fontSize: 12, fontWeight: '500' }, selected: { backgroundColor: theme.primaryPressed }, selectedText: { color: theme.primary }, hover: { backgroundColor: theme.cardAlt },
    refresh: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 6 }, disabled: { opacity: 0.6 },
    chartSection: { borderTopWidth: 1, borderColor: theme.border, paddingTop: 18 }, chartHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, chartTitle: { color: theme.text, fontSize: 13, fontWeight: '500', lineHeight: 20 }, unit: { color: theme.textMuted, fontSize: 11 }, value: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }, sampleTime: { color: theme.textMuted, fontSize: 11, lineHeight: 18, marginTop: 5, marginBottom: 8 },
    empty: { height: chartHeight, alignItems: 'center', justifyContent: 'center' }, loading: { height: chartHeight + 50, gap: 30, paddingTop: 4 },
    notice: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border }, error: { color: theme.dangerText, fontSize: 12, lineHeight: 19 }, retry: { padding: 8 }, link: { color: theme.primary, fontSize: 12, fontWeight: '500' },
  });
}
