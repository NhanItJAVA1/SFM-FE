import { axiosClient } from './axiosClient';
import type { Category, CategoryType } from './categoriesApi';

export type AdminUserStatus = 'Active' | 'Inactive' | 'Suspended';

export type MonitoringRange = '15m' | '1h' | '6h' | '24h';
export type MonitoringPoint = { timestampUtc: string; value: number | null };
export type MonitoringSeriesKey = 'requestsPerSecond' | 'p95LatencyMilliseconds' | 'http5xxErrorRatePercent';
export type AdminMonitoringTimeseries = {
  range: MonitoringRange;
  stepSeconds: number;
  series: Record<MonitoringSeriesKey, MonitoringPoint[]>;
};

export type AdminMonitoringOverview = {
  observedAtUtc?: string | null;
  observationWindow?: string | null;
  requestsPerSecond?: number | null;
  p95LatencyMilliseconds?: number | null;
  http5xxErrorRatePercent?: number | null;
  apiAvailabilityPercent?: number | null;
  apiHealth?: string | null;
  sqlServerHealth?: string | null;
  redisHealth?: string | null;
};

export type LoadTestScenario = 'smoke' | 'load' | 'stress' | 'spike';
export type LoadTestMode = 'concurrent_users' | 'request_rate';
export type LoadTestTarget = 'ping' | 'database' | 'redis';
export type LoadTestRunnerStatus = {
  status: 'idle' | 'running' | 'completed' | 'stopped' | 'failed' | string | null;
  running: boolean;
  testId: string | null;
  scenario: LoadTestScenario | null;
  target: LoadTestTarget | null;
  vus: number | null;
  durationSeconds: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  stopping?: boolean;
  diagnostics?: { stdout?: string; stderr?: string } | null;
};
export type LoadTestStartResult = {
  started?: boolean;
  id?: string;
  testId?: string;
  scenario?: LoadTestScenario;
  target?: LoadTestTarget;
};
export type LoadTestStartPayload =
  | { mode: 'concurrent_users'; target: LoadTestTarget; vus: number; durationSeconds: number }
  | { mode: 'request_rate'; target: LoadTestTarget; requestsPerSecond: number; durationSeconds: number }
  | { scenario: LoadTestScenario; target: LoadTestTarget; vus: number; durationSeconds: number };
export type LoadTestMetricPoint = { timestampUtc: string; value: number | null };
export type LoadTestP95Point = {
  timestampUtc: string;
  milliseconds: number | null;
  scenario: string | null;
  target: string | null;
  method: string | null;
  status: string | null;
};
export type LoadTestMetrics = {
  testId: string;
  timestampUtc: string;
  requestsPerSecond: number | null;
  httpErrorRatePercent: number | null;
  httpP95LatencyMilliseconds: number | null;
  httpP95LatencyBySeries: LoadTestP95Point[];
  activeVus: number | null;
  totalHttpRequests: number | null;
};
export type LoadTestMetricsHistory = {
  testId: string;
  rangeMinutes: number;
  requestsPerSecond: LoadTestMetricPoint[];
  httpErrorRatePercent: LoadTestMetricPoint[];
  httpP95LatencyBySeries: LoadTestP95Point[];
  activeVus: LoadTestMetricPoint[];
  totalHttpRequests: LoadTestMetricPoint[];
};
export type AdminUserRole = 'User' | 'Admin';

export type AdminCategoryPayload = {
  name: string;
  type: CategoryType;
  icon: string | null;
  isDefault: boolean;
};

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status?: AdminUserStatus;
  role: AdminUserRole;
  createdAt: string;
  firstFinancialAccountCreatedAt?: string | null;
  deletedAt?: string | null;
};

export type AdminUserQuery = {
  search?: string;
  status?: AdminUserStatus;
  role?: AdminUserRole;
  page?: number;
  pageSize?: number;
};

export type AdminUserPagedResponse = {
  items: AdminUser[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type UpdateAdminUserStatusPayload = {
  status: AdminUserStatus;
};

export type UpdateAdminUserRolePayload = {
  role: AdminUserRole;
};

function buildQuery(params: AdminUserQuery) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'number') {
      searchParams.set(key, String(value));
      return;
    }

    if (typeof value === 'string' && value.trim()) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();

  return query ? `?${query}` : '';
}

export const adminApi = {
  startLoadTest: (payload: LoadTestStartPayload) =>
    axiosClient.post<LoadTestStartResult>('/v1/admin/load-tests/start', payload, { timeout: 20000 }),
  stopLoadTest: () => axiosClient.post<{ stopped: boolean; id?: string; status?: string }>('/v1/admin/load-tests/stop', undefined, { timeout: 20000 }),
  loadTestStatus: (signal?: AbortSignal) =>
    axiosClient.get<LoadTestRunnerStatus>('/v1/admin/load-tests/status', { signal, timeout: 10000 }),
  loadTestMetrics: (testId: string, rateWindowSeconds: number, signal?: AbortSignal) =>
    axiosClient.get<LoadTestMetrics>(`/v1/admin/load-tests/metrics?${new URLSearchParams({ testId, rateWindowSeconds: String(rateWindowSeconds) })}`, { signal, timeout: 15000 }),
  loadTestHistory: (testId: string, rangeMinutes: number, rateWindowSeconds: number, signal?: AbortSignal) =>
    axiosClient.get<LoadTestMetricsHistory>(`/v1/admin/load-tests/metrics/history?${new URLSearchParams({ testId, rangeMinutes: String(rangeMinutes), rateWindowSeconds: String(rateWindowSeconds) })}`, { signal, timeout: 20000 }),
  monitoringTimeseries: (range: MonitoringRange, signal?: AbortSignal) =>
    axiosClient.get<AdminMonitoringTimeseries>(`/v1/admin/monitoring/timeseries?${new URLSearchParams({ range, step: '15s' })}`, { signal, timeout: 20000 }),
  monitoringOverview: (signal?: AbortSignal) =>
    axiosClient.get<AdminMonitoringOverview | null>('/v1/admin/monitoring/overview', { signal, timeout: 20000 }),
  listUsers: (params: AdminUserQuery = {}) =>
    axiosClient.get<AdminUserPagedResponse | AdminUser[]>(`/v1/admin/users${buildQuery(params)}`),
  getUser: (id: number) => axiosClient.get<AdminUser>(`/v1/admin/users/${id}`),
  updateUserStatus: (id: number, payload: UpdateAdminUserStatusPayload) =>
    axiosClient.patch<AdminUser>(`/v1/admin/users/${id}/status`, payload),
  updateUserRole: (id: number, payload: UpdateAdminUserRolePayload) =>
    axiosClient.patch<AdminUser>(`/v1/admin/users/${id}/role`, payload),
  listDefaultCategories: () => axiosClient.get<Category[]>('/v1/admin/categories'),
  createDefaultCategory: (payload: AdminCategoryPayload) =>
    axiosClient.post<Category>('/v1/admin/categories', payload),
  updateDefaultCategory: (id: number, payload: AdminCategoryPayload) =>
    axiosClient.put<Category>(`/v1/admin/categories/${id}`, payload),
  deleteDefaultCategory: (id: number) => axiosClient.delete(`/v1/admin/categories/${id}`),
};
