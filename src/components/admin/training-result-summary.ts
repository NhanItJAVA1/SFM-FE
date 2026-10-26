import type { ForecastTrainingResponse } from '@/api/aiApi';

export type ComparisonSplit = 'validation' | 'test';
export type ComparisonMetric = 'sevenDayTotalWAPE' | 'dailyWAPE';

export function formatResultNumber(value: number | null | undefined, decimals = 2) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: decimals }).format(value)
    : '—';
}

export function formatResultDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function getRelativeImprovement(candidate?: number | null, baseline?: number | null): number | null {
  if (typeof candidate !== 'number' || typeof baseline !== 'number' || !Number.isFinite(candidate) || !Number.isFinite(baseline) || candidate < 0 || baseline <= 0) return null;
  return ((baseline - candidate) / baseline) * 100;
}

export function getModelLabel(name: string, trainedModel: string | null) {
  if (name === 'Mean14') return 'Trung bình 14 ngày';
  if (name === 'LastWeek') return 'Cùng thứ tuần trước';
  if (name === trainedModel) return 'Mô hình AI';
  return name;
}

export function summarizeTrainingResult(result: ForecastTrainingResponse) {
  const { validation, test, saveCheck } = result.evaluation;
  const names = [...new Set([...Object.keys(validation.models), ...Object.keys(test.models)])];
  const candidates = names.filter(name => ![saveCheck.baseline, 'Mean14', 'LastWeek'].includes(name));
  // The current service trains ScratchGradientBoosting. Do not mistake a baseline
  // for the trained model when the response omits candidate metrics.
  const modelName = names.includes('ScratchGradientBoosting') ? 'ScratchGradientBoosting' : candidates.length === 1 ? candidates[0] : null;
  const candidateMetric = modelName ? test.models[modelName]?.sevenDayTotalWAPE : undefined;
  const baselineMetric = test.models[saveCheck.baseline]?.sevenDayTotalWAPE;
  const testError = typeof candidateMetric === 'number' && Number.isFinite(candidateMetric) && candidateMetric >= 0 ? candidateMetric : undefined;
  const baselineError = typeof baselineMetric === 'number' && Number.isFinite(baselineMetric) && baselineMetric >= 0 ? baselineMetric : undefined;
  const improvement = getRelativeImprovement(testError, baselineError);
  const parts = [
    { key: 'train', label: 'Huấn luyện', detail: 'Học từ dữ liệu', data: result.split.train },
    { key: 'validation', label: 'Đánh giá', detail: 'Kiểm tra điều kiện lưu', data: result.split.validation },
    { key: 'test', label: 'Kiểm tra', detail: 'Đo sai số trên tập Test', data: result.split.test },
  ] as const;
  const rowTotal = parts.reduce((total, part) => total + Math.max(0, part.data.rowCount), 0);
  const splits = parts.map(part => ({ ...part, percentage: rowTotal > 0 ? Math.max(0, part.data.rowCount) / rowTotal * 100 : 0 }));
  return { names, modelName, testError, baselineError, improvement, splits };
}

export function getComparison(result: ForecastTrainingResponse, split: ComparisonSplit, metric: ComparisonMetric) {
  const summary = summarizeTrainingResult(result);
  const names = [...new Set([summary.modelName, result.evaluation.saveCheck.baseline, ...summary.names].filter((name): name is string => name !== null))];
  const rows = names.map(name => {
    const value = result.evaluation[split].models[name]?.[metric];
    return { name, value: typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null, isTrained: name === summary.modelName };
  });
  // WAPE can exceed 100%; preserve the values rather than capping the bars.
  const maximum = Math.max(100, ...rows.map(row => row.value ?? 0));
  const scale = Math.ceil(maximum / 10) * 10;
  return { rows, scale };
}
