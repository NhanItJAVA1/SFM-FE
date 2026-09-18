import { Text, View } from 'react-native';

import { styles } from './budgets.styles';
import { BudgetGauge } from './budget-gauge';
import { formatMoney } from './helpers';
import type { BudgetSummary } from './types';

export function BudgetSummaryCard({
  categoryName,
  name,
  summary,
}: {
  categoryName: string;
  name: string;
  summary: BudgetSummary;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryBudgetInfo}>
        <Text style={styles.summaryBudgetName}>{name}</Text>
        <Text style={styles.summaryBudgetCategory}>{categoryName}</Text>
      </View>
      <BudgetGauge
        alertThreshold={summary.alertThreshold}
        isAlert={summary.isAlert}
        percentage={summary.usedPercentage}
      />
      <Text style={styles.summaryCaption}>Số tiền bạn có thể chi</Text>
      <Text style={[styles.remainingValue, summary.isAlert && styles.dangerText]}>
        {formatMoney(summary.remainingAmount)}
      </Text>
      <View style={styles.summaryStats}>
        <SummaryMetric label="Tổng ngân sách" value={formatMoney(summary.totalAmount)} />
        <SummaryMetric label="Tổng đã chi" value={formatMoney(summary.spentAmount)} />
        <SummaryMetric label="Đến cuối tháng" value={`${summary.daysLeft} ngày`} />
      </View>
    </View>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryMetricValue}>{value}</Text>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
    </View>
  );
}
