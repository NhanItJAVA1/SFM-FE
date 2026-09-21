import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { budgetsApi } from '@/api/budgetsApi';
import type { Budget } from '@/api/budgetsApi';
import { categoriesApi } from '@/api/categoriesApi';
import type { Category } from '@/api/categoriesApi';
import { FocusedScreenTransition } from '@/components/screen-transition';
import { useAppTheme } from '@/hooks/use-app-theme';
import { BudgetCategoryItem } from '@/screens/budgets/budget-category-item';
import { BudgetSummaryCard } from '@/screens/budgets/budget-summary-card';
import { BudgetTransactionList } from '@/screens/budgets/budget-transaction-list';
import { useBudgetStyles } from '@/screens/budgets/budgets.styles';
import { CreateBudgetModal } from '@/screens/budgets/create-budget-modal';
import {
  buildBudgetPayload,
  getBudgetSummary,
  getDefaultBudgetFormState,
  sortBudgetsForCategoryTab,
} from '@/screens/budgets/helpers';
import type { BudgetsTab, BudgetFormState, BudgetWithProgress } from '@/screens/budgets/types';

const TAB_ANIMATION_DURATION = 260;
const TAB_INDEX: Record<BudgetsTab, number> = {
  month: 0,
  category: 1,
};

export default function BudgetsScreen() {
  const theme = useAppTheme();
  const styles = useBudgetStyles();
  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateVisible, setIsCreateVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<BudgetsTab>('month');
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [isCategoryScrollEnabled, setIsCategoryScrollEnabled] = useState(true);
  const [tabWidth, setTabWidth] = useState(0);
  const [form, setForm] = useState<BudgetFormState>(() => getDefaultBudgetFormState());
  const [tabTranslateX] = useState(() => new Animated.Value(0));
  const hasLoadedBudgetsRef = useRef(false);

  const expenseCategories = useMemo(() => categories.filter((category) => category.type === 'Expense'), [categories]);
  const sortedBudgets = useMemo(() => sortBudgetsForCategoryTab(budgets), [budgets]);
  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudgetId) ?? sortedBudgets[0] ?? null,
    [budgets, selectedBudgetId, sortedBudgets],
  );
  const selectedBudgetCategory = useMemo(
    () => categories.find((category) => category.id === selectedBudget?.categoryId),
    [categories, selectedBudget],
  );
  const selectedBudgetSummary = useMemo(
    () => (selectedBudget ? getBudgetSummary(selectedBudget) : null),
    [selectedBudget],
  );

  const loadBudgets = useCallback(async (mode: 'loading' | 'refreshing' | 'silent' = 'loading') => {
    try {
      if (mode === 'refreshing') {
        setIsRefreshing(true);
      } else if (mode === 'loading') {
        setIsLoading(true);
      }

      const [budgetResponse, categoryResponse] = await Promise.all([
        budgetsApi.list(),
        categoriesApi.list(),
      ]);
      const budgetProgressEntries = await Promise.all(budgetResponse.data.map(loadBudgetProgress));

      setBudgets(budgetProgressEntries);
      setCategories(categoryResponse.data);
      setSelectedBudgetId((currentBudgetId) => {
        if (currentBudgetId && budgetProgressEntries.some((budget) => budget.id === currentBudgetId)) {
          return currentBudgetId;
        }

        return sortBudgetsForCategoryTab(budgetProgressEntries)[0]?.id ?? null;
      });
    } catch (error) {
      Alert.alert('Không tải được ngân sách', error instanceof Error ? error.message : 'Vui lòng thử lại sau.');
    } finally {
      hasLoadedBudgetsRef.current = true;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBudgets(hasLoadedBudgetsRef.current ? 'silent' : 'loading');
    }, [loadBudgets]),
  );

  const changeTab = useCallback(
    (nextTab: BudgetsTab) => {
      setActiveTab(nextTab);

      Animated.timing(tabTranslateX, {
        duration: TAB_ANIMATION_DURATION,
        toValue: -TAB_INDEX[nextTab] * tabWidth,
        useNativeDriver: true,
      }).start();
    },
    [tabTranslateX, tabWidth],
  );

  function openCreateBudget() {
    setForm(getDefaultBudgetFormState());
    setIsCreateVisible(true);
  }

  async function handleCreateBudget() {
    const payload = buildBudgetPayload(form);

    if (!payload.name) {
      Alert.alert('Thiếu tên ngân sách', 'Vui lòng nhập tên ngân sách.');
      return;
    }

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      Alert.alert('Hạn mức không hợp lệ', 'Vui lòng nhập hạn mức lớn hơn 0.');
      return;
    }

    if (!Number.isFinite(payload.alertThreshold) || payload.alertThreshold < 0 || payload.alertThreshold > 100) {
      Alert.alert('Ngưỡng cảnh báo không hợp lệ', 'Ngưỡng cảnh báo nên nằm trong khoảng 0-100%.');
      return;
    }

    try {
      setIsSubmitting(true);
      await budgetsApi.create(payload);
      setIsCreateVisible(false);
      await loadBudgets();
    } catch (error) {
      Alert.alert('Tạo ngân sách thất bại', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSelectBudget(budgetId: number) {
    setSelectedBudgetId(budgetId);
    changeTab('month');
  }

  function handleRequestDeleteBudget(budget: BudgetWithProgress, resetSwipe: () => void) {
    Alert.alert('Xóa ngân sách', `Bạn muốn xóa "${budget.name}"?`, [
      {
        onPress: resetSwipe,
        style: 'cancel',
        text: 'Hủy',
      },
      {
        onPress: async () => {
          try {
            await budgetsApi.remove(budget.id);
            await loadBudgets('refreshing');
          } catch (error) {
            resetSwipe();
            Alert.alert('Xóa ngân sách thất bại', error instanceof Error ? error.message : 'Vui lòng thử lại.');
          }
        },
        style: 'destructive',
        text: 'Xóa',
      },
    ]);
  }

  return (
    <FocusedScreenTransition style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Ngân sách Đang áp dụng</Text>
        {budgets.length > 0 ? (
          <Pressable style={styles.headerAddButton} onPress={openCreateBudget}>
            <Text style={styles.headerAddText}>+</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <View style={styles.periodTabs}>
        <Pressable
          style={[styles.periodTabButton, activeTab === 'month' && styles.periodTabButtonActive]}
          onPress={() => changeTab('month')}
        >
          <Text style={activeTab === 'month' ? styles.periodTabActive : styles.periodTab}>Tháng này</Text>
        </Pressable>
        <Pressable
          style={[styles.periodTabButton, activeTab === 'category' && styles.periodTabButtonActive]}
          onPress={() => changeTab('category')}
        >
          <Text style={activeTab === 'category' ? styles.periodTabActive : styles.periodTab}>Danh mục</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : budgets.length === 0 ? (
        <View style={styles.emptyState}>
          <Pressable style={styles.createButton} onPress={openCreateBudget}>
            <Text style={styles.createButtonText}>Tạo Ngân sách</Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={styles.tabPager}
          onLayout={(event) => {
            const nextTabWidth = event.nativeEvent.layout.width;

            setTabWidth(nextTabWidth);
            tabTranslateX.setValue(-TAB_INDEX[activeTab] * nextTabWidth);
          }}
        >
          <Animated.View
            style={[
              styles.tabPagerTrack,
              tabWidth > 0 ? { transform: [{ translateX: tabTranslateX }], width: tabWidth * 2 } : null,
            ]}
          >
            <View style={[styles.tabPage, tabWidth > 0 ? { width: tabWidth } : null]}>
              {selectedBudget && selectedBudgetSummary ? (
                <ScrollView
                  contentContainerStyle={styles.content}
                  refreshControl={
                    <RefreshControl
                      refreshing={isRefreshing}
                      onRefresh={() => loadBudgets('refreshing')}
                      tintColor={theme.text}
                    />
                  }
                >
                  <BudgetSummaryCard
                    categoryName={
                      selectedBudget.progress?.categoryName ?? selectedBudgetCategory?.name ?? 'Tất cả danh mục'
                    }
                    name={selectedBudget.name}
                    summary={selectedBudgetSummary}
                  />
                  <BudgetTransactionList dailySpendings={selectedBudget.progressDetail?.dailySpendings ?? []} />
                </ScrollView>
              ) : null}
            </View>

            <View style={[styles.tabPage, tabWidth > 0 ? { width: tabWidth } : null]}>
              <ScrollView
                contentContainerStyle={styles.content}
                scrollEnabled={activeTab === 'category' && isCategoryScrollEnabled}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={() => loadBudgets('refreshing')}
                    tintColor={theme.text}
                  />
                }
              >
                {sortedBudgets.map((budget) => (
                  <BudgetCategoryItem
                    key={budget.id}
                    budget={budget}
                    categories={categories}
                    isSelected={budget.id === selectedBudget?.id}
                    onSwipeActiveChange={(isActive) => setIsCategoryScrollEnabled(!isActive)}
                    onPress={() => handleSelectBudget(budget.id)}
                    onRequestDelete={(resetSwipe) => handleRequestDeleteBudget(budget, resetSwipe)}
                  />
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      )}

      <CreateBudgetModal
        categories={expenseCategories}
        form={form}
        isSubmitting={isSubmitting}
        onChangeForm={setForm}
        onClose={() => setIsCreateVisible(false)}
        onSubmit={handleCreateBudget}
        visible={isCreateVisible}
      />
    </FocusedScreenTransition>
  );
}

async function loadBudgetProgress(budget: Budget): Promise<BudgetWithProgress> {
  try {
    const progressDetailResponse = await budgetsApi.getProgressDetail(budget.id);

    return {
      ...budget,
      progress: progressDetailResponse.data,
      progressDetail: progressDetailResponse.data,
    };
  } catch {
    return loadBudgetProgressFallback(budget);
  }
}

async function loadBudgetProgressFallback(budget: Budget): Promise<BudgetWithProgress> {
  try {
    const progressResponse = await budgetsApi.getProgress(budget.id);

    return { ...budget, progress: progressResponse.data, progressDetail: null };
  } catch {
    return { ...budget, progress: null, progressDetail: null };
  }
}
