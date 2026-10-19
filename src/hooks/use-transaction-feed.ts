import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { transactionsApi, type Transaction, type TransactionListParams } from "@/api/transactionsApi";

const LOAD_MORE_MIN_DURATION_MS = 1_000;

export function useTransactionFeed(params: TransactionListParams) {
  const { accountId, categoryId, fromDate, toDate } = params;
  const key = JSON.stringify([accountId, categoryId, fromDate, toDate]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const cursor = useRef({ page: 0, hasMore: false, failed: false });
  const loadedKey = useRef<string | null>(null);

  const reload = useCallback(async ({ refresh = false } = {}) => {
    const request = ++generation.current;
    const preserve = loadedKey.current === key;
    busy.current = true;
    cursor.current = { page: 0, hasMore: false, failed: false };
    setHasMore(false);
    setError(null);
    setLoadMoreError(null);
    setIsLoadingMore(false);
    setIsLoading(!preserve && !refresh);
    setIsRefreshing(refresh);
    if (!preserve) { setTransactions([]); setTotalCount(0); }
    try {
      const { data } = await transactionsApi.list({ accountId, categoryId, fromDate, toDate, page: 1, pageSize: 20 });
      if (request !== generation.current) return;
      const items = Array.isArray(data.items) ? data.items : [];
      const more = items.length > 0 && data.totalPages > 1;
      setTransactions([...new Map(items.map((item) => [item.id, item])).values()]);
      setTotalCount(data.totalCount);
      setHasMore(more);
      cursor.current = { page: 1, hasMore: more, failed: false };
      loadedKey.current = key;
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : "Không tải được giao dịch.");
    } finally {
      if (request === generation.current) {
        busy.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [accountId, categoryId, fromDate, key, toDate]);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { generation.current++; busy.current = false; };
  }, [reload]));

  const loadMore = useCallback(async ({ retry = false } = {}) => {
    if (busy.current || !cursor.current.hasMore || (cursor.current.failed && !retry) || loadedKey.current !== key) return;
    busy.current = true;
    const request = generation.current;
    const nextPage = cursor.current.page + 1;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const minimumLoading = new Promise<void>((resolve) => setTimeout(resolve, LOAD_MORE_MIN_DURATION_MS));
    try {
      const [{ data }] = await Promise.all([
        transactionsApi.list({ accountId, categoryId, fromDate, toDate, page: nextPage, pageSize: 20 }),
        minimumLoading,
      ]);
      if (request !== generation.current) return;
      const items = Array.isArray(data.items) ? data.items : [];
      setTransactions((current) => [...new Map([...current, ...items].map((item) => [item.id, item])).values()]);
      setTotalCount(data.totalCount);
      const more = items.length > 0 && nextPage < data.totalPages;
      cursor.current = { page: nextPage, hasMore: more, failed: false };
      setHasMore(more);
    } catch (cause) {
      await minimumLoading;
      if (request === generation.current) {
        cursor.current.failed = true;
        setLoadMoreError(cause instanceof Error ? cause.message : "Không tải được giao dịch tiếp theo.");
      }
    } finally {
      if (request === generation.current) {
        busy.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [accountId, categoryId, fromDate, key, toDate]);

  return { transactions, totalCount, isLoading, isRefreshing, isLoadingMore, error, loadMoreError, hasMore, reload, loadMore };
}
