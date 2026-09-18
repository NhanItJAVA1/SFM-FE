import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import type { BudgetDailySpending } from '@/api/budgetsApi';

import { styles } from './budgets.styles';
import { formatMoney } from './helpers';

export function BudgetTransactionList({ dailySpendings }: { dailySpendings: BudgetDailySpending[] }) {
  const [selectedDay, setSelectedDay] = useState<BudgetDailySpending | null>(null);

  return (
    <>
      <View style={styles.transactionPanel}>
        <Text style={styles.detailTitle}>Mức chi tiêu từng ngày</Text>
        {dailySpendings.length === 0 ? (
          <Text style={styles.emptyTransactionText}>Chưa có giao dịch thuộc ngân sách này.</Text>
        ) : (
          dailySpendings.map((day) => (
            <DailyBudgetSpendingRow key={day.date} day={day} onPress={() => setSelectedDay(day)} />
          ))
        )}
      </View>

      <BudgetDayTransactionsSheet day={selectedDay} onClose={() => setSelectedDay(null)} />
    </>
  );
}

function DailyBudgetSpendingRow({ day, onPress }: { day: BudgetDailySpending; onPress: () => void }) {
  const progressWidth = `${Math.min(Math.max(day.usedPercentage, 0), 100)}%` as `${number}%`;
  const isToday = isSameDate(new Date(day.date), new Date());

  return (
    <Pressable style={styles.dailySpendingRow} onPress={onPress}>
      <View style={styles.budgetIcon}>
        <Text style={styles.budgetIconText}>{isToday ? 'N' : 'D'}</Text>
      </View>
      <View style={styles.budgetInfo}>
        <View style={styles.budgetTopRow}>
          <Text style={styles.budgetName}>{isToday ? 'Hôm nay' : formatDayLabel(day.date)}</Text>
          <Text style={styles.budgetAmount}>{formatMoney(day.amount)}</Text>
        </View>
        <View style={styles.budgetTopRow}>
          <Text style={styles.budgetCategory}>{day.transactionCount} giao dịch</Text>
          <Text style={styles.progressMeta}>{day.usedPercentage.toFixed(0)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
        {isToday ? (
          <View style={styles.todayBadge}>
            <Text style={styles.todayBadgeText}>Hôm nay</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function BudgetDayTransactionsSheet({
  day,
  onClose,
}: {
  day: BudgetDailySpending | null;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={day !== null} onRequestClose={onClose}>
      <Pressable style={styles.bottomSheetOverlay} onPress={onClose}>
        <Pressable style={styles.dayTransactionsSheet} onPress={(event) => event.stopPropagation()}>
          {day ? (
            <>
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>{isSameDate(new Date(day.date), new Date()) ? 'Hôm nay' : formatDayLabel(day.date)}</Text>
                  <Text style={styles.sheetSubtitle}>
                    {day.transactionCount} giao dịch · {formatMoney(day.amount)}
                  </Text>
                </View>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Text style={styles.sheetClose}>Đóng</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.sheetTransactionList}>
                {day.transactions.map((transaction) => (
                  <View key={transaction.id} style={styles.sheetTransactionRow}>
                    <View style={styles.transactionCopy}>
                      <Text style={styles.transactionDescription}>{transaction.description || 'Không có ghi chú'}</Text>
                      <Text style={styles.transactionDate}>
                        {new Intl.DateTimeFormat('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(transaction.transactionDate))}
                      </Text>
                    </View>
                    <Text style={styles.transactionAmount}>-{formatMoney(transaction.amount)}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(date));
}

function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
