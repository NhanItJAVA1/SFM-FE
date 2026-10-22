import type { AdminMonitoringTimeseries, MonitoringPoint, MonitoringRange, MonitoringSeriesKey } from '@/api/adminApi';

export const monitoringRanges: MonitoringRange[] = ['15m', '1h', '6h', '24h'];
export const monitoringSeriesKeys: MonitoringSeriesKey[] = ['requestsPerSecond', 'p95LatencyMilliseconds', 'http5xxErrorRatePercent'];
const rangeMilliseconds: Record<MonitoringRange, number> = { '15m': 900000, '1h': 3600000, '6h': 21600000, '24h': 86400000 };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseMonitoringTimeseries(value: unknown, range: MonitoringRange): AdminMonitoringTimeseries {
  const data = record(value);
  const series = record(data?.series);
  if (!data || !series || data.range !== range || typeof data.stepSeconds !== 'number' || !Number.isFinite(data.stepSeconds) || data.stepSeconds < 15) {
    throw new Error('Cấu trúc dữ liệu biểu đồ không hợp lệ.');
  }
  const readPoints = (key: MonitoringSeriesKey): MonitoringPoint[] => {
    const points = series[key];
    if (points == null) return [];
    if (!Array.isArray(points)) throw new Error('Chuỗi giám sát không hợp lệ.');
    const unique = new Map<number, MonitoringPoint>();
    for (const point of points) {
      const item = record(point);
      const timestamp = item?.timestampUtc;
      if (typeof timestamp !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
        throw new Error('Timestamp giám sát không hợp lệ.');
      }
      // Missing/non-finite measurements stay null, never zero.
      unique.set(Date.parse(timestamp), { timestampUtc: timestamp, value:
        typeof item?.value === 'number' && Number.isFinite(item.value) && item.value >= 0 ? item.value : null });
    }
    return Array.from(unique.values()).sort((a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc));
  };
  return { range, stepSeconds: data.stepSeconds, series: {
    requestsPerSecond: readPoints('requestsPerSecond'),
    p95LatencyMilliseconds: readPoints('p95LatencyMilliseconds'),
    http5xxErrorRatePercent: readPoints('http5xxErrorRatePercent'),
  } };
}

export function sameMonitoringTimeseries(a: AdminMonitoringTimeseries | null, b: AdminMonitoringTimeseries) {
  return a !== null && a.range === b.range && a.stepSeconds === b.stepSeconds && monitoringSeriesKeys.every(key => {
    const before = a.series[key], after = b.series[key];
    return before.length === after.length && before.every((point, index) =>
      point.timestampUtc === after[index].timestampUtc && point.value === after[index].value);
  });
}

export function monitoringTimeBounds(data: AdminMonitoringTimeseries) {
  let first = Infinity, last = -Infinity;
  for (const key of monitoringSeriesKeys) {
    const points = data.series[key];
    if (points.length) {
      first = Math.min(first, Date.parse(points[0].timestampUtc));
      last = Math.max(last, Date.parse(points[points.length - 1].timestampUtc));
    }
  }
  if (!Number.isFinite(last)) return null;
  // Bounds use server sample timestamps, not the browser's polling clock.
  return { start: Math.min(first, last - rangeMilliseconds[data.range]), end: last };
}

export function splitMonitoringSegments(points: MonitoringPoint[], stepSeconds: number) {
  const segments: MonitoringPoint[][] = [];
  let current: MonitoringPoint[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (point.value === null || (previous && Date.parse(point.timestampUtc) - Date.parse(previous.timestampUtc) > stepSeconds * 1500)) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (point.value !== null) current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function monitoringAxisValue(value: number) {
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3, notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
}

export function monitoringAxisTime(timestamp: number, showDate = false) {
  return new Intl.DateTimeFormat('vi-VN', {
    ...(showDate ? { day: '2-digit', month: '2-digit' } as const : {}),
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}
