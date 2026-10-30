export type SpendingStatsPeriod = { month: number; year: number };
export type SpendingStatsReturnPath = '/(tabs)/home' | '/(tabs)/transactions';
type SpendingStatsRequest = {
  id: number;
  returnPath: SpendingStatsReturnPath;
  period?: SpendingStatsPeriod;
};

const listeners = new Set<(request: SpendingStatsRequest) => void>();
let currentRequestId = 0;
let pendingRequest: SpendingStatsRequest | null = null;
let returnPath: SpendingStatsRequest['returnPath'] | null = null;

function requestSpendingStats(source: SpendingStatsReturnPath, period?: SpendingStatsPeriod) {
  returnPath = source;
  const request: SpendingStatsRequest = {
    id: currentRequestId + 1,
    returnPath,
    period,
  };
  pendingRequest = request;
  currentRequestId = request.id;

  listeners.forEach((listener) => listener(request));
}

export function requestSpendingStatsFromTransactions(period?: SpendingStatsPeriod) {
  requestSpendingStats('/(tabs)/transactions', period);
}

export function requestSpendingStatsFromHome(period?: SpendingStatsPeriod) {
  requestSpendingStats('/(tabs)/home', period);
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
