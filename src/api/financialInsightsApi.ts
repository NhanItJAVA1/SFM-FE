import { axiosClient } from '@/api/axiosClient';

export type FinancialInsight = {
  type: string;
  title: string;
  message: string;
};

export type FinancialInsightsResponse = {
  summary: string;
  insights: FinancialInsight[];
};

export type FinancialInsightsParams = {
  month: number;
  year: number;
};

function buildQuery(params: FinancialInsightsParams) {
  const searchParams = new URLSearchParams({
    month: String(params.month),
    year: String(params.year),
  });

  return `?${searchParams.toString()}`;
}

export const financialInsightsApi = {
  get: (params: FinancialInsightsParams) =>
    axiosClient.get<FinancialInsightsResponse>(`/financial-insights${buildQuery(params)}`),
};
