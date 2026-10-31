import { Typography } from '@/theme/typography';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-text';
import { BottomPopup, BottomPopupPressable } from "@/components/bottom-popup";
import { CategoryIcon, CategoryIconBadge, getCategoryIconKey } from '@/components/category-icon';
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { categoriesApi, Category, CategoryType, getCategoryCreateErrorMessage, hasCategoryName, normalizeCategoryName } from "@/api/categoriesApi";
import { FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";
import {
  buildCreateTransactionFromScanPayload,
  TransactionDraft,
  TransactionDraftItem,
  transactionsApi,
} from "@/api/transactionsApi";
import { ScreenTransition } from "@/components/screen-transition";
import { invalidateAIAnalysis } from "@/hooks/use-ai-analysis";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { presentTransactionNotifications } from "@/services/transactionNotifications";
import type { AppTheme } from "@/theme/appTheme";
import { getAccountCurrentBalance } from "@/utils/accountBalance";

type TransactionDraftReviewProps = {
  draft: TransactionDraft;
  imageUri?: string;
  onRetake: () => void;
};

type EditableBillDraft = {
  amount: number | null;
  description: string;
  transactionDate: string;
  location: string;
  type: string;
  items: TransactionDraftItem[];
  itemsTotal: number | null;
  difference: number | null;
};

type EditableTextField = "location" | "description";

const transactionTypes = [
  { label: "Chi tiêu", value: "Expense" },
  { label: "Thu nhập", value: "Income" },
];

function formatAmount(amount: unknown) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "Chưa nhận diện";
  }

  return new Intl.NumberFormat("vi-VN", {
    currency: "VND",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "Chưa nhận diện";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} | ${hours}:${minutes}`;
}

function formatText(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "Chưa nhận diện";
}

function useDraftReviewStyles() {
  const theme = useAppTheme();

  return useMemo(() => createStyles(theme), [theme]);
}

function getInitialEditableDraft(draft: TransactionDraft): EditableBillDraft {
  return {
    amount: draft.amount ?? null,
    description: draft.description ?? draft.merchantName ?? "",
    difference: draft.difference ?? null,
    items: Array.isArray(draft.items) ? draft.items : [],
    itemsTotal: draft.itemsTotal ?? null,
    location: draft.location ?? "",
    transactionDate: draft.transactionDate ?? "",
    type: draft.type ?? "Expense",
  };
}

function parseOptionalNumber(value: string) {
  const normalizedValue = value.trim().replace(/,/g, "");

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getTransactionTypeLabel(value: string | null | undefined) {
  return transactionTypes.find((type) => type.value === value)?.label ?? value ?? "Chi tiêu";
}

function getDatePickerValue(value: string) {
  const parsedDate = value ? new Date(value) : new Date();

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

function mergePickedDate(currentValue: string, pickedDate: Date) {
  const currentDate = getDatePickerValue(currentValue);
  const nextDate = new Date(pickedDate);

  nextDate.setHours(currentDate.getHours(), currentDate.getMinutes(), currentDate.getSeconds(), 0);

  return nextDate.toISOString();
}

export function TransactionDraftReview({ draft, onRetake }: TransactionDraftReviewProps) {
  const theme = useAppTheme();
  const themeMode = useThemeMode();
  const styles = useDraftReviewStyles();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editableDraft, setEditableDraft] = useState<EditableBillDraft>(() => getInitialEditableDraft(draft));
  const [billEditDraft, setBillEditDraft] = useState<EditableBillDraft>(() => getInitialEditableDraft(draft));
  const [amountInput, setAmountInput] = useState(String(draft.amount ?? ""));
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(typeof draft.accountId === "number" ? draft.accountId : null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    typeof draft.categoryId === "number" ? draft.categoryId : null,
  );
  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isCategoryPickerVisible, setIsCategoryPickerVisible] = useState(false);
  const [isCreateCategoryVisible, setIsCreateCategoryVisible] = useState(false);
  const [isAmountEditorVisible, setIsAmountEditorVisible] = useState(false);
  const [isTypePickerVisible, setIsTypePickerVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isBillEditorVisible, setIsBillEditorVisible] = useState(false);
  const [activeTextFieldEditor, setActiveTextFieldEditor] = useState<EditableTextField | null>(null);
  const [textFieldInput, setTextFieldInput] = useState("");
  const [isReviewInfoExpanded, setIsReviewInfoExpanded] = useState(false);
  const [isTransactionInfoExpanded, setIsTransactionInfoExpanded] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const isCreatingCategoryRef = useRef(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryNameError, setCategoryNameError] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>("Expense");
  const [isSaving, setIsSaving] = useState(false);
  const items = editableDraft.items ?? [];
  const editorSubtotal = billEditDraft.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const editorDifference = billEditDraft.amount === null ? null : billEditDraft.amount - editorSubtotal;
  const displayedItemsTotal = editableDraft.itemsTotal ?? items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const displayedDifference = editableDraft.difference ?? (editableDraft.amount === null ? null : editableDraft.amount - displayedItemsTotal);
  const categoryType: CategoryType = editableDraft.type === "Income" ? "Income" : "Expense";
  const categoryOptions = (categories ?? []).filter((category) => category.type === categoryType);
  const selectedAccount = (accounts ?? []).find((account) => account.id === selectedAccountId) ?? null;
  const selectedCategory = (categories ?? []).find((category) => category.id === selectedCategoryId) ?? null;

  const loadCategories = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoadingCategories(true);
    }

    const response = await categoriesApi.list();
    const categoryData = Array.isArray(response.data) ? response.data : [];
    setCategories(categoryData);

    return categoryData;
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingAccounts(true);
        const accountResponse = await financialAccountApi.list();
        setAccounts(Array.isArray(accountResponse.data) ? accountResponse.data : []);

        setSelectedAccountId((currentAccountId) => currentAccountId ?? accountResponse.data[0]?.id ?? null);
      } catch (error) {
        Alert.alert("Không tải được ví", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
      } finally {
        setIsLoadingAccounts(false);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      try {
        await loadCategories();
      } catch (error) {
        Alert.alert("Không tải được danh mục", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
      } finally {
        setIsLoadingCategories(false);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadCategories]);

  async function handleCreateCategory() {
    if (isCreatingCategoryRef.current) return;
    const trimmedName = normalizeCategoryName(newCategoryName);

    if (!trimmedName) {
      setCategoryNameError("Vui lòng nhập tên danh mục.");
      return;
    }

    isCreatingCategoryRef.current = true;
    setIsCreatingCategory(true);
    try {
      let categoriesForCheck = categories;
      try {
        categoriesForCheck = await loadCategories(false);
      } catch {
        // The backend remains the source of truth if a preflight list refresh fails.
      }

      if (hasCategoryName(categoriesForCheck, trimmedName)) {
        setCategoryNameError("Tên danh mục đã tồn tại.");
        return;
      }
      setCategoryNameError("");
      await categoriesApi.create({
        icon: getCategoryIconKey({ name: trimmedName, type: categoryType }),
        isDefault: false,
        name: trimmedName,
        type: newCategoryType,
      });
      const nextCategories = await loadCategories(false);
      const createdCategory = [...nextCategories]
        .reverse()
        .find(
          (category) =>
            category.name.trim().toLowerCase() === trimmedName.toLowerCase() && category.type === newCategoryType,
        );

      if (createdCategory) {
        setSelectedCategoryId(createdCategory.id);
      }

      setNewCategoryName("");
      setNewCategoryType("Expense");
      setIsCreateCategoryVisible(false);
    } catch (error) {
      setCategoryNameError(getCategoryCreateErrorMessage(error));
    } finally {
      isCreatingCategoryRef.current = false;
      setIsCreatingCategory(false);
      setIsLoadingCategories(false);
    }
  }

  function confirmDeleteCategory(category: Category) {
    if (category.isDefault || category.userId === null || deletingCategoryId !== null) return;
    Alert.alert("Xóa danh mục?", `Danh mục “${category.name}” sẽ bị xóa.`, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingCategoryId(category.id);
            await categoriesApi.delete(category.id);
            const nextCategories = await loadCategories(false);
            if (!nextCategories.some((item) => item.id === category.id) && selectedCategoryId === category.id) {
              setSelectedCategoryId(null);
            }
          } catch {
            Alert.alert("Xóa danh mục thất bại", "Vui lòng thử lại sau.");
          } finally {
            setDeletingCategoryId(null);
          }
        },
      },
    ]);
  }

  function openAmountEditor() {
    setAmountInput(String(editableDraft.amount ?? ""));
    setIsAmountEditorVisible(true);
  }

  function openTextFieldEditor(field: EditableTextField) {
    setTextFieldInput(editableDraft[field]);
    setActiveTextFieldEditor(field);
  }

  function saveTextFieldEditor() {
    if (!activeTextFieldEditor) return;
    setEditableDraft((currentDraft) => ({ ...currentDraft, [activeTextFieldEditor]: textFieldInput }));
    setActiveTextFieldEditor(null);
  }

  function handleSaveAmount() {
    const nextAmount = parseOptionalNumber(amountInput);

    if (nextAmount === null) {
      Alert.alert("Số tiền không hợp lệ", "Vui lòng nhập số tiền hợp lệ.");
      return;
    }

    setEditableDraft((currentDraft) => ({ ...currentDraft, amount: nextAmount }));
    setIsAmountEditorVisible(false);
  }

  function handlePickDate(event: DateTimePickerEvent, pickedDate?: Date) {
    if (Platform.OS === "android") {
      setIsDatePickerVisible(false);
    }

    if (event.type === "dismissed" || !pickedDate) {
      return;
    }

    if (isBillEditorVisible) {
      setBillEditDraft((currentDraft) => ({ ...currentDraft, transactionDate: mergePickedDate(currentDraft.transactionDate, pickedDate) }));
    } else {
      setEditableDraft((currentDraft) => ({ ...currentDraft, transactionDate: mergePickedDate(currentDraft.transactionDate, pickedDate) }));
    }
  }

  function openBillEditor() {
    setBillEditDraft({
      ...editableDraft,
      items: (editableDraft.items ?? []).map((item) => ({ ...item })),
    });
    setIsBillEditorVisible(true);
  }

  function updateBillItem(index: number, patch: TransactionDraftItem) {
    setBillEditDraft((currentDraft) => ({
      ...currentDraft,
      items: (currentDraft.items ?? []).map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const updated = { ...item, ...patch };
        if ("quantity" in patch || "unitPrice" in patch) {
          updated.amount = (updated.quantity ?? 0) * (updated.unitPrice ?? 0);
        }
        return updated;
      }),
    }));
  }

  function addBillEditItem() {
    setBillEditDraft((currentDraft) => ({ ...currentDraft, items: [...currentDraft.items, { name: "", quantity: 1, unitPrice: 0, amount: 0 }] }));
  }

  function removeBillEditItem(index: number) {
    setBillEditDraft((currentDraft) => ({ ...currentDraft, items: currentDraft.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function handleSaveBillEdit() {
    const itemsTotal = billEditDraft.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    setEditableDraft({
      ...billEditDraft,
      items: (billEditDraft.items ?? []).map((item) => ({ ...item })),
      itemsTotal,
      difference: billEditDraft.amount === null ? null : billEditDraft.amount - itemsTotal,
    });
    setIsBillEditorVisible(false);
  }

  function addBillItem() {
    const nextItems = [...items.map((item) => ({ ...item })), { name: "", quantity: 1, unitPrice: null, amount: null }];
    setBillEditDraft({ ...editableDraft, items: nextItems });
    setIsBillEditorVisible(true);
  }

  function removeBillItem(index: number) {
    Alert.alert("Xóa sản phẩm?", "Sản phẩm này sẽ bị xóa khỏi chi tiết hóa đơn.", [
      { text: "Hủy", style: "cancel" },
      { text: "Xóa", style: "destructive", onPress: () => setEditableDraft((currentDraft) => {
        const nextItems = currentDraft.items.filter((_, itemIndex) => itemIndex !== index);
        const nextTotal = nextItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);
        return { ...currentDraft, items: nextItems, itemsTotal: nextTotal, difference: (currentDraft.amount ?? 0) - nextTotal };
      }) },
    ]);
  }

  async function handleSave() {
    if (selectedAccountId === null) {
      Alert.alert("Chưa chọn ví", "Vui lòng chọn ví để lưu giao dịch.");
      return;
    }

    if (selectedCategoryId === null) {
      Alert.alert("Chưa chọn danh mục", "Vui lòng chọn danh mục để lưu giao dịch.");
      return;
    }

    if (typeof editableDraft.amount !== "number" || !Number.isFinite(editableDraft.amount)) {
      Alert.alert("Thiếu số tiền", "Không thể lưu giao dịch khi chưa nhận diện được số tiền.");
      return;
    }

    try {
      setIsSaving(true);
      const response = await transactionsApi.createFromScan(
        buildCreateTransactionFromScanPayload(
          {
            ...draft,
            amount: editableDraft.amount,
            categoryId: selectedCategoryId,
            description: editableDraft.description,
            difference: editableDraft.difference,
            items: editableDraft.items,
            itemsTotal: editableDraft.itemsTotal,
            location: editableDraft.location,
            transactionDate: editableDraft.transactionDate,
            type: editableDraft.type,
          },
          selectedAccountId,
        ),
      );
      invalidateAIAnalysis();
      await presentTransactionNotifications(response.data);
      Alert.alert("Đã lưu giao dịch", "Giao dịch từ hóa đơn đã được lưu.", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      Alert.alert("Lưu giao dịch thất bại", error instanceof Error ? error.message : "Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScreenTransition style={styles.screen} triggerKey="transaction-draft-review">
      <View style={styles.header}>
        <Pressable onPress={onRetake} hitSlop={12}>
          <Text style={styles.headerAction}>Quét lại</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Kiểm tra giao dịch</Text>
        <Pressable style={styles.editIconButton} onPress={openBillEditor} hitSlop={12}>
          <SymbolView
            name={{ ios: "pencil", android: "edit", web: "edit" }}
            size={22}
            tintColor={theme.text}
            fallback={<Text style={styles.editIconFallback}>✎</Text>}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryGrid}>
          <Pressable
            style={[styles.summaryTile, styles.summaryWalletTile]}
            onPress={() => setIsAccountPickerVisible(true)}
          >
            <View style={styles.summaryTileLabelRow}>
              <SymbolView name="creditcard" size={17} tintColor={theme.textMuted} />
              <Text style={styles.summaryTileValue} numberOfLines={1}>
                {selectedAccount?.name ?? (isLoadingAccounts ? "Đang tải..." : "Chọn ví")}
              </Text>
            </View>
            <Text style={styles.walletBalanceText} numberOfLines={1}>
              {selectedAccount ? formatAmount(getAccountCurrentBalance(selectedAccount)) : "Bấm để chọn"}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.summaryTile, styles.summaryCategoryTile]}
            onPress={() => setIsCategoryPickerVisible(true)}
          >
            <View style={styles.summaryTileLabelRow}>
              <CategoryIcon icon={selectedCategory?.icon} name={selectedCategory?.name} type={categoryType} size={17} />
              <Text style={styles.summaryTileLabel}>Danh mục</Text>
            </View>
            <Text style={styles.summaryTileValue} numberOfLines={1}>
              {selectedCategory?.name ?? (selectedCategoryId === null ? "Chưa phân loại" : "Chọn danh mục")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isReviewInfoExpanded }}
            onPress={() => setIsReviewInfoExpanded((expanded) => !expanded)}
            style={styles.reviewInfoToggle}
          >
            <Text style={styles.editorSectionTitle}>Thông tin giao dịch</Text>
            <SymbolView name={isReviewInfoExpanded ? "chevron.up" : "chevron.down"} size={17} tintColor={theme.textMuted} />
          </Pressable>
          <View style={styles.inlineGrid}>
            <Pressable style={styles.inlineTile} onPress={openAmountEditor}>
              <View style={styles.inlineTileLabelRow}>
                <SymbolView name="dollarsign.circle" size={17} tintColor={theme.textMuted} />
                <Text style={styles.inlineTileLabel}>Tổng tiền</Text>
              </View>
              <Text style={styles.inlineTileValue} numberOfLines={1}>
                {formatAmount(editableDraft.amount)}
              </Text>
            </Pressable>
            <Pressable style={styles.inlineTile} onPress={() => setIsDatePickerVisible(true)}>
              <View style={styles.inlineTileLabelRow}>
                <SymbolView name="calendar" size={17} tintColor={theme.textMuted} />
                <Text style={styles.inlineTileLabel}>Ngày giao dịch</Text>
              </View>
              <Text style={styles.inlineTileValue} numberOfLines={2}>
                {formatDate(editableDraft.transactionDate)}
              </Text>
            </Pressable>
          </View>
          {isReviewInfoExpanded ? <>
            <View style={styles.inlineGrid}>
              <Pressable style={styles.inlineTile} onPress={() => setIsTypePickerVisible(true)}>
                <View style={styles.inlineTileLabelRow}>
                  <SymbolView name="tag" size={17} tintColor={theme.textMuted} />
                  <Text style={styles.inlineTileLabel}>Loại giao dịch</Text>
                </View>
                <Text style={styles.inlineTileValue} numberOfLines={1}>{getTransactionTypeLabel(editableDraft.type)}</Text>
              </Pressable>
              <Pressable style={styles.inlineTile} onPress={() => openTextFieldEditor("location")}>
                <View style={styles.inlineTileLabelRow}>
                  <SymbolView name="mappin.and.ellipse" size={17} tintColor={theme.textMuted} />
                  <Text style={styles.inlineTileLabel}>Địa điểm</Text>
                </View>
                <Text style={styles.inlineTileValue} numberOfLines={2}>{formatText(editableDraft.location)}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.fieldRow} onPress={() => openTextFieldEditor("description")}>
              <Text style={styles.fieldLabel}>Mô tả</Text>
              <Text style={styles.fieldValue}>{formatText(editableDraft.description)}</Text>
            </Pressable>
          </> : null}
        </View>

        {
          <View style={styles.card}>
            <View style={styles.itemsHeader}>
              <View>
                <Text style={styles.itemsTitle}>Chi tiết hóa đơn</Text>
                <Text style={styles.itemsCount}>{items.length} sản phẩm</Text>
              </View>
              <Pressable style={styles.addItemButton} onPress={addBillItem}>
                <Text style={styles.addItemButtonText}>＋ Thêm sản phẩm</Text>
              </Pressable>
            </View>

            {items.length === 0 ? <Text style={styles.emptyItemsText}>Chưa nhận diện được sản phẩm. Bạn có thể thêm thủ công.</Text> : null}
            {items.map((item, index) => (
              <View key={`${item.name ?? "item"}-${index}`} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>{formatText(item.name)}</Text>
                  <Text style={styles.itemMeta}>{formatAmount(item.unitPrice)}  ·  {formatText(item.quantity)} sản phẩm</Text>
                </View>
                <Text style={styles.itemAmount}>{formatAmount(item.amount)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${item.name ?? "sản phẩm"}`} style={[styles.itemActionButton, styles.deleteItemButton]} onPress={() => removeBillItem(index)}>
                  <SymbolView name={{ ios: "trash", android: "delete", web: "delete" }} size={18} tintColor={theme.dangerText} fallback={<Text>⌫</Text>} />
                </Pressable>
              </View>
            ))}
          </View>
        }

        {items.length > 0 ? <View style={styles.card}>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Tạm tính ({items.length} sản phẩm)</Text><Text style={styles.totalValue}>{formatAmount(displayedItemsTotal)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Giảm giá</Text><Text style={styles.totalValue}>0 ₫</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Thuế / Phí (nếu có)</Text><Text style={styles.totalValue}>0 ₫</Text></View>
          <View style={styles.grandTotalRow}><Text style={styles.grandTotalLabel}>Tổng cộng</Text><Text style={styles.grandTotalValue}>{formatAmount(editableDraft.amount)}</Text></View>
        </View> : null}
        {items.length > 0 ? <View style={styles.differenceCard}>
          <Text style={styles.differenceTitle}>Chênh lệch so với hóa đơn</Text>
          <Text style={[styles.differenceValue, displayedDifference !== 0 && styles.differenceWarning]}>{formatAmount(displayedDifference)}</Text>
          <Text style={styles.differenceHint}>{displayedDifference === 0 ? "Tổng tiền khớp với hóa đơn" : "Vui lòng kiểm tra lại chi tiết hóa đơn"}</Text>
        </View> : null}

        {draft.rawText ? (
          <View style={styles.card}>
            <Text style={styles.rawTitle}>Nội dung nhận diện</Text>
            <Text style={styles.rawText}>{draft.rawText}</Text>
          </View>
        ) : null}
      </ScrollView>

      <BottomPopup
        animationType="fade"
        transparent
        visible={activeTextFieldEditor !== null}
        onRequestClose={() => setActiveTextFieldEditor(null)}
      >
        <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", default: undefined })} style={styles.keyboardModalOverlay}>
          <Pressable style={styles.amountModalDismissArea} onPress={() => setActiveTextFieldEditor(null)}>
            <BottomPopupPressable style={styles.smallBottomSheet} onPress={(event) => event.stopPropagation()}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{activeTextFieldEditor === "location" ? "Sửa địa điểm" : "Sửa mô tả"}</Text>
                <Pressable onPress={() => setActiveTextFieldEditor(null)} hitSlop={12}><Text style={styles.sheetClose}>Đóng</Text></Pressable>
              </View>
              <TextInput
                autoFocus
                multiline
                placeholder={activeTextFieldEditor === "location" ? "Nhập địa điểm" : "Nhập mô tả"}
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.textFieldEditorInput}
                value={textFieldInput}
                onChangeText={setTextFieldInput}
              />
              <View style={styles.createCategoryActions}>
                <Pressable style={styles.cancelCategoryButton} onPress={() => setActiveTextFieldEditor(null)}><Text style={styles.cancelCategoryButtonText}>Hủy</Text></Pressable>
                <Pressable style={styles.createCategoryButton} onPress={saveTextFieldEditor}><Text style={styles.createCategoryButtonText}>Lưu</Text></Pressable>
              </View>
            </BottomPopupPressable>
          </Pressable>
        </KeyboardAvoidingView>
      </BottomPopup>

      <BottomPopup
        animationType="fade"
        transparent
        visible={isAccountPickerVisible}
        onRequestClose={() => setIsAccountPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsAccountPickerVisible(false)}>
          <BottomPopupPressable style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Chọn ví</Text>
              <Pressable onPress={() => setIsAccountPickerVisible(false)} hitSlop={12}>
                <Text style={styles.sheetClose}>Đóng</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
              {accounts.length === 0 && !isLoadingAccounts ? (
                <Text style={styles.emptyAccountText}>Bạn cần tạo ví trước khi lưu giao dịch.</Text>
              ) : (
                (accounts ?? []).map((account) => {
                  const isSelected = account.id === selectedAccountId;

                  return (
                    <Pressable
                      key={account.id}
                      style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                      onPress={() => {
                        setSelectedAccountId(account.id);
                        setIsAccountPickerVisible(false);
                      }}
                    >
                      <View style={styles.accountDot}>
                        {isSelected ? <View style={styles.accountDotInner} /> : null}
                      </View>
                      <View style={styles.accountInfo}>
                        <Text style={styles.accountName}>{account.name}</Text>
                        <Text style={styles.accountMeta}>
                          {account.type} · {formatAmount(getAccountCurrentBalance(account))}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </BottomPopupPressable>
        </Pressable>
      </BottomPopup>

      {isDatePickerVisible && Platform.OS === "android" ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={getDatePickerValue(isBillEditorVisible ? billEditDraft.transactionDate : editableDraft.transactionDate)}
          onChange={handlePickDate}
        />
      ) : null}

      <BottomPopup
        animationType="fade"
        transparent
        visible={isDatePickerVisible && Platform.OS !== "android"}
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsDatePickerVisible(false)}>
          <BottomPopupPressable style={styles.smallBottomSheet}>
            <View style={styles.datePickerHeader}>
              <Pressable onPress={() => setIsDatePickerVisible(false)} hitSlop={10}>
                <Text style={[styles.datePickerAction, { color: theme.textSubtle }]}>Hủy</Text>
              </Pressable>
              <Text style={[styles.sheetTitle, styles.datePickerTitle]}>Sửa ngày giao dịch</Text>
              <Pressable onPress={() => setIsDatePickerVisible(false)} hitSlop={10}>
                <Text style={[styles.datePickerAction, { color: theme.primary }]}>Xong</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              value={getDatePickerValue(isBillEditorVisible ? billEditDraft.transactionDate : editableDraft.transactionDate)}
              onChange={handlePickDate}
              accentColor={theme.primary}
              textColor={theme.text}
              themeVariant={themeMode}
              style={styles.datePicker}
            />
          </BottomPopupPressable>
        </Pressable>
      </BottomPopup>

      <BottomPopup
        animationType="fade"
        transparent
        visible={isAmountEditorVisible}
        onRequestClose={() => setIsAmountEditorVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: "padding", default: undefined })}
          style={styles.keyboardModalOverlay}
        >
          <Pressable style={styles.amountModalDismissArea} onPress={() => setIsAmountEditorVisible(false)}>
            <BottomPopupPressable style={styles.smallBottomSheet} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.sheetTitle}>Sửa tổng tiền</Text>
              <TextInput
                autoFocus
                keyboardType="decimal-pad"
                placeholder="Tổng tiền"
                placeholderTextColor={theme.inputPlaceholder}
                returnKeyType="done"
                style={styles.categoryInput}
                value={amountInput}
                onChangeText={setAmountInput}
                onSubmitEditing={Keyboard.dismiss}
              />
              <View style={styles.createCategoryActions}>
                <Pressable style={styles.cancelCategoryButton} onPress={() => setIsAmountEditorVisible(false)}>
                  <Text style={styles.cancelCategoryButtonText}>Hủy</Text>
                </Pressable>
                <Pressable style={styles.cancelCategoryButton} onPress={Keyboard.dismiss}>
                  <Text style={styles.cancelCategoryButtonText}>Xong</Text>
                </Pressable>
                <Pressable style={styles.createCategoryButton} onPress={handleSaveAmount}>
                  <Text style={styles.createCategoryButtonText}>Lưu</Text>
                </Pressable>
              </View>
            </BottomPopupPressable>
          </Pressable>
        </KeyboardAvoidingView>
      </BottomPopup>

      <BottomPopup
        animationType="fade"
        transparent
        visible={isTypePickerVisible}
        onRequestClose={() => setIsTypePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsTypePickerVisible(false)}>
          <BottomPopupPressable style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Chọn loại giao dịch</Text>
              <Pressable onPress={() => setIsTypePickerVisible(false)} hitSlop={12}>
                <Text style={styles.sheetClose}>Đóng</Text>
              </Pressable>
            </View>
            <View style={styles.sheetListContent}>
              {transactionTypes.map((transactionType) => {
                const isSelected = (isBillEditorVisible ? billEditDraft.type : editableDraft.type) === transactionType.value;

                return (
                  <Pressable
                    key={transactionType.value}
                    style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                    onPress={() => {
                      setEditableDraft((currentDraft) => ({ ...currentDraft, type: transactionType.value }));
                      setBillEditDraft((currentDraft) => ({ ...currentDraft, type: transactionType.value }));
                      setSelectedCategoryId(null);
                      setIsTypePickerVisible(false);
                    }}
                  >
                    <Text style={styles.categoryOptionText}>{transactionType.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </BottomPopupPressable>
        </Pressable>
      </BottomPopup>

      <BottomPopup
        animationType="fade"
        transparent
        visible={isCategoryPickerVisible}
        onRequestClose={() => setIsCategoryPickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            if (!isCreateCategoryVisible) {
              setIsCategoryPickerVisible(false);
            }
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: "padding", android: "height" })}
            style={styles.modalOverlay}
          >
          <BottomPopupPressable style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Chọn category</Text>
              <View style={styles.sheetActions}>
                <Pressable
                  onPress={() => {
                    setNewCategoryType(categoryType);
                    setIsCreateCategoryVisible(true);
                  }}
                  hitSlop={12}
                >
                  <Text style={styles.sheetAdd}>+</Text>
                </Pressable>
                <Pressable onPress={() => setIsCategoryPickerVisible(false)} hitSlop={12}>
                  <Text style={styles.sheetClose}>Đóng</Text>
                </Pressable>
              </View>
            </View>

            {isLoadingCategories ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : (
              <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
                {categoryOptions.map((category) => {
                  const isSelected = category.id === selectedCategoryId;

                  return (
                    <Pressable
                      key={category.id}
                      onLongPress={() => confirmDeleteCategory(category)}
                      style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                      onPress={() => {
                        setSelectedCategoryId(category.id);
                        setIsCategoryPickerVisible(false);
                      }}
                    >
                      <CategoryIconBadge {...category} />
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryName}>{category.name}</Text>
                        <Text style={styles.categoryMeta}>
                          {category.type === "Expense" ? "Chi tiêu" : "Thu nhập"} ·{" "}
                          {category.isDefault ? "Mặc định" : "Nhấn giữ để xóa"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {isCreateCategoryVisible ? (
              <View style={styles.inlineCreateOverlay}>
                <Pressable style={styles.inlineCreateDismissArea} onPress={Keyboard.dismiss}>
                  <Pressable style={styles.createCategoryModal} onPress={(event) => event.stopPropagation()}>
                    <Text style={styles.createCategoryTitle}>Thêm danh mục</Text>
                    <TextInput
                      placeholder="Tên category"
                      placeholderTextColor={theme.inputPlaceholder}
                      style={styles.categoryInput}
                      value={newCategoryName}
                      onChangeText={(value) => { setNewCategoryName(value); setCategoryNameError(""); }}
                    />
                    {categoryNameError ? <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13 }}>{categoryNameError}</Text> : null}
                    <View style={styles.categoryTypeRow}>
                      {(["Expense", "Income"] as CategoryType[]).map((categoryType) => {
                        const isSelected = newCategoryType === categoryType;

                        return (
                          <Pressable
                            key={categoryType}
                            style={[styles.categoryTypeOption, isSelected && styles.categoryTypeOptionSelected]}
                            onPress={() => setNewCategoryType(categoryType)}
                            disabled={isCreatingCategory}
                          >
                            <Text
                              style={[
                                styles.categoryTypeOptionText,
                                isSelected && styles.categoryTypeOptionTextSelected,
                              ]}
                            >
                              {categoryType === "Expense" ? "Chi tiêu" : "Thu nhập"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={styles.createCategoryActions}>
                      <Pressable
                        style={styles.cancelCategoryButton}
                        onPress={() => setIsCreateCategoryVisible(false)}
                        disabled={isCreatingCategory}
                      >
                        <Text style={styles.cancelCategoryButtonText}>Hủy</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.createCategoryButton, isCreatingCategory && styles.buttonDisabled]}
                        onPress={handleCreateCategory}
                        disabled={isCreatingCategory}
                      >
                        {isCreatingCategory ? (
                          <ActivityIndicator color={theme.textInverse} />
                        ) : (
                          <Text style={styles.createCategoryButtonText}>Thêm</Text>
                        )}
                      </Pressable>
                    </View>
                  </Pressable>
                </Pressable>
              </View>
            ) : null}
          </BottomPopupPressable>
          </KeyboardAvoidingView>
        </Pressable>
      </BottomPopup>

      <Modal animationType="slide" visible={isBillEditorVisible} onRequestClose={() => setIsBillEditorVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: "padding", android: "height" })}
          style={styles.editorScreen}
        >
          <View style={styles.header}>
            <Pressable onPress={() => setIsBillEditorVisible(false)} hitSlop={12}>
              <Text style={styles.headerAction}>Không lưu</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Sửa bill</Text>
            <Pressable onPress={handleSaveBillEdit} hitSlop={12}>
              <Text style={styles.headerAction}>Lưu sửa</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
            <View style={styles.editorCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isTransactionInfoExpanded }}
                onPress={() => setIsTransactionInfoExpanded((expanded) => !expanded)}
                style={styles.collapseSectionHeader}
              >
                <Text style={styles.editorSectionTitle}>Thông tin giao dịch</Text>
                <SymbolView name={isTransactionInfoExpanded ? "chevron.up" : "chevron.down"} size={17} tintColor={theme.textMuted} />
              </Pressable>
              {isTransactionInfoExpanded ? <View style={styles.editorGrid}>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>Tổng tiền</Text>
                  <TextInput keyboardType="decimal-pad" placeholder="Tổng tiền" placeholderTextColor={theme.inputPlaceholder} style={[styles.categoryInput, styles.editorCompactInput]} value={String(billEditDraft.amount ?? "")} onChangeText={(value) => setBillEditDraft((currentDraft) => ({ ...currentDraft, amount: parseOptionalNumber(value) }))} />
                </View>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>Loại giao dịch</Text>
                  <Pressable style={styles.editorSelect} onPress={() => setIsTypePickerVisible(true)}><Text style={styles.editorSelectText}>{getTransactionTypeLabel(billEditDraft.type)}</Text><Text style={styles.editorChevron}>⌄</Text></Pressable>
                </View>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>Ví</Text>
                  <Pressable style={styles.editorSelect} onPress={() => setIsAccountPickerVisible(true)}><Text numberOfLines={1} style={styles.editorSelectText}>{selectedAccount?.name ?? "Chọn ví"}</Text><Text style={styles.editorChevron}>⌄</Text></Pressable>
                </View>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>Danh mục</Text>
                  <Pressable style={styles.editorSelect} onPress={() => setIsCategoryPickerVisible(true)}><Text numberOfLines={1} style={styles.editorSelectText}>{selectedCategory?.name ?? "Chọn danh mục"}</Text><Text style={styles.editorChevron}>⌄</Text></Pressable>
                </View>
                <View style={[styles.editorField, styles.editorWideField]}>
                  <Text style={styles.editorLabel}>Ngày giao dịch</Text>
                  <Pressable style={styles.editorDateInput} onPress={() => setIsDatePickerVisible(true)}>
                    <Text numberOfLines={2} style={styles.editorDateText}>{formatDate(billEditDraft.transactionDate)}</Text>
                    <SymbolView name="calendar" size={18} tintColor={theme.textMuted} />
                  </Pressable>
                </View>
                <View style={[styles.editorField, styles.editorWideField]}>
                  <Text style={styles.editorLabel}>Địa điểm</Text>
                  <TextInput multiline placeholder="Địa điểm" placeholderTextColor={theme.inputPlaceholder} style={[styles.categoryInput, styles.editorLocationInput]} value={billEditDraft.location} onChangeText={(value) => setBillEditDraft((currentDraft) => ({ ...currentDraft, location: value }))} />
                </View>
                <View style={[styles.editorField, styles.editorDescriptionField]}>
                  <Text style={styles.editorLabel}>Mô tả</Text>
                  <TextInput multiline placeholder="Mô tả" placeholderTextColor={theme.inputPlaceholder} style={[styles.categoryInput, styles.editorDescriptionInput]} value={billEditDraft.description} onChangeText={(value) => setBillEditDraft((currentDraft) => ({ ...currentDraft, description: value }))} />
                </View>
              </View> : null}
            </View>

            <View style={styles.editorCard}>
              <View style={styles.editorSectionHeader}>
                <Text style={styles.editorSectionTitle}>Danh sách sản phẩm ({billEditDraft.items.length})</Text>
                <Pressable style={styles.addItemButton} onPress={addBillEditItem}><Text style={styles.addItemButtonText}>＋ Thêm sản phẩm</Text></Pressable>
              </View>
              {billEditDraft.items.length === 0 ? (
                <Text style={styles.emptyAccountText}>Không có chi tiết hóa đơn.</Text>
              ) : (
                (billEditDraft.items ?? []).map((item, index) => (
                  <View key={`bill-product-${index}`} style={styles.productEditCard}>
                    <Text style={styles.editorLabel}>Sản phẩm</Text>
                    <TextInput multiline placeholder="Tên sản phẩm" placeholderTextColor={theme.inputPlaceholder} style={[styles.categoryInput, styles.productNameInput]} value={item.name ?? ""} onChangeText={(value) => updateBillItem(index, { name: value })} />
                    <View style={styles.productFieldsRow}>
                      <View style={styles.productField}>
                        <Text style={styles.editorLabel}>Số lượng</Text>
                        <View style={styles.quantityStepper}>
                          <Pressable style={styles.stepperButton} onPress={() => updateBillItem(index, { quantity: Math.max(0, (item.quantity ?? 0) - 1) })}><Text style={styles.stepperText}>−</Text></Pressable>
                          <TextInput keyboardType="number-pad" style={styles.quantityInput} value={item.quantity == null ? "" : String(item.quantity)} onChangeText={(value) => updateBillItem(index, { quantity: parseOptionalNumber(value) })} />
                          <Pressable style={styles.stepperButton} onPress={() => updateBillItem(index, { quantity: (item.quantity ?? 0) + 1 })}><Text style={styles.stepperText}>＋</Text></Pressable>
                        </View>
                      </View>
                      <View style={styles.productField}>
                        <Text style={styles.editorLabel}>Đơn giá (₫)</Text>
                        <TextInput keyboardType="decimal-pad" placeholder="Đơn giá" placeholderTextColor={theme.inputPlaceholder} style={styles.categoryInput} value={item.unitPrice == null ? "" : String(item.unitPrice)} onChangeText={(value) => updateBillItem(index, { unitPrice: parseOptionalNumber(value) })} />
                      </View>
                    </View>
                    <View style={styles.productAmountRow}>
                      <View style={styles.productAmountInfo}><Text style={styles.editorLabel}>Thành tiền</Text><Text style={styles.productAmountValue}>{formatAmount(item.amount)}</Text></View>
                      <Pressable accessibilityRole="button" accessibilityLabel="Xóa sản phẩm" style={[styles.itemActionButton, styles.deleteItemButton]} onPress={() => removeBillEditItem(index)}><SymbolView name={{ ios: "trash", android: "delete", web: "delete" }} size={18} tintColor={theme.dangerText} /></Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
            <View style={styles.editorCard}>
              <Text style={styles.editorSectionTitle}>Tổng kết</Text>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Tạm tính ({billEditDraft.items.length} sản phẩm)</Text><Text style={styles.totalValue}>{formatAmount(editorSubtotal)}</Text></View>
              <View style={styles.editorSummaryField}><Text style={styles.totalLabel}>Giảm giá</Text><Text style={styles.summaryAmountValue}>0 ₫</Text></View>
              <View style={styles.editorSummaryField}><Text style={styles.totalLabel}>Thuế / Phí (nếu có)</Text><Text style={styles.summaryAmountValue}>0 ₫</Text></View>
              <View style={styles.grandTotalRow}><Text style={styles.grandTotalLabel}>Tổng cộng</Text><Text style={styles.grandTotalValue}>{formatAmount(billEditDraft.amount)}</Text></View>
            </View>
            <View style={styles.differenceCard}><Text style={styles.differenceTitle}>Chênh lệch so với hóa đơn</Text><Text style={styles.differenceValue}>{formatAmount(editorDifference)}</Text><Text style={styles.differenceHint}>{editorDifference === 0 ? "Tổng tiền khớp với hóa đơn" : "Vui lòng kiểm tra lại chi tiết hóa đơn"}</Text></View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.footer}>
        <Pressable style={styles.secondaryButton} onPress={onRetake}>
          <Text style={styles.secondaryButtonText}>Chụp lại</Text>
        </Pressable>
        <Pressable
          style={[
            styles.primaryButton,
            (isSaving || selectedAccountId === null || accounts.length === 0) && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={isSaving || selectedAccountId === null || accounts.length === 0}
        >
          {isSaving ? (
            <ActivityIndicator color={theme.textInverse} />
          ) : (
            <Text style={styles.primaryButtonText}>Lưu</Text>
          )}
        </Pressable>
      </View>
    </ScreenTransition>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.screen, flex: 1 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingTop: 56,
      paddingBottom: 14,
    },
    headerAction: { color: theme.primary, fontSize: 17, fontWeight: '600' },
    headerTitle: { ...Typography.title, color: theme.text },
    editIconButton: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    editIconFallback: { color: theme.text, fontSize: 20, fontWeight: '600' },
    headerSpacer: { width: 58 },
    content: { gap: 14, padding: 20, paddingBottom: 130 },
    summaryGrid: { flexDirection: "row", gap: 12 },
    summaryTile: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      minHeight: 104,
      padding: 14,
    },
    summaryWalletTile: { flex: 1.35 },
    summaryCategoryTile: { flex: 0.85 },
    summaryTileLabel: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    summaryTileLabelRow: { alignItems: "center", flexDirection: "row", gap: 6, marginBottom: 10 },
    summaryTileValue: { color: theme.text, fontSize: 17, fontWeight: '600' },
    summaryTileMeta: { color: theme.primary, fontSize: 13, fontWeight: '600', marginTop: 8 },
    walletBalanceText: { color: theme.primary, fontSize: 17, fontWeight: '600', marginTop: 10 },
    card: { backgroundColor: theme.card, borderRadius: 8, overflow: "hidden" },
    reviewInfoToggle: { alignItems: "center", borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 44, paddingHorizontal: 16 },
    inlineGrid: { flexDirection: "row", gap: 1 },
    inlineTile: {
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flex: 1,
      gap: 7,
      minHeight: 74,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    inlineTileLabelRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    inlineTileLabel: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    inlineTileValue: { color: theme.text, fontSize: 16, fontWeight: '600', lineHeight: 21 },
    fieldRow: {
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    fieldLabel: { ...Typography.label, color: theme.textMuted },
    fieldValue: { color: theme.text, fontSize: 16, fontWeight: '600' },
    categoryHeaderRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    aiHint: { color: theme.primary, fontSize: 12, fontWeight: '600' },
    categoryGrid: { gap: 10, paddingTop: 8 },
    categoryInput: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      fontSize: 15,
      minHeight: 46,
      paddingHorizontal: 12,
    },
    categoryTypeRow: { flexDirection: "row", gap: 8 },
    categoryTypeOption: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      minHeight: 42,
      justifyContent: "center",
    },
    categoryTypeOptionSelected: { backgroundColor: theme.primaryPressed, borderColor: theme.primary },
    categoryTypeOptionText: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
    categoryTypeOptionTextSelected: { color: theme.text },
    createCategoryButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      flex: 1,
      minHeight: 46,
      justifyContent: "center",
    },
    createCategoryButtonText: { color: theme.textInverse, fontSize: 15, fontWeight: '600' },
    categoryOption: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 58,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    categoryOptionSelected: { backgroundColor: theme.primaryPressed, borderColor: theme.primary },
    categoryOptionText: { color: theme.text, flex: 1, fontSize: 15, fontWeight: '600' },
    categoryInfo: { flex: 1, gap: 3 },
    categoryName: { color: theme.text, fontSize: 16, fontWeight: '600' },
    categoryMeta: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    rawTitle: { color: theme.text, fontSize: 16, fontWeight: '600', paddingHorizontal: 16, paddingTop: 16 },
    rawText: { color: theme.textSoft, fontSize: 14, lineHeight: 21, padding: 16 },
    emptyAccountText: { color: theme.textMuted, fontSize: 14, lineHeight: 20, padding: 16, textAlign: "center" },
    accountRow: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    accountRowSelected: { backgroundColor: theme.primaryPressed },
    accountDot: {
      alignItems: "center",
      borderColor: theme.primary,
      borderRadius: 11,
      borderWidth: 2,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    accountDotInner: { backgroundColor: theme.primary, borderRadius: 6, height: 12, width: 12 },
    accountInfo: { flex: 1, gap: 4 },
    accountName: { color: theme.text, fontSize: 15, fontWeight: '600' },
    accountMeta: { color: theme.textMuted, fontSize: 13 },
    itemsHeader: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 16,
    },
    itemsTitle: { color: theme.text, fontSize: 16, fontWeight: '600' },
    itemsCount: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    emptyItemsText: { color: theme.textMuted, fontSize: 14, padding: 16 },
    addItemButton: { borderColor: theme.primary, borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
    addItemButtonText: { color: theme.primary, fontSize: 13, fontWeight: '600' },
    itemRow: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    itemInfo: { flex: 1, gap: 7 },
    itemName: { color: theme.text, fontSize: 15, fontWeight: '600' },
    itemMeta: { color: theme.textMuted, fontSize: 13 },
    itemAmount: { color: theme.text, fontSize: 15, fontWeight: '600' },
    itemActionButton: { alignItems: "center", backgroundColor: theme.cardAlt, borderRadius: 5, height: 40, justifyContent: "center", width: 40 },
    deleteItemButton: { backgroundColor: theme.warningBackground },
    totalRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    totalLabel: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
    totalValue: { color: theme.text, fontSize: 15, fontWeight: '600' },
    grandTotalRow: { alignItems: "center", borderTopColor: theme.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginHorizontal: 16, paddingVertical: 16 },
    grandTotalLabel: { color: theme.text, fontSize: 16, fontWeight: '700' },
    grandTotalValue: { color: theme.text, fontSize: 19, fontWeight: '700' },
    differenceCard: { backgroundColor: theme.card, borderRadius: 8, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", padding: 16 },
    differenceTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
    differenceValue: { color: theme.goodText, fontSize: 16, fontWeight: '700' },
    differenceWarning: { color: theme.dangerText },
    differenceHint: { color: theme.textMuted, fontSize: 13, marginTop: 8, width: "100%" },
    textFieldEditorInput: { backgroundColor: theme.inputBackground, borderColor: theme.border, borderRadius: 8, borderWidth: 1, color: theme.text, fontSize: 16, minHeight: 104, padding: 12, textAlignVertical: "top" },
    note: { color: theme.textSubtle, fontSize: 13, lineHeight: 19, textAlign: "center" },
    modalOverlay: {
      backgroundColor: theme.overlay,
      flex: 1,
      justifyContent: "flex-end",
    },
    keyboardModalOverlay: {
      backgroundColor: theme.overlay,
      flex: 1,
      justifyContent: "flex-end",
    },
    amountModalDismissArea: {
      flex: 1,
      justifyContent: "flex-end",
    },
    bottomSheet: {
      backgroundColor: theme.sheet,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      maxHeight: "76%",
      paddingBottom: 20,
    },
    smallBottomSheet: {
      backgroundColor: theme.sheet,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      gap: 14,
      padding: 18,
      paddingBottom: 28,
    },
    datePickerHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    datePickerTitle: { flex: 1, marginHorizontal: 12, textAlign: "center" },
    datePickerAction: { fontSize: 16, fontWeight: '600' },
    datePicker: { alignSelf: "stretch" },
    sheetHeader: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 58,
      paddingHorizontal: 18,
    },
    sheetTitle: { ...Typography.section, color: theme.text },
    sheetActions: { alignItems: "center", flexDirection: "row", gap: 18 },
    sheetAdd: { color: theme.primary, fontSize: 32, fontWeight: "600", lineHeight: 34 },
    sheetClose: { color: theme.primary, fontSize: 15, fontWeight: '600' },
    sheetList: { maxHeight: 460 },
    sheetListContent: { gap: 10, padding: 16 },
    sheetLoading: { alignItems: "center", minHeight: 180, justifyContent: "center" },
    pickerRow: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 62,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    pickerRowSelected: { backgroundColor: theme.primaryPressed, borderColor: theme.primary },
    inlineCreateOverlay: {
      alignItems: "center",
      backgroundColor: theme.overlayStrong,
      bottom: 0,
      justifyContent: "center",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    inlineCreateDismissArea: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 24,
      width: "100%",
    },
    createCategoryModal: {
      backgroundColor: theme.sheet,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 14,
      padding: 18,
      width: "100%",
    },
    createCategoryTitle: { ...Typography.section, color: theme.text },
    createCategoryActions: { flexDirection: "row", gap: 10 },
    cancelCategoryButton: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 8,
      flex: 1,
      justifyContent: "center",
      minHeight: 46,
    },
    cancelCategoryButtonText: { color: theme.text, fontSize: 15, fontWeight: '600' },
    editorScreen: { backgroundColor: theme.screen, flex: 1 },
    editorContent: { gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 30 },
    editorCard: { backgroundColor: theme.card, borderRadius: 8, gap: 9, padding: 12 },
    editorSectionTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
    collapseSectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 32 },
    editorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    editorField: { gap: 4, width: "48%" },
    editorWideField: { width: "100%" },
    editorDescriptionField: { width: "100%" },
    editorLabel: { color: theme.textMuted, fontSize: 12 },
    editorCompactInput: { minHeight: 42, paddingVertical: 8 },
    editorSelect: { alignItems: "center", backgroundColor: theme.inputBackground, borderColor: theme.border, borderRadius: 7, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 42, paddingHorizontal: 10 },
    editorSelectText: { color: theme.text, flex: 1, fontSize: 14 },
    editorChevron: { color: theme.textMuted, fontSize: 18, marginLeft: 8 },
    editorDateInput: { alignItems: "center", backgroundColor: theme.inputBackground, borderColor: theme.border, borderRadius: 7, borderWidth: 1, flexDirection: "row", gap: 10, justifyContent: "space-between", minHeight: 44, paddingHorizontal: 10, paddingVertical: 7 },
    editorDateText: { color: theme.text, flex: 1, fontSize: 14, lineHeight: 19 },
    editorLocationInput: { minHeight: 54, paddingTop: 9, textAlignVertical: "top" },
    editorDescriptionInput: { minHeight: 58, paddingTop: 9, textAlignVertical: "top" },
    editorSectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    productEditCard: { borderBottomColor: theme.borderStrong, borderBottomWidth: 1, gap: 7, paddingBottom: 14, paddingTop: 8 },
    productNameInput: { minHeight: 48, paddingTop: 10, textAlignVertical: "top", width: "100%" },
    productFieldsRow: { flexDirection: "row", gap: 10 },
    productField: { flex: 1, gap: 6, minWidth: 0 },
    quantityStepper: { alignItems: "center", backgroundColor: theme.cardAlt, borderColor: theme.border, borderRadius: 8, borderWidth: 1, flexDirection: "row", height: 46, width: "100%" },
    stepperButton: { alignItems: "center", height: 42, justifyContent: "center", width: 40 },
    stepperText: { color: theme.text, fontSize: 22, lineHeight: 26 },
    quantityInput: { backgroundColor: theme.inputBackground, color: theme.text, flex: 1, height: 42, textAlign: "center" },
    productAmountRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingTop: 3 },
    productAmountInfo: { gap: 3 },
    productAmountValue: { color: theme.text, fontSize: 15, fontWeight: '600' },
    editorSummaryField: { alignItems: "center", flexDirection: "row", gap: 14, justifyContent: "space-between", paddingHorizontal: 16 },
    summaryAmountValue: { color: theme.text, fontSize: 15, minWidth: 120, paddingHorizontal: 12, textAlign: "right" },
    footer: {
      backgroundColor: theme.screen,
      borderTopColor: theme.tabBorder,
      borderTopWidth: 1,
      bottom: 0,
      flexDirection: "row",
      gap: 12,
      left: 0,
      padding: 20,
      position: "absolute",
      right: 0,
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderRadius: 8,
      flex: 1,
      justifyContent: "center",
      minHeight: 52,
    },
    secondaryButtonText: { ...Typography.button, color: theme.text },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      flex: 1,
      justifyContent: "center",
      minHeight: 52,
    },
    primaryButtonText: { ...Typography.button, color: theme.textInverse },
    buttonDisabled: { opacity: 0.65 },
  });
}
