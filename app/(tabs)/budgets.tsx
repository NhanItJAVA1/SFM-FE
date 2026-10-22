import { useFocusEffect } from "expo-router";
import { ScreenGradientBackground } from "@/components/screen-gradient-background";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { budgetsApi } from "@/api/budgetsApi";
import type { Category } from "@/api/categoriesApi";
import { categoriesApi } from "@/api/categoriesApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { useAIAnalysis } from "@/hooks/use-ai-analysis";
import { useAppTheme } from "@/hooks/use-app-theme";
import { BudgetCategoryItem } from "@/screens/budgets/budget-category-item";
import { BudgetSummaryCard } from "@/screens/budgets/budget-summary-card";
import { BudgetTransactionList } from "@/screens/budgets/budget-transaction-list";
import { useBudgetStyles } from "@/screens/budgets/budgets.styles";
import { CreateBudgetModal } from "@/screens/budgets/create-budget-modal";
import {
  buildBudgetPayload,
  buildBudgetUpdatePayload,
  getBudgetEditForm,
  getBudgetSummary,
  getDefaultBudgetFormState,
  sortBudgetsForCategoryTab,
} from "@/screens/budgets/helpers";
import type { BudgetFormState, BudgetsTab, BudgetWithProgress } from "@/screens/budgets/types";

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
  const [editingBudget, setEditingBudget] = useState<BudgetWithProgress | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submitInFlight = useRef(false);
  const [activeTab, setActiveTab] = useState<BudgetsTab>("month");
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [isLoadingSelectedBudgetDetail, setIsLoadingSelectedBudgetDetail] = useState(false);
  const [detailError, setDetailError] = useState<number | null>(null);
  const detailRequest = useRef(0);
  const [isCategoryScrollEnabled, setIsCategoryScrollEnabled] = useState(true);
  const { width: tabWidth } = useWindowDimensions();
  const previousTabWidth = useRef(tabWidth);
  const [form, setForm] = useState<BudgetFormState>(() => getDefaultBudgetFormState());
  const [tabTranslateX] = useState(() => new Animated.Value(0));
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const hasLoadedBudgetsRef = useRef(false);
  const { analysis, isLoading: isAILoading, refresh: refreshAI } = useAIAnalysis();

  const expenseCategories = useMemo(
    () => (categories ?? []).filter((category) => category.type === "Expense"),
    [categories],
  );
  const sortedBudgets = useMemo(() => sortBudgetsForCategoryTab(budgets), [budgets]);
  const selectedBudget = useMemo(
    () => (budgets ?? []).find((budget) => budget.id === selectedBudgetId) ?? sortedBudgets[0] ?? null,
    [budgets, selectedBudgetId, sortedBudgets],
  );
  const selectedBudgetCategory = useMemo(
    () => (categories ?? []).find((category) => category.id === selectedBudget?.categoryId),
    [categories, selectedBudget],
  );
  const selectedBudgetSummary = useMemo(
    () => (selectedBudget ? getBudgetSummary(selectedBudget) : null),
    [selectedBudget],
  );

  const loadBudgets = useCallback(
    async (mode: "loading" | "refreshing" | "silent" = "loading") => {
      try {
        if (mode === "refreshing") {
          setIsRefreshing(true);
        } else if (mode === "loading") {
          setIsLoading(true);
        }

        const [budgetResponse, categoryResponse] = await Promise.all([
          budgetsApi.progressSummary(),
          categoriesApi.list(),
          ...(mode === "refreshing" ? [refreshAI()] : []),
        ]);
        const budgetProgressEntries = (
          Array.isArray(budgetResponse.data) ? budgetResponse.data : []
        ).map<BudgetWithProgress>((progress) => ({
          ...progress,
          id: progress.id ?? progress.budgetId,
          progress,
          progressDetail: null,
        }));

        setBudgets(budgetProgressEntries);
        setCategories(Array.isArray(categoryResponse.data) ? categoryResponse.data : []);
        setSelectedBudgetId((currentBudgetId) => {
          if (currentBudgetId && budgetProgressEntries.some((budget) => budget.id === currentBudgetId)) {
            return currentBudgetId;
          }

          return sortBudgetsForCategoryTab(budgetProgressEntries)[0]?.id ?? null;
        });
        setDetailReloadKey((current) => current + 1);
      } catch (error) {
        Alert.alert("Không tải được ngân sách", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
      } finally {
        hasLoadedBudgetsRef.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [refreshAI],
  );

  const loadSelectedBudgetDetail = useCallback(async (budgetId: number) => {
    const request = ++detailRequest.current;
    try {
      setIsLoadingSelectedBudgetDetail(true);
      setDetailError(null);
      const response = await budgetsApi.getProgressDetail(budgetId);
      if (request !== detailRequest.current) return;

      setBudgets((currentBudgets) =>
        (currentBudgets ?? []).map((budget) =>
          budget.id === budgetId
            ? {
                ...budget,
                progress: response.data,
                progressDetail: response.data,
              }
            : budget,
        ),
      );
    } catch {
      if (request === detailRequest.current) setDetailError(budgetId);
    } finally {
      if (request === detailRequest.current) setIsLoadingSelectedBudgetDetail(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshAI();
      loadBudgets(hasLoadedBudgetsRef.current ? "silent" : "loading");
    }, [loadBudgets, refreshAI]),
  );

  useEffect(() => {
    if (selectedBudgetId === null) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void loadSelectedBudgetDetail(selectedBudgetId);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      detailRequest.current += 1;
    };
  }, [detailReloadKey, loadSelectedBudgetDetail, selectedBudgetId]);

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

  useEffect(() => {
    if (previousTabWidth.current !== tabWidth) {
      tabTranslateX.setValue(-TAB_INDEX[activeTab] * tabWidth);
      previousTabWidth.current = tabWidth;
    }
  }, [activeTab, tabWidth, tabTranslateX]);

  function openCreateBudget() {
    setEditingBudget(null);
    setSaveError(null);
    setForm(getDefaultBudgetFormState());
    setIsCreateVisible(true);
  }

  function openEditBudget() {
    if (!selectedBudget) return;
    setEditingBudget(selectedBudget);
    setSaveError(null);
    setForm(getBudgetEditForm(selectedBudget));
    setIsCreateVisible(true);
  }

  async function handleSaveBudget() {
    if (submitInFlight.current) return;
    setSaveError(null);
    const payload = editingBudget ? buildBudgetUpdatePayload(form, editingBudget) : buildBudgetPayload(form);

    if (!payload.name) {
      Alert.alert("Thiếu tên ngân sách", "Vui lòng nhập tên ngân sách.");
      return;
    }

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      Alert.alert("Hạn mức không hợp lệ", "Vui lòng nhập hạn mức lớn hơn 0.");
      return;
    }

    if (!Number.isFinite(payload.alertThreshold) || payload.alertThreshold < 0 || payload.alertThreshold > 100) {
      Alert.alert("Ngưỡng cảnh báo không hợp lệ", "Ngưỡng cảnh báo nên nằm trong khoảng 0-100%.");
      return;
    }

    if (!Number.isFinite(Date.parse(payload.startDate)) || !Number.isFinite(Date.parse(payload.endDate)) || Date.parse(payload.startDate) > Date.parse(payload.endDate)) {
      setSaveError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
      return;
    }

    try {
      submitInFlight.current = true;
      setIsSubmitting(true);
      if (editingBudget) {
        await budgetsApi.update(editingBudget.id, payload);
      } else {
        await budgetsApi.create(payload);
      }
      setIsCreateVisible(false);
      await loadBudgets();
    } catch (error) {
      setSaveError(`${editingBudget ? "Cập nhật" : "Tạo"} ngân sách thất bại. ${error instanceof Error ? error.message : "Vui lòng thử lại."}`);
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  function handleSelectBudget(budgetId: number) {
    setSelectedBudgetId(budgetId);
    changeTab("month");
  }

  function handleRequestDeleteBudget(budget: BudgetWithProgress, resetSwipe: () => void) {
    Alert.alert("Xóa ngân sách", `Bạn muốn xóa "${budget.name}"?`, [
      {
        onPress: resetSwipe,
        style: "cancel",
        text: "Hủy",
      },
      {
        onPress: async () => {
          try {
            await budgetsApi.remove(budget.id);
            await loadBudgets("refreshing");
          } catch (error) {
            resetSwipe();
            Alert.alert("Xóa ngân sách thất bại", error instanceof Error ? error.message : "Vui lòng thử lại.");
          }
        },
        style: "destructive",
        text: "Xóa",
      },
    ]);
  }

  return (
    <FocusedScreenTransition style={styles.screen}>
      <ScreenGradientBackground />
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
          style={[styles.periodTabButton, activeTab === "month" && styles.periodTabButtonActive]}
          onPress={() => changeTab("month")}
        >
          <Text style={activeTab === "month" ? styles.periodTabActive : styles.periodTab}>Tháng này</Text>
        </Pressable>
        <Pressable
          style={[styles.periodTabButton, activeTab === "category" && styles.periodTabButtonActive]}
          onPress={() => changeTab("category")}
        >
          <Text style={activeTab === "category" ? styles.periodTabActive : styles.periodTab}>Danh mục</Text>
        </Pressable>
      </View>

      {isAILoading ? (
        <View style={styles.aiSkeleton}>
          <View style={styles.aiSkeletonTitle} />
          <View style={styles.aiSkeletonLine} />
        </View>
      ) : null}

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
        <View style={styles.tabPager}>
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
                      onRefresh={() => loadBudgets("refreshing")}
                      tintColor={theme.text}
                    />
                  }
                >
                  <BudgetSummaryCard
                    key={`summary-${selectedBudget.id}`}
                    categoryId={selectedBudget.categoryId}
                    reloadKey={detailReloadKey}
                    categoryName={
                      selectedBudget.progress?.categoryName ?? selectedBudgetCategory?.name ?? "Tất cả danh mục"
                    }
                    name={selectedBudget.name}
                    summary={selectedBudgetSummary}
                    startDate={selectedBudget.startDate}
                    endDate={selectedBudget.endDate}
                    onIncreaseBudget={openEditBudget}
                  />
                  {isLoadingSelectedBudgetDetail ? (
                    <View style={styles.detailLoadingState}>
                      <ActivityIndicator color={theme.primary} size="small" />
                      <Text style={styles.emptyTransactionText}>Đang tải chi tiết ngân sách...</Text>
                    </View>
                  ) : null}
                  {detailError === selectedBudget.id ? (
                    <View style={styles.detailLoadingState}>
                      <Text style={[styles.emptyTransactionText, { flex: 1 }]}>Không tải được giao dịch ngân sách.</Text>
                      <Pressable accessibilityRole="button" onPress={() => void loadSelectedBudgetDetail(selectedBudget.id)} hitSlop={10}>
                        <Text style={{ color: theme.primary, fontWeight: "700" }}>Thử lại</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {selectedBudget.progressDetail ? (
                    <BudgetTransactionList key={`transactions-${selectedBudget.id}`} categories={categories} dailySpendings={selectedBudget.progressDetail.dailySpendings} />
                  ) : null}
                </ScrollView>
              ) : null}
            </View>

            <View style={[styles.tabPage, tabWidth > 0 ? { width: tabWidth } : null]}>
              <ScrollView
                contentContainerStyle={styles.content}
                scrollEnabled={activeTab === "category" && isCategoryScrollEnabled}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={() => loadBudgets("refreshing")}
                    tintColor={theme.text}
                  />
                }
              >
                {sortedBudgets.map((budget) => (
                  <BudgetCategoryItem
                    key={budget.id}
                    aiRecommendations={analysis?.recommendations ?? []}
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
        key={`${editingBudget?.id ?? "create"}-${isCreateVisible}`}
        categories={expenseCategories}
        form={form}
        isSubmitting={isSubmitting}
        onChangeForm={setForm}
        onClose={() => { if (!submitInFlight.current) setIsCreateVisible(false); }}
        onSubmit={handleSaveBudget}
        visible={isCreateVisible}
        mode={editingBudget ? "edit" : "create"}
        error={saveError}
      />
    </FocusedScreenTransition>
  );
}
