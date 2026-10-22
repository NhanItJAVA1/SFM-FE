import type { AdminMonitoringOverview } from '@/api/adminApi';

export type MonitoringHealth = 'Healthy' | 'Unhealthy' | 'Degraded' | 'Unknown';

export function monitoringHealth(value: unknown): MonitoringHealth {
  switch (typeof value === 'string' ? value.trim().toLowerCase() : '') {
    case 'healthy': return 'Healthy';
    case 'unhealthy': return 'Unhealthy';
    case 'degraded': return 'Degraded';
    default: return 'Unknown';
  }
}

export function metricNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatMonitoringMetric(value: unknown, unit: 'req/s' | 'ms' | '%') {
  const number = metricNumber(value);
  if (number === null) return 'N/A';
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number);
  return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
}

export function formatMonitoringWindow(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'N/A';
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return value;
  const units: Record<string, string> = { s: 'giây', m: 'phút', h: 'giờ', d: 'ngày' };
  return `${match[1]} ${units[match[2]]}`;
}

export function formatMonitoringTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'N/A';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }).format(date);
}

export function hasMonitoringData(data: AdminMonitoringOverview | null) {
  return data !== null && (
    [data.requestsPerSecond, data.p95LatencyMilliseconds, data.http5xxErrorRatePercent, data.apiAvailabilityPercent]
      .some(value => metricNumber(value) !== null) ||
    [data.apiHealth, data.sqlServerHealth, data.redisHealth].some(value => monitoringHealth(value) !== 'Unknown')
  );
}

export function monitoringDashboardUrl(value?: string): `https://${string}` | `http://${string}` | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      Array.from(url.searchParams.keys()).some(key => /token|password|api.?key|secret|authorization/i.test(key))) return null;
    return url.href as `https://${string}` | `http://${string}`;
  } catch {
    return null;
  }
}
