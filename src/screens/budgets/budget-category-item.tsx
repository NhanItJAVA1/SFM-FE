import { useCallback, useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';

import type { Category } from '@/api/categoriesApi';

import { styles } from './budgets.styles';
import { describeCategory, formatMoney, isBudgetExpired } from './helpers';
import type { BudgetWithProgress } from './types';

const SWIPE_CLAIM_DISTANCE = 6;
const SWIPE_VERTICAL_TOLERANCE = 0.45;
const DELETE_DISTANCE_RATIO = 0.5;
const DELETE_VELOCITY = -0.85;
const DELETE_VELOCITY_DISTANCE_RATIO = 0.18;

export function BudgetCategoryItem({
  budget,
  categories,
  isSelected,
  onSwipeActiveChange,
  onPress,
  onRequestDelete,
}: {
  budget: BudgetWithProgress;
  categories: Category[];
  isSelected: boolean;
  onSwipeActiveChange: (isActive: boolean) => void;
  onPress: () => void;
  onRequestDelete: (resetSwipe: () => void) => void;
}) {
  const [rowWidth, setRowWidth] = useState(0);
  const [translateX] = useState(() => new Animated.Value(0));
  const category = categories.find((item) => item.id === budget.categoryId);
  const progress = budget.progressDetail ?? budget.progress;
  const categoryName = progress?.categoryName ?? describeCategory(category);
  const remainingAmount = progress?.remainingAmount ?? budget.amount;
  const usedPercentage = progress?.usedPercentage ?? 0;
  const isExpired = isBudgetExpired(budget);
  const resetSwipe = useCallback(() => {
    animateSwipe(translateX, 0);
  }, [translateX]);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dx < -SWIPE_CLAIM_DISTANCE &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * SWIPE_VERTICAL_TOLERANCE,
        onPanResponderGrant: () => onSwipeActiveChange(true),
        onPanResponderMove: (_, gestureState) => {
          translateX.setValue(clampSwipe(gestureState.dx, rowWidth));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (shouldConfirmDelete(gestureState.dx, gestureState.vx, rowWidth)) {
            animateSwipe(translateX, -rowWidth);
            onSwipeActiveChange(false);
            onRequestDelete(resetSwipe);
            return;
          }

          onSwipeActiveChange(false);
          resetSwipe();
        },
        onPanResponderTerminate: () => {
          onSwipeActiveChange(false);
          resetSwipe();
        },
      }),
    [onRequestDelete, onSwipeActiveChange, resetSwipe, rowWidth, translateX],
  );

  return (
    <View style={styles.swipeBudgetRow} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
      <View style={styles.swipeDeleteBackground}>
        <Text style={styles.swipeDeleteIcon}>🗑</Text>
      </View>
      <Animated.View
        style={[styles.swipeBudgetContent, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={[styles.categoryBudgetCard, isSelected && styles.categoryBudgetCardSelected]}
          onPress={onPress}
        >
          <View style={styles.budgetIcon}>
            <Text style={styles.budgetIconText}>{categoryName.charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.budgetInfo}>
            <View style={styles.budgetTopRow}>
              <Text style={styles.budgetName}>{budget.name}</Text>
              <Text style={[styles.budgetStatus, isExpired ? styles.budgetStatusExpired : styles.budgetStatusActive]}>
                {isExpired ? 'Hết hạn' : 'Còn hạn'}
              </Text>
            </View>
            <Text style={styles.budgetCategory}>{categoryName}</Text>
            <View style={styles.budgetTopRow}>
              <Text style={styles.budgetRemaining}>Còn lại {formatMoney(remainingAmount)}</Text>
              <Text style={styles.progressMeta}>{usedPercentage.toFixed(0)}%</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function animateSwipe(value: Animated.Value, toValue: number) {
  Animated.spring(value, {
    friction: 8,
    tension: 70,
    toValue,
    useNativeDriver: true,
  }).start();
}

function clampSwipe(dx: number, rowWidth: number) {
  return Math.max(-rowWidth, Math.min(0, dx));
}

function shouldConfirmDelete(dx: number, vx: number, rowWidth: number) {
  if (rowWidth <= 0) {
    return false;
  }

  const swipeDistance = Math.abs(dx);
  const passedHalfRow = swipeDistance > rowWidth * DELETE_DISTANCE_RATIO;
  const flickedLeft = vx < DELETE_VELOCITY && swipeDistance > rowWidth * DELETE_VELOCITY_DISTANCE_RATIO;

  return passedHalfRow || flickedLeft;
}
