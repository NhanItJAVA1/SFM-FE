type Recommendation = {
  budgetId?: number | null;
  source?: string;
};

export function currentRecommendations<T extends Recommendation>(items: T[]): T[] {
  // Hợp đồng mới không còn source. Giữ thứ tự server, vẫn đọc các nguồn luật cũ.
  return items.filter(item => item.source == null || ['observed', 'forecast', 'baseline', 'data_quality'].includes(item.source));
}

export function matchesRecommendationBudget(item: Recommendation, budget: { id: number; categoryId?: number | null }): boolean {
  return currentRecommendations([item]).length === 1 && item.budgetId === budget.id;
}
