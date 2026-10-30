import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { transactionsApi, type Transaction } from '@/api/transactionsApi';
import { getTransactionMonthRange } from '@/utils/transactionPresentation';

type CashflowState = { key: string; rows: Transaction[] | null; loading: boolean; error: string | null };

export function useWalletCashflow(month: string, accountId: number | null, refreshKey: number) {
  const key = `${month}:${accountId ?? 'all'}`;
  const generation = useRef(0);
  const [state, setState] = useState<CashflowState>({ key: '', rows: null, loading: true, error: null });

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState((previous) => ({ key, rows: previous.key === key ? previous.rows : null, loading: true, error: null }));
    try {
      const range = getTransactionMonthRange(month);
      if (!range) throw new Error('Invalid month');
      const { data } = await transactionsApi.dateRange({ ...range, accountId, filter: 'NotDeleted' });
      if (!Array.isArray(data)) throw new Error('Invalid transaction response');
      if (request === generation.current) setState({ key, rows: data, loading: false, error: null });
    } catch {
      if (request === generation.current) setState({ key, rows: null, loading: false, error: 'Không tải được tổng thu/chi.' });
    }
  }, [accountId, key, month]);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { generation.current++; };
  }, [reload, refreshKey]));

  const current = state.key === key ? state : null;
  return { rows: current?.rows ?? null, loading: current?.loading ?? true, error: current?.error ?? null, reload };
}
