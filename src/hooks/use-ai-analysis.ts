import { useCallback, useEffect, useState } from "react";

import { aiApi, type AIAnalysis } from "@/api/aiApi";

let cachedAnalysis: AIAnalysis | null = null;
let analysisRequest: Promise<AIAnalysis> | null = null;

function loadAnalysis(force = false) {
  if (cachedAnalysis && !force) {
    return Promise.resolve(cachedAnalysis);
  }

  analysisRequest ??= aiApi
    .analysis()
    .then((response) => {
      cachedAnalysis = response.data;
      return response.data;
    })
    .finally(() => {
      analysisRequest = null;
    });

  return analysisRequest;
}

export function invalidateAIAnalysis() {
  cachedAnalysis = null;
}

export function useAIAnalysis() {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(cachedAnalysis);
  const [isLoading, setIsLoading] = useState(!cachedAnalysis);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    invalidateAIAnalysis();

    try {
      setAnalysis(await loadAnalysis(true));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error("Không tải được phân tích AI."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedAnalysis) {
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

  return { analysis, error, isLoading, refresh };
}
