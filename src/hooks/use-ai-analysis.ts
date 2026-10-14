import { useCallback, useEffect, useState } from "react";

import { aiApi, type AIAnalysis } from "@/api/aiApi";

const AI_ANALYSIS_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedAnalysis: AIAnalysis | null = null;
let cachedAt = 0;
let analysisRequest: Promise<AIAnalysis> | null = null;

function isCacheFresh() {
  return cachedAnalysis && Date.now() - cachedAt < AI_ANALYSIS_CACHE_TTL_MS;
}

function loadAnalysis({ force = false } = {}) {
  if (isCacheFresh() && !force) {
    return Promise.resolve(cachedAnalysis);
  }

  analysisRequest ??= aiApi
    .analysis()
    .then((response) => {
      cachedAnalysis = response.data;
      cachedAt = Date.now();
      return response.data;
    })
    .finally(() => {
      analysisRequest = null;
    });

  return analysisRequest;
}

export function invalidateAIAnalysis() {
  cachedAnalysis = null;
  cachedAt = 0;
}

export function useAIAnalysis() {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(cachedAnalysis);
  const [isLoading, setIsLoading] = useState(!cachedAnalysis);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async ({ force = false } = {}) => {
    const shouldShowInitialLoading = !cachedAnalysis;

    if (shouldShowInitialLoading) {
      setIsLoading(true);
    }
    setIsRefreshing(true);
    setError(null);

    try {
      setAnalysis(await loadAnalysis({ force }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error("Không tải được phân tích AI."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isCacheFresh()) {
      return;
    }

    let isMounted = true;
    loadAnalysis()
      .then((nextAnalysis) => {
        if (isMounted) {
          setAnalysis(nextAnalysis);
        }
      })
      .catch((nextError) => {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError : new Error("Không tải được phân tích AI."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { analysis, error, isLoading, isRefreshing, refresh };
}
