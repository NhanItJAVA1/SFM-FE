import { axiosClient } from './axiosClient';

export type AIHealthStatus = 'Healthy' | 'Warning' | 'Risk' | 'InsufficientData';

export type AIHealth = {
  status: AIHealthStatus;
  cashflowStatus: AIHealthStatus;
  reserveStatus: AIHealthStatus;
  reserveMonths: number | null;
  reasons: string[];
};

export type AIAnalysisFeatures = {
  total_income: number;
  total_expense: number;
  net_cashflow: number;
  transaction_count: number;
  current_balance: number | null;
  average_monthly_expense: number | null;
  history_months: number;
};

// Thống kê công khai tách khỏi kết quả Health và metadata của Forecast.
export type AIAnalysis = {
  features: AIAnalysisFeatures;
  health: AIHealth;
  anomalySummary: AIAnomalySummary;
  forecast: AIForecast;
  recommendations: AIRecommendation[];
  user_id: number;
  metadata: AIAnalysisMetadata;
};

export type AnomalyPolicy = {
  categoryMinCount: number;
  referenceLookbackDays: number;
  featureColumns: string[];
};

export type AnomalyAssessment = {
  transactionId: number | null; date: string; categoryId: number | null; category: string;
  amount: number; reasonCodes: string[];
  // Hai trạng thái còn lại chỉ để đọc kết quả/log phiên bản cũ.
  status: 'normal' | 'anomaly' | 'insufficient_history';
  anomalyScore: number | null;
  categorySampleCount: number; categoryMedian: number | null;
};

export type AIAnomaly = AnomalyAssessment & { status: 'anomaly' };
export type AIAnomalySummary = {
  status: 'ok' | 'partial' | 'insufficient_data';
  assessedTransactionCount: number; anomalyCount: number; insufficientCount: number;
  assessments: AnomalyAssessment[];
};

export type AIForecast = {
  status: string;
  forecastStartDate: string;
  forecastEndDate: string;
  dailyForecasts: AIDailyForecast[];
  predictedTotalExpense: number;
};
export type AIDailyForecast = { date: string; predictedExpense: number };
export type AIForecastDataQuality = {
  availableHistoryDays: number;
  missingDaysFilledWithZero: number;
  notes: string[];
};
export type AIForecastMetadata = {
  model: string;
  modelVersion: string | null;
  lookbackDays: number;
  forecastHorizonDays: number;
  dataQuality: AIForecastDataQuality;
};
// API Forecast độc lập có thể trả thêm chỉ số kỹ thuật; Analyze chỉ dùng bản gọn.
export type AIDataQuality = AIForecastDataQuality & { [key: string]: unknown };

export type AIRecommendation = {
  code: string;
  category: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | (string & {});
  title: string;
  message: string;
  action: string;
  budgetId: number | null;
  actionTarget: 'transactions' | 'budgets' | null;
};

export type AIAnalysisMetadata = {
  asOf: string;
  periodStart: string;
  periodDays: number;
  healthModel: string;
  analysisConfigVersion: string;
  recommendationMethod: string;
  forecast: AIForecastMetadata;
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
