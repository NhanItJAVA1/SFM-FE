import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { adminApi, type AdminMonitoringTimeseries, type MonitoringRange } from '@/api/adminApi';
import { parseMonitoringTimeseries, sameMonitoringTimeseries } from '@/components/admin/monitoring-timeseries-data';
import { getAuthAccessToken, getAuthUser } from '@/stores/authSession';
import { isAdminUser } from '@/utils/authRole';

export const MONITORING_CHART_REFRESH_MS = 15000;
type ChartState = { range: MonitoringRange; data: AdminMonitoringTimeseries | null; error: string | null; refreshing: boolean };

export function useAdminMonitoringTimeseries(range: MonitoringRange) {
  const [state, setState] = useState<ChartState>({ range, data: null, error: null, refreshing: true });
  const refreshRef = useRef<(() => void) | null>(null);

  useFocusEffect(useCallback(() => {
    let disposed = false, pending = false, forbidden = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let appActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    const visible = () => appActive && (Platform.OS !== 'web' || document.visibilityState !== 'hidden');
    const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };

    async function load() {
      if (disposed || pending || !visible()) return;
      clearTimer();
      if (!getAuthAccessToken() || !isAdminUser(getAuthUser())) {
        setState({ range, data: null, refreshing: false, error: 'Phiên quản trị không còn hợp lệ.' });
        return;
      }
      pending = true;
      controller = new AbortController();
      setState(current => ({ range, data: current.range === range ? current.data : null, error: null, refreshing: true }));
      try {
        const response = await adminApi.monitoringTimeseries(range, controller.signal);
        if (disposed) return;
        const data = parseMonitoringTimeseries(response.data, range);
        forbidden = false;
        setState(current => ({ range, data: sameMonitoringTimeseries(current.data, data) ? current.data : data, error: null, refreshing: false }));
      } catch (error) {
        if (disposed) return;
        const status = (error as { response?: { status?: number } } | null)?.response?.status;
        forbidden = status === 401 || status === 403;
        setState(current => ({ range,
          data: !forbidden && current.range === range ? current.data : null,
          refreshing: false,
          error: forbidden ? 'Không có quyền truy cập biểu đồ giám sát.' : 'Không cập nhật được dữ liệu biểu đồ.',
        }));
      } finally {
        pending = false;
        controller = null;
        if (!disposed && !forbidden && visible()) timer = setTimeout(() => void load(), MONITORING_CHART_REFRESH_MS);
      }
    }
    function handleVisibility() {
      clearTimer();
      if (visible() && !forbidden) void load();
    }
    refreshRef.current = () => { void load(); };
    const subscription = AppState.addEventListener('change', next => { appActive = next === 'active'; handleVisibility(); });
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', handleVisibility);
    void load();
    return () => {
      disposed = true;
      clearTimer();
      controller?.abort();
      refreshRef.current = null;
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [range]));

  const current = state.range === range;
  const refresh = useCallback(() => refreshRef.current?.(), []);
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !current || (!state.data && state.refreshing),
    refreshing: !current || state.refreshing,
    refresh,
  };
}
