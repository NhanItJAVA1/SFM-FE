import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { adminApi, type AdminMonitoringOverview } from '@/api/adminApi';
import { getAuthAccessToken, getAuthUser } from '@/stores/authSession';
import { isAdminUser } from '@/utils/authRole';

export const MONITORING_REFRESH_MS = 30000;

type MonitoringState = {
  data: AdminMonitoringOverview | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

export function useAdminMonitoring() {
  const [state, setState] = useState<MonitoringState>({ data: null, loading: true, refreshing: false, error: null });
  const refreshRef = useRef<(() => void) | null>(null);

  useFocusEffect(useCallback(() => {
    let disposed = false;
    let pending = false;
    let forbidden = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let appActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    const visible = () => appActive && (Platform.OS !== 'web' || document.visibilityState !== 'hidden');
    const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };

    async function load() {
      if (disposed || pending || !visible()) return;
      clearTimer();
      if (!getAuthAccessToken() || !isAdminUser(getAuthUser())) {
        setState({ data: null, loading: false, refreshing: false, error: 'Phiên quản trị không còn hợp lệ.' });
        return;
      }
      pending = true;
      controller = new AbortController();
      setState(current => ({ ...current, refreshing: true, error: null }));
      try {
        const { data } = await adminApi.monitoringOverview(controller.signal);
        if (disposed) return;
        const snapshot = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
        forbidden = false;
        setState({ data: snapshot, loading: false, refreshing: false, error: null });
      } catch (error) {
        if (disposed) return;
        const status = (error as { response?: { status?: number } } | null)?.response?.status;
        forbidden = status === 401 || status === 403;
        setState({ data: null, loading: false, refreshing: false, error: forbidden
          ? 'Không có quyền truy cập dữ liệu giám sát. Vui lòng kiểm tra phiên quản trị.'
          : 'Không tải được dữ liệu giám sát. Trạng thái dịch vụ hiện chưa xác định.' });
      } finally {
        pending = false;
        controller = null;
        // Schedule only after completion so slow requests cannot overlap.
        if (!disposed && !forbidden && visible()) timer = setTimeout(() => void load(), MONITORING_REFRESH_MS);
      }
    }

    function handleVisibility() {
      clearTimer();
      if (visible() && !forbidden) void load();
    }
    refreshRef.current = () => { void load(); };
    const subscription = AppState.addEventListener('change', next => {
      appActive = next === 'active';
      handleVisibility();
    });
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
  }, []));

  const refresh = useCallback(() => refreshRef.current?.(), []);
  return { ...state, refresh };
}
