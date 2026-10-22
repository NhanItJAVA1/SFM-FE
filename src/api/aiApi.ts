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
  healthModel?: string;
  healthModelVersion?: string | null;
  analysisConfigVersion?: string;
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
  historyMonths?: number | null;
  userIds?: number[];
};

export type ForecastTrainingMetrics = {
  dailyMAE: number;
  dailyRMSE: number;
  dailyWAPE: number | null;
  sevenDayTotalWAPE: number | null;
};

export type ForecastTrainingSplitPart = {
  rowCount: number;
  userCount: number;
  firstOrigin: string;
  lastOrigin: string;
};

export type ForecastTrainingResponse = {
  runId?: string;
  candidateModelVersion?: string;
  activeModelVersion?: string | null;
  archived?: boolean;
  activated?: boolean;
  catalogSynced?: boolean;
  catalogWarning?: string | null;
  selection?: { activate: boolean; reason: string; previousModelVersion?: string | null;
    candidate?: ForecastTrainingMetrics; previous?: ForecastTrainingMetrics | null };
  status: string;
  saved: boolean;
  modelVersion: string | null;
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

export type ForecastVersion = {
  runId: string;
  modelVersion: string;
  status: 'running' | 'succeeded' | 'failed' | 'imported';
  source?: string;
  isActive: boolean;
  hasModel: boolean;
  startedAt: string;
  finishedAt?: string;
  syncedAt?: string;
  parameters?: Record<string, number>;
  calibration?: number;
  dataset?: ForecastTrainingResponse['dataset'] | null;
  split?: ForecastTrainingResponse['split'] | null;
  evaluation?: ForecastTrainingResponse['evaluation'] | null;
  selection?: ForecastTrainingResponse['selection'];
  trainLogMSE?: { initial: number; final: number; byIteration?: number[] };
  error?: { type: string; message: string };
};

export type ForecastVersionPage = {
  activeModelVersion: string | null;
  total: number;
  limit: number;
  offset: number;
  items: ForecastVersion[];
};

export type ForecastModelArtifact = {
  formatVersion: number;
  model: string;
  nFeatures: number;
  baseValue: number;
  params: Record<string, number>;
  trees: unknown[];
  metadata: { modelVersion: string; featureNames: string[]; calibration?: number };
};

export type ForecastVersionAction = { status: string; activeModelVersion: string | null;
  catalogSynced: boolean; catalogWarning?: string | null };

export type AnalysisSettings = {
  health: { savingsRisk: number; savingsWarning: number; budgetWarning: number; budgetRisk: number };
  anomaly: { contamination: number; minExpenseCount: number };
};
export type AnalysisConfigVersion = {
  version: string; createdAt: string | null; actor: string; reason: string;
  restoredFrom: string | null; settings: AnalysisSettings;
};
export type AnalysisPreviewInput = {
  settings: AnalysisSettings; income: number; expense: number; budgetLimit: number;
  budgetSpent: number; unusualExpense: number;
};
export type AnalysisPreview = {
  preview: true; currency: 'VND'; sampleExpenseCount: number;
  health: { label: number; status: string; savingsRate: number; budgetUsage: number;
    breakdown: { cashflowStatus: string; budgetStatus: string; reasons: string[] } };
  anomaly: { summary: { status: string; availableExpenseCount: number; minRequiredExpenseCount: number;
    anomalyCount: number; contamination: number }; transactions: { transactionId: number; date: string;
      category: string; amount: number; anomalyScore: number; reasonCodes: string[] }[] };
};

export const aiApi = {
  analysisConfigHistory: () => axiosClient.get<{ activeVersion: string; items: AnalysisConfigVersion[] }>('/v1/admin/analysis-config/history'),
  saveAnalysisConfig: (payload: { baseVersion: string; settings: AnalysisSettings; reason: string }) =>
    axiosClient.post<AnalysisConfigVersion>('/v1/admin/analysis-config', payload),
  restoreAnalysisConfig: (version: string, payload: { baseVersion: string; reason: string }) =>
    axiosClient.post<AnalysisConfigVersion>(`/v1/admin/analysis-config/${encodeURIComponent(version)}/restore`, payload),
  previewAnalysisConfig: (payload: AnalysisPreviewInput) => axiosClient.post<AnalysisPreview>('/v1/admin/analysis-config/preview', payload),
  analysis: () => axiosClient.post<AIAnalysis>('/v1/FinancialAdvisor/analyze'),
  chat: (payload: AIChatPayload) => axiosClient.post<AIChatResponse>('/v1/AI/chat', payload),
  trainForecast: (payload: AIForecastTrainPayload) =>
    axiosClient.post<ForecastTrainingResponse>('/v1/admin/forecast/train', payload),
  forecastVersions: (limit = 10, offset = 0) =>
    axiosClient.get<ForecastVersionPage>(`/v1/admin/forecast/versions?limit=${limit}&offset=${offset}`),
  forecastVersion: (runId: string) =>
    axiosClient.get<ForecastVersion>(`/v1/admin/forecast/versions/${encodeURIComponent(runId)}`),
  forecastModel: (runId: string) =>
    axiosClient.get<ForecastModelArtifact>(`/v1/admin/forecast/versions/${encodeURIComponent(runId)}/model`),
  activateForecastVersion: (runId: string) =>
    axiosClient.post<ForecastVersionAction>(`/v1/admin/forecast/versions/${encodeURIComponent(runId)}/activate`),
  deleteForecastVersion: (runId: string) =>
    axiosClient.delete<ForecastVersionAction>(`/v1/admin/forecast/versions/${encodeURIComponent(runId)}`),
};
