import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  adminApi,
  type LoadTestMetrics,
  type LoadTestMetricsHistory,
  type LoadTestRunnerStatus,
  type LoadTestScenario,
  type LoadTestTarget,
} from '@/api/adminApi';
import { getAuthAccessToken, getAuthUser } from '@/stores/authSession';
import { isAdminUser } from '@/utils/authRole';
import { createAdminAccessError, parseLoadTestError, type LoadTestErrorDetails } from '@/utils/load-test-error';

type Settings = { rangeMinutes: number; rateWindowSeconds: number; refreshIntervalSeconds: number };
type LoadTestState = {
  status: LoadTestRunnerStatus | null;
  testId: string | null;
  metrics: LoadTestMetrics | null;
  history: LoadTestMetricsHistory | null;
  loading: boolean;
  refreshing: boolean;
  action: 'start' | 'stop' | null;
  error: LoadTestErrorDetails | null;
};

const emptyState: LoadTestState = {
  status: null, testId: null, metrics: null, history: null,
  loading: true, refreshing: false, action: null, error: null,
};

function validStatus(value: unknown): LoadTestRunnerStatus | null {
  if (!value || typeof value !== 'object') return null;
  const status = value as Partial<LoadTestRunnerStatus>;
  const raw = value as Record<string, unknown>;
  const running = typeof raw.running === 'boolean' ? raw.running : raw.status === 'running';
  const testId = typeof raw.testId === 'string' ? raw.testId : typeof raw.id === 'string' ? raw.id : null;
  const hasRunnerState = typeof raw.running === 'boolean' || typeof raw.status === 'string'
    || testId !== null || typeof raw.vus === 'number' || typeof raw.durationSeconds === 'number';
  if (!hasRunnerState) return null;
  return {
    status: typeof raw.status === 'string' ? raw.status : running ? 'running' : null,
    running,
    testId,
    scenario: status.scenario ?? null,
    target: status.target ?? null,
    vus: typeof raw.vus === 'number' && Number.isFinite(raw.vus) ? raw.vus : null,
    durationSeconds: typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds) ? raw.durationSeconds : null,
    startedAt: typeof status.startedAt === 'string' ? status.startedAt : null,
    finishedAt: typeof status.finishedAt === 'string' ? status.finishedAt : null,
    exitCode: typeof status.exitCode === 'number' ? status.exitCode : null,
    stopping: status.stopping === true,
    diagnostics: status.diagnostics ?? null,
  };
}

export function useAdminLoadTesting(active: boolean, settings: Settings) {
  const [state, setState] = useState<LoadTestState>(emptyState);
  const refreshRef = useRef<(() => void) | null>(null);
  const actionVersionRef = useRef(0);
  const actionLockRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useFocusEffect(useCallback(() => {
    if (!active) return;

    let disposed = false;
    let pending = false;
    let queued = false;
    let forbidden = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const visible = () => Platform.OS !== 'web' || document.visibilityState !== 'hidden';

    async function poll() {
      if (disposed || forbidden || !visible()) return;
      if (pending) {
        queued = true;
        return;
      }

      clearTimer();
      pending = true;
      queued = false;
      const version = actionVersionRef.current;
      const requestSettings = { ...settingsRef.current };
      const requestController = new AbortController();
      controller = requestController;
      setState(current => ({ ...current, loading: !current.status, refreshing: true,
        error: current.error?.statusCode === 409 ? current.error : null }));
      let status: LoadTestRunnerStatus | null = null;
      try {
        if (!getAuthAccessToken() || !isAdminUser(getAuthUser())) {
          forbidden = true;
          setState(current => ({ ...current, loading: false, refreshing: false, error: createAdminAccessError() }));
          return;
        }

        const statusResponse = await adminApi.loadTestStatus(requestController.signal);
        status = validStatus(statusResponse.data);
        if (disposed || version !== actionVersionRef.current) return;
        const resolvedTestId = status?.testId ?? null;
        setState(current => ({
          ...current,
          status,
          testId: resolvedTestId,
          metrics: current.metrics?.testId === resolvedTestId ? current.metrics : null,
          history: current.history?.testId === resolvedTestId ? current.history : null,
          loading: false,
          error: current.error?.statusCode === 409 ? current.error : null,
        }));

        const shouldLoadData = Boolean(status?.testId);
        if (shouldLoadData && status?.testId) {
          const [metricsResult, historyResult] = await Promise.allSettled([
            adminApi.loadTestMetrics(status.testId, requestSettings.rateWindowSeconds, requestController.signal),
            adminApi.loadTestHistory(status.testId, requestSettings.rangeMinutes,
              requestSettings.rateWindowSeconds, requestController.signal),
          ]);
          if (disposed || version !== actionVersionRef.current) return;
          const settingsChanged = requestSettings.rangeMinutes !== settingsRef.current.rangeMinutes
            || requestSettings.rateWindowSeconds !== settingsRef.current.rateWindowSeconds;
          if (settingsChanged) return;

          const metrics = metricsResult.status === 'fulfilled' && metricsResult.value.data.testId === status.testId ? metricsResult.value.data : null;
          const history = historyResult.status === 'fulfilled' && historyResult.value.data.testId === status.testId ? historyResult.value.data : null;
          const failures = [metricsResult, historyResult].filter(result => result.status === 'rejected');
          const unauthorized = failures.some(result => {
            const code = (result as PromiseRejectedResult).reason as { response?: { status?: number } };
            return code.response?.status === 401 || code.response?.status === 403;
          });
          forbidden = unauthorized;
          const firstFailure = (unauthorized
            ? failures.find(result => {
              const code = (result as PromiseRejectedResult).reason as { response?: { status?: number } };
              return code.response?.status === 401 || code.response?.status === 403;
            })
            : failures[0]) as PromiseRejectedResult | undefined;
          setState(current => ({
            ...current,
            metrics: metrics ?? current.metrics,
            history: history ?? current.history,
            testId: status!.testId,
            error: firstFailure ? parseLoadTestError(firstFailure.reason)
              : current.error?.statusCode === 409 ? current.error : null,
          }));
        }
      } catch (error) {
        if (disposed || requestController.signal.aborted) return;
        const statusCode = (error as { response?: { status?: number } } | null)?.response?.status;
        forbidden = statusCode === 401 || statusCode === 403;
        setState(current => ({ ...current, loading: false, error: parseLoadTestError(error) }));
      } finally {
        pending = false;
        if (controller === requestController) controller = null;
        if (disposed || forbidden || !visible()) return;
        if (queued) {
          queued = false;
          void poll();
        } else if (!status || status.running) {
          timer = setTimeout(() => void poll(), settingsRef.current.refreshIntervalSeconds * 1000);
        } else {
          setState(current => ({ ...current, loading: false, refreshing: false }));
        }
      }
    }

    const requestRefresh = () => {
      clearTimer();
      if (pending) queued = true;
      else void poll();
    };
    refreshRef.current = requestRefresh;
    const appSubscription = AppState.addEventListener('change', next => {
      if (next === 'active') requestRefresh();
      else clearTimer();
    });
    const handleVisibility = () => {
      if (visible()) requestRefresh();
      else clearTimer();
    };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', handleVisibility);
    void poll();

    return () => {
      disposed = true;
      clearTimer();
      controller?.abort();
      refreshRef.current = null;
      appSubscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [active]));

  useEffect(() => {
    refreshRef.current?.();
  }, [settings.rangeMinutes, settings.rateWindowSeconds, settings.refreshIntervalSeconds]);

  const start = useCallback(async (scenario: LoadTestScenario, target: LoadTestTarget, configuration: { vus: number; durationSeconds: number }) => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    actionVersionRef.current += 1;
    setState(current => ({ ...current, action: 'start', error: null }));
    try {
      const { data } = await adminApi.startLoadTest(scenario, target, configuration);
      const testId = data.testId ?? data.id ?? null;
      const started = data.started ?? Boolean(testId);
      const status: LoadTestRunnerStatus = {
        status: started ? 'running' : null, running: started, testId, scenario: data.scenario ?? null,
        target: data.target ?? null, vus: null, durationSeconds: null, startedAt: null, finishedAt: null, exitCode: null,
      };
      setState(current => ({ ...current, status, testId, metrics: null, history: null, loading: false, error: null }));
      refreshRef.current?.();
      return true;
    } catch (error) {
      const parsedError = parseLoadTestError(error);
      setState(current => ({ ...current, error: parsedError }));
      if (parsedError.statusCode === 409) refreshRef.current?.();
      return false;
    } finally {
      actionLockRef.current = false;
      setState(current => ({ ...current, action: null }));
    }
  }, []);

  const stop = useCallback(async () => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    actionVersionRef.current += 1;
    setState(current => ({ ...current, action: 'stop', error: null,
      status: current.status ? { ...current.status, stopping: true } : null }));
    try {
      await adminApi.stopLoadTest();
      refreshRef.current?.();
      return true;
    } catch (error) {
      setState(current => ({ ...current, error: parseLoadTestError(error) }));
      return false;
    } finally {
      actionLockRef.current = false;
      setState(current => ({ ...current, action: null }));
    }
  }, []);

  return { ...state, start, stop, refresh: () => refreshRef.current?.() };
}
