type SpendingStatsRequest = {
  id: number;
  source: 'transactions';
};

const listeners = new Set<(request: SpendingStatsRequest) => void>();
let currentRequestId = 0;
let isTransactionStatsFlowActive = false;
let pendingRequest: SpendingStatsRequest | null = null;
let returnPath: string | null = null;

export function requestSpendingStatsFromTransactions() {
  isTransactionStatsFlowActive = true;
  returnPath = '/(tabs)/transactions';
  pendingRequest = {
    id: currentRequestId + 1,
    source: 'transactions',
  };
  currentRequestId = pendingRequest.id;

  listeners.forEach((listener) => listener(pendingRequest as SpendingStatsRequest));
}

export function consumePendingSpendingStatsRequest() {
  const request = pendingRequest;
  pendingRequest = null;

  return request;
}

export function hasPendingSpendingStatsRequest() {
  return pendingRequest !== null;
}

export function isSpendingStatsFromTransactionsActive() {
  return isTransactionStatsFlowActive;
}

export function getSpendingStatsReturnPath() {
  return returnPath;
}

export function clearSpendingStatsFromTransactions() {
  isTransactionStatsFlowActive = false;
  pendingRequest = null;
  returnPath = null;
}

export function subscribeSpendingStatsRequest(listener: (request: SpendingStatsRequest) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
