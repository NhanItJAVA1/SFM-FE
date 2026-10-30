export type SpendingStatsPeriod = { month: number; year: number };
type SpendingStatsRequest = {
  id: number;
  returnPath: '/(tabs)/transactions';
  period?: SpendingStatsPeriod;
};

const listeners = new Set<(request: SpendingStatsRequest) => void>();
let currentRequestId = 0;
let pendingRequest: SpendingStatsRequest | null = null;
let returnPath: SpendingStatsRequest['returnPath'] | null = null;

export function requestSpendingStatsFromTransactions(period?: SpendingStatsPeriod) {
  returnPath = '/(tabs)/transactions';
  pendingRequest = {
    id: currentRequestId + 1,
    returnPath,
    period,
  };
  currentRequestId = pendingRequest.id;

  listeners.forEach((listener) => listener(pendingRequest as SpendingStatsRequest));
}

export function consumePendingSpendingStatsRequest() {
  const request = pendingRequest;
  pendingRequest = null;

  return request;
}

export function getSpendingStatsReturnPath() {
  return returnPath;
}

export function clearSpendingStatsFromTransactions() {
  pendingRequest = null;
  returnPath = null;
}

export function subscribeSpendingStatsRequest(listener: (request: SpendingStatsRequest) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
