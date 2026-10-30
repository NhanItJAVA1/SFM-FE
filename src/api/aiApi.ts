import { axiosClient } from './axiosClient';

export type AIHealthStatus = 'Healthy' | 'Warning' | 'Risk';

export type AIAnalysis = {
  user_id: number;
  health_status: AIHealthStatus;
  health_breakdown: {
    cashflowStatus: AIHealthStatus;
    budgetStatus: AIHealthStatus;
    reasons: string[];
  };
  features: {
    total_income: number;
    total_expense: number;
    net_cashflow: number;
    savings_rate: number;
    transaction_count: number;
    avg_expense: number;
    max_expense: number;
    max_budget_usage: number;
    top_categories: AITopCategory[];
  };
  anomalySummary: AIAnomalySummary;
  forecast: AIForecast;
  recommendations: AIRecommendation[];
  metadata: AIAnalysisMetadata;
};

export type AITopCategory = {
  name: string;
  amount: number;
};

export type AnomalyAssessment = {
  transactionId: number | null; date: string; categoryId: number | null; category: string;
  amount: number; reasonCodes: string[];
  status: 'normal' | 'anomaly' | 'insufficient_history';
  anomalyScore: number | null;
  categorySampleCount: number; categoryMedian: number | null;
};
// Kiểu dẫn xuất cho UI sau khi lọc assessments; API không gửi danh sách thứ hai.
export type AIAnomaly = AnomalyAssessment & { status: 'anomaly' };

export type AIAnomalySummary = {
  status: 'ok' | 'partial' | 'insufficient_data';
  assessedTransactionCount: number; anomalyCount: number; insufficientCount: number;
  assessments: AnomalyAssessment[];
};

export type AIForecast = {
  status: string; method: string; model: string; modelVersion: string | null;
  asOf: string; forecastStartDate: string; forecastEndDate: string;
  forecastHorizonDays: number; lookbackDays: number;
  dailyForecasts: AIDailyForecast[]; predictedTotalExpense: number;
  dataQuality: AIDataQuality;
};
export type AIDailyForecast = { date: string; predictedExpense: number };
export type AIDataQuality = {
  asOf: string; status: string; requiredHistoryDays: number; availableHistoryDays: number;
  missingDaysFilledWithZero: number; monthlyIncomeAvailable: boolean; notes: string[];
  [key: string]: unknown;
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
  asOf: string; periodStart: string; forecastContextStart: string;
  inputTransactionCount: number; periodTransactionCount: number; forecastTransactionCount: number;
  environment: string;
  periodDays: number;
  healthModel: string;
  analysisConfigVersion: string;
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

export const aiApi = {
  analysis: () => axiosClient.post<AIAnalysis>('/v1/FinancialAdvisor/analyze'),
  chat: (payload: AIChatPayload) => axiosClient.post<AIChatResponse>('/v1/AI/chat', payload),
};
