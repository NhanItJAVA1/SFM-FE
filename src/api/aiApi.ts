import { axiosClient } from './axiosClient';

export type AIHealthStatus = 'Healthy' | 'Warning' | 'Risk' | 'Critical' | string;

export type AIAnalysis = {
  user_id: number;
  health_label: number;
  health_status: AIHealthStatus;
  health_breakdown: {
    cashflowStatus: AIHealthStatus;
    budgetStatus: AIHealthStatus;
    reasons: string[];
  };
  features: {
    total_income: number;
    total_expense: number;
    savings: number;
    net_cashflow: number;
    savings_rate: number;
    transaction_count: number;
    expense_count: number;
    avg_expense: number;
    max_expense: number;
    expense_std: number;
    std_expense: number;
    budget_count: number;
    avg_budget_usage: number;
    max_budget_usage: number;
    top_categories: AITopCategory[];
  };
  anomalies: AIAnomaly[];
  anomalySummary: AIAnomalySummary;
  forecast: AIForecast;
  forecastEvaluation: AIForecastEvaluation;
  recommendations: AIRecommendation[];
  metadata: AIAnalysisMetadata;
};

export type AITopCategory = {
  name: string;
  amount: number;
};

export type AIAnomaly = {
  transactionId: number | null;
  isAnomaly: boolean;
  anomalyScore: number;
  date: string;
  categoryId: number | null;
  category: string;
  amount: number;
  reasonCodes: string[];
};

export type AIAnomalySummary = {
  status: string;
  scoredTransactionCount: number;
  anomalyCount: number;
  returnedCount: number;
  confidence: string;
  requestedPeriodDays: number;
  minRequiredExpenseCount: number;
  availableExpenseCount: number;
  contamination: number;
  monthlyIncomeAvailable: boolean;
  notes: string[];
};

export type AIForecast = {
  status: string;
  method: string;
  model: string | null;
  modelVersion: string | null;
  asOf: string;
  forecastStartDate: string | null;
  forecastEndDate: string | null;
  dailyForecasts: AIDailyForecast[];
  actualMonthToDateExpense: number;
  predictedRemainingExpense: number;
  predictedMonthEndExpense: number;
  lookbackDays: number;
  dataQuality: AIDataQuality;
};

export type AIDailyForecast = {
  date: string;
  predictedExpense: number;
  model: string;
};

export type AIForecastEvaluation = {
  available: boolean;
  reason: string;
  metricsSource: string;
  dataQuality: AIDataQuality;
};

export type AIDataQuality = {
  asOf: string;
  status: string;
  missingDaysFilledWithZero: number;
  notes: string[];
};

export type AIRecommendation = {
  category: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  title: string;
  message: string;
  action: string;
  code: string;
  priorityScore: number;
};

export type AIAnalysisMetadata = {
  environment: string;
  periodDays: number;
  forecastModel: string;
  forecastModelVersion: string | null;
  rankingModel: string;
  note: string;
};

export type AIChatPayload = {
  question: string;
};

export type AIChatSource = {
  source: string;
  chunk: number;
};

export type AIChatResponse = {
  answer: string;
  sources: AIChatSource[];
};

export type AIForecastTrainPayload = {
  asOf: string;
  userId: number[];
};

export type ForecastTrainingMetrics = {
  dailyMAE: number;
  dailyRMSE: number;
  dailyWAPE: number;
  sevenDayTotalWAPE: number;
};

export type ForecastTrainingSplitPart = {
  rowCount: number;
  userCount: number;
  firstOrigin: string;
  lastOrigin: string;
};

export type ForecastTrainingResponse = {
  status: string;
  saved: boolean;
  modelVersion: string;
  dataset: {
    inputUserCount: number;
    usableUserCount: number;
    skippedUserCount: number;
    skippedIncomeWindowCount: number;
    forecastWindowCount: number;
    rowCount: number;
    originStrideDays: number;
    asOf: string;
    currency: string;
    historicalMode: string;
    limitation: string;
  };
  split: {
    train: ForecastTrainingSplitPart;
    validation: ForecastTrainingSplitPart;
    test: ForecastTrainingSplitPart;
    method: string;
    purgeHorizonDays: number;
    discardedRows: number;
  };
  evaluation: {
    validation: { sampleCount: number; models: Record<string, ForecastTrainingMetrics> };
    test: { sampleCount: number; models: Record<string, ForecastTrainingMetrics> };
    saveCheck: { metric: string; baseline: string; passed: boolean; reason: string };
  };
};

export const aiApi = {
  analysis: () => axiosClient.post<AIAnalysis>('/v1/FinancialAdvisor/analyze'),
  chat: (payload: AIChatPayload) => axiosClient.post<AIChatResponse>('/v1/AI/chat', payload),
  trainForecast: (payload: AIForecastTrainPayload) =>
    axiosClient.post<ForecastTrainingResponse>('/v1/forecast/train', payload),
};
