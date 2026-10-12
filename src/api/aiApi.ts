import { axiosClient } from './axiosClient';

export type AIHealthStatus = 'Healthy' | 'Warning' | 'Critical' | string;

export type AIAnalysis = {
  user_id: number;
  health_label: number;
  health_status: AIHealthStatus;
  features: {
    total_income: number;
    total_expense: number;
    savings: number;
    savings_rate: number;
    transaction_count: number;
    expense_count: number;
    avg_expense: number;
    max_expense: number;
    expense_std: number;
    budget_count: number;
    avg_budget_usage: number;
    max_budget_usage: number;
  };
  anomalies: AIAnomaly[];
  recommendations: AIRecommendation[];
};

export type AIAnomaly = {
  transactionId: number;
  isAnomaly: boolean;
  score: number;
};

export type AIRecommendation = {
  category: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  title: string;
  message: string;
  action: string;
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
