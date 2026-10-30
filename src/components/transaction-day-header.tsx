import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Typography } from '@/theme/typography';
import { getTransactionDayHeading } from '@/utils/transactionPresentation';

export function TransactionDayHeader({ date }: { date: string }) {
  const theme = useAppTheme();
  const heading = getTransactionDayHeading(date);

  return (
    <View accessibilityRole="header" style={[styles.header, { backgroundColor: theme.listHeader }]}>
      <Text style={[styles.label, { color: theme.textSoft }]}>{heading.label}</Text>
      <Text style={[styles.date, { color: theme.textMuted }]}>{heading.date}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12, rowGap: 3, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  label: { ...Typography.label, fontWeight: '600' },
  date: Typography.caption,
});
