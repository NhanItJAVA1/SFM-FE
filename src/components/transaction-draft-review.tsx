import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
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
  Text,
  TextInput,
  View,
} from 'react-native';

import { categoriesApi, Category, CategoryType } from '@/api/categoriesApi';
import { FinancialAccount, financialAccountApi } from '@/api/financialAccountApi';
import {
  buildCreateTransactionFromScanPayload,
  TransactionDraft,
  TransactionDraftItem,
  transactionsApi,
} from '@/api/transactionsApi';
import { presentTransactionNotifications } from '@/services/transactionNotifications';

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

const transactionTypes = [
  { label: 'Chi tiêu', value: 'Expense' },
  { label: 'Thu nhập', value: 'Income' },
];

function formatAmount(amount: unknown) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return 'Chưa nhận diện';
  }

  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount);
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Chưa nhận diện';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatText(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return 'Chưa nhận diện';
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{formatText(value)}</Text>
    </View>
  );
}

function getInitialEditableDraft(draft: TransactionDraft): EditableBillDraft {
  return {
    amount: draft.amount ?? null,
    description: draft.description ?? draft.merchantName ?? '',
    difference: draft.difference ?? null,
    items: Array.isArray(draft.items) ? draft.items : [],
    itemsTotal: draft.itemsTotal ?? null,
    location: draft.location ?? '',
    transactionDate: draft.transactionDate ?? '',
    type: draft.type ?? 'Expense',
  };
}

function parseOptionalNumber(value: string) {
  const normalizedValue = value.trim().replace(/,/g, '');

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getTransactionTypeLabel(value: string | null | undefined) {
  return transactionTypes.find((type) => type.value === value)?.label ?? value ?? 'Chi tiêu';
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

function getCategoryIconLabel(category: Category) {
  if (category.icon?.trim()) {
    return category.icon.trim().charAt(0).toUpperCase();
  }

  return category.name.trim().charAt(0).toUpperCase() || '?';
}

export function TransactionDraftReview({ draft, onRetake }: TransactionDraftReviewProps) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editableDraft, setEditableDraft] = useState<EditableBillDraft>(() => getInitialEditableDraft(draft));
  const [billEditDraft, setBillEditDraft] = useState<EditableBillDraft>(() => getInitialEditableDraft(draft));
  const [amountInput, setAmountInput] = useState(String(draft.amount ?? ''));
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    typeof draft.accountId === 'number' ? draft.accountId : null
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    typeof draft.categoryId === 'number' ? draft.categoryId : null
  );
  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isCategoryPickerVisible, setIsCategoryPickerVisible] = useState(false);
  const [isCreateCategoryVisible, setIsCreateCategoryVisible] = useState(false);
  const [isAmountEditorVisible, setIsAmountEditorVisible] = useState(false);
  const [isTypePickerVisible, setIsTypePickerVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isBillEditorVisible, setIsBillEditorVisible] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>('Expense');
  const [isSaving, setIsSaving] = useState(false);
  const items = editableDraft.items;
  const categoryOptions = categories;
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const suggestedCategory =
    typeof draft.categoryId === 'number' ? categories.find((category) => category.id === draft.categoryId) : null;

  const loadCategories = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoadingCategories(true);
    }

    const response = await categoriesApi.list();
    setCategories(response.data);

    return response.data;
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingAccounts(true);
        const response = await financialAccountApi.list();
        setAccounts(response.data);

        setSelectedAccountId((currentAccountId) => currentAccountId ?? response.data[0]?.id ?? null);
      } catch (error) {
        Alert.alert('Không tải được ví', error instanceof Error ? error.message : 'Vui lòng thử lại sau.');
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
        Alert.alert('Không tải được danh mục', error instanceof Error ? error.message : 'Vui lòng thử lại sau.');
      } finally {
        setIsLoadingCategories(false);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadCategories]);

  async function handleCreateCategory() {
    const trimmedName = newCategoryName.trim();

    if (!trimmedName) {
      Alert.alert('Thiếu tên danh mục', 'Vui lòng nhập tên danh mục.');
      return;
    }

    try {
      setIsCreatingCategory(true);
      await categoriesApi.create({
        icon: trimmedName.charAt(0).toLowerCase() || 'tag',
        isDefault: false,
        name: trimmedName,
        type: newCategoryType,
      });
      const nextCategories = await loadCategories(false);
      const createdCategory = [...nextCategories]
        .reverse()
        .find(
          (category) =>
            category.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
            category.type === newCategoryType
        );

      if (createdCategory) {
        setSelectedCategoryId(createdCategory.id);
      }

      setNewCategoryName('');
      setNewCategoryType('Expense');
      setIsCreateCategoryVisible(false);
    } catch (error) {
      Alert.alert('Tạo danh mục thất bại', error instanceof Error ? error.message : 'Vui lòng thử lại sau.');
    } finally {
      setIsCreatingCategory(false);
      setIsLoadingCategories(false);
    }
  }

  function openAmountEditor() {
    setAmountInput(String(editableDraft.amount ?? ''));
    setIsAmountEditorVisible(true);
  }

  function handleSaveAmount() {
    const nextAmount = parseOptionalNumber(amountInput);

    if (nextAmount === null) {
      Alert.alert('Số tiền không hợp lệ', 'Vui lòng nhập số tiền hợp lệ.');
      return;
    }

    setEditableDraft((currentDraft) => ({ ...currentDraft, amount: nextAmount }));
    setIsAmountEditorVisible(false);
  }

  function handlePickDate(event: DateTimePickerEvent, pickedDate?: Date) {
    if (Platform.OS !== 'ios') {
      setIsDatePickerVisible(false);
    }

    if (event.type === 'dismissed' || !pickedDate) {
      return;
    }

    setEditableDraft((currentDraft) => ({
      ...currentDraft,
      transactionDate: mergePickedDate(currentDraft.transactionDate, pickedDate),
    }));
  }

  function openBillEditor() {
    setBillEditDraft({
      ...editableDraft,
      items: editableDraft.items.map((item) => ({ ...item })),
    });
    setIsBillEditorVisible(true);
  }

  function updateBillItem(index: number, patch: TransactionDraftItem) {
    setBillEditDraft((currentDraft) => ({
      ...currentDraft,
      items: currentDraft.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  function handleSaveBillEdit() {
    setEditableDraft({
      ...billEditDraft,
      items: billEditDraft.items.map((item) => ({ ...item })),
    });
    setIsBillEditorVisible(false);
  }

  async function handleSave() {
    if (selectedAccountId === null) {
      Alert.alert('Chưa chọn ví', 'Vui lòng chọn ví để lưu giao dịch.');
      return;
    }

    if (typeof editableDraft.amount !== 'number' || !Number.isFinite(editableDraft.amount)) {
      Alert.alert('Thiếu số tiền', 'Không thể lưu giao dịch khi chưa nhận diện được số tiền.');
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
          selectedAccountId
        )
      );
      await presentTransactionNotifications(response.data);
      Alert.alert('Đã lưu giao dịch', 'Giao dịch từ hóa đơn đã được lưu.', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      Alert.alert('Lưu giao dịch thất bại', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onRetake} hitSlop={12}>
          <Text style={styles.headerAction}>Quét lại</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Kiểm tra giao dịch</Text>
        <Pressable style={styles.editIconButton} onPress={openBillEditor} hitSlop={12}>
          <SymbolView
            name={{ ios: 'pencil', android: 'edit', web: 'edit' }}
            size={22}
            tintColor="#fff"
            fallback={<Text style={styles.editIconFallback}>✎</Text>}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryGrid}>
          <Pressable style={styles.summaryTile} onPress={() => setIsAccountPickerVisible(true)}>
            <Text style={styles.summaryTileLabel}>Ví</Text>
            <Text style={styles.summaryTileValue} numberOfLines={1}>
              {selectedAccount?.name ?? (isLoadingAccounts ? 'Đang tải...' : 'Chọn ví')}
            </Text>
            <Text style={styles.summaryTileMeta} numberOfLines={1}>
              {selectedAccount ? formatAmount(selectedAccount.initialBalance) : 'Bấm để chọn'}
            </Text>
          </Pressable>

          <Pressable style={styles.summaryTile} onPress={() => setIsCategoryPickerVisible(true)}>
            <Text style={styles.summaryTileLabel}>Category</Text>
            <Text style={styles.summaryTileValue} numberOfLines={1}>
              {selectedCategory?.name ?? (selectedCategoryId === null ? 'Chưa phân loại' : 'Chọn danh mục')}
            </Text>
            <Text style={styles.summaryTileMeta} numberOfLines={1}>
              {suggestedCategory ? `AI: ${suggestedCategory.name}` : 'Bấm để đổi'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.inlineGrid}>
            <Pressable style={styles.inlineTile} onPress={openAmountEditor}>
              <Text style={styles.inlineTileLabel}>Tổng tiền</Text>
              <Text style={styles.inlineTileValue} numberOfLines={1}>
                {formatAmount(editableDraft.amount)}
              </Text>
            </Pressable>
            <Pressable style={styles.inlineTile} onPress={() => setIsTypePickerVisible(true)}>
              <Text style={styles.inlineTileLabel}>Loại giao dịch</Text>
              <Text style={styles.inlineTileValue} numberOfLines={1}>
                {getTransactionTypeLabel(editableDraft.type)}
              </Text>
            </Pressable>
          </View>
          <View style={styles.inlineGrid}>
            <View style={styles.inlineTile}>
              <Text style={styles.inlineTileLabel}>Địa điểm</Text>
              <Text style={styles.inlineTileValue} numberOfLines={2}>
                {formatText(editableDraft.location)}
              </Text>
            </View>
            <Pressable style={styles.inlineTile} onPress={() => setIsDatePickerVisible(true)}>
              <Text style={styles.inlineTileLabel}>Ngày giao dịch</Text>
              <Text style={styles.inlineTileValue} numberOfLines={2}>
                {formatDate(editableDraft.transactionDate)}
              </Text>
            </Pressable>
          </View>
          <FieldRow label="Mô tả" value={editableDraft.description} />
        </View>

        {items.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsTitle}>Chi tiết hóa đơn</Text>
              <Text style={styles.itemsCount}>{items.length} món</Text>
            </View>

            {items.map((item, index) => (
              <View key={`${item.name ?? 'item'}-${index}`} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{formatText(item.name)}</Text>
                  <Text style={styles.itemMeta}>
                    {formatText(item.quantity)} × {formatAmount(item.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.itemAmount}>{formatAmount(item.amount)}</Text>
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tổng món</Text>
              <Text style={styles.totalValue}>{formatAmount(editableDraft.itemsTotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Chênh lệch</Text>
              <Text style={styles.totalValue}>{formatAmount(editableDraft.difference)}</Text>
            </View>
          </View>
        ) : null}

        {draft.rawText ? (
          <View style={styles.card}>
            <Text style={styles.rawTitle}>Nội dung nhận diện</Text>
            <Text style={styles.rawText}>{draft.rawText}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={isAccountPickerVisible}
        onRequestClose={() => setIsAccountPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsAccountPickerVisible(false)}>
          <Pressable style={styles.bottomSheet}>
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
                accounts.map((account) => {
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
                          {account.type} · {formatAmount(account.initialBalance)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {isDatePickerVisible && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="calendar"
          value={getDatePickerValue(editableDraft.transactionDate)}
          onChange={handlePickDate}
        />
      ) : null}

      <Modal
        animationType="slide"
        transparent
        visible={isDatePickerVisible && Platform.OS !== 'android'}
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsDatePickerVisible(false)}>
          <Pressable style={styles.smallBottomSheet}>
            <Text style={styles.sheetTitle}>Sửa ngày giao dịch</Text>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                mode="date"
                display="inline"
                value={getDatePickerValue(editableDraft.transactionDate)}
                onChange={handlePickDate}
              />
            ) : (
              <TextInput
                placeholder="YYYY-MM-DD hoặc ISO"
                placeholderTextColor="#6f7682"
                style={styles.categoryInput}
                value={editableDraft.transactionDate}
                onChangeText={(value) => setEditableDraft((currentDraft) => ({ ...currentDraft, transactionDate: value }))}
              />
            )}
            <Pressable style={styles.createCategoryButton} onPress={() => setIsDatePickerVisible(false)}>
              <Text style={styles.createCategoryButtonText}>Xong</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={isAmountEditorVisible}
        onRequestClose={() => setIsAmountEditorVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', default: undefined })}
          style={styles.keyboardModalOverlay}
        >
          <Pressable style={styles.amountModalDismissArea} onPress={() => setIsAmountEditorVisible(false)}>
            <Pressable style={styles.smallBottomSheet} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.sheetTitle}>Sửa tổng tiền</Text>
              <TextInput
                autoFocus
                keyboardType="decimal-pad"
                placeholder="Tổng tiền"
                placeholderTextColor="#6f7682"
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
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={isTypePickerVisible}
        onRequestClose={() => setIsTypePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsTypePickerVisible(false)}>
          <Pressable style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Chọn loại giao dịch</Text>
              <Pressable onPress={() => setIsTypePickerVisible(false)} hitSlop={12}>
                <Text style={styles.sheetClose}>Đóng</Text>
              </Pressable>
            </View>
            <View style={styles.sheetListContent}>
              {transactionTypes.map((transactionType) => {
                const isSelected = editableDraft.type === transactionType.value;

                return (
                  <Pressable
                    key={transactionType.value}
                    style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                    onPress={() => {
                      setEditableDraft((currentDraft) => ({ ...currentDraft, type: transactionType.value }));
                      setIsTypePickerVisible(false);
                    }}
                  >
                    <Text style={styles.categoryOptionText}>{transactionType.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="slide"
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
          <Pressable style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Chọn category</Text>
              <View style={styles.sheetActions}>
                <Pressable onPress={() => setIsCreateCategoryVisible(true)} hitSlop={12}>
                  <Text style={styles.sheetAdd}>+</Text>
                </Pressable>
                <Pressable onPress={() => setIsCategoryPickerVisible(false)} hitSlop={12}>
                  <Text style={styles.sheetClose}>Đóng</Text>
                </Pressable>
              </View>
            </View>

            {isLoadingCategories ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color="#31c452" />
              </View>
            ) : (
              <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
                <Pressable
                  style={[styles.pickerRow, selectedCategoryId === null && styles.pickerRowSelected]}
                  onPress={() => {
                    setSelectedCategoryId(null);
                    setIsCategoryPickerVisible(false);
                  }}
                >
                  <View style={styles.categoryIcon}>
                    <Text style={styles.categoryIconText}>?</Text>
                  </View>
                  <Text style={styles.categoryOptionText}>Chưa phân loại</Text>
                </Pressable>

                {categoryOptions.map((category) => {
                  const isSelected = category.id === selectedCategoryId;

                  return (
                    <Pressable
                      key={category.id}
                      style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                      onPress={() => {
                        setSelectedCategoryId(category.id);
                        setIsCategoryPickerVisible(false);
                      }}
                    >
                      <View style={styles.categoryIcon}>
                        <Text style={styles.categoryIconText}>{getCategoryIconLabel(category)}</Text>
                      </View>
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryName}>{category.name}</Text>
                        <Text style={styles.categoryMeta}>
                          {category.type === 'Expense' ? 'Chi tiêu' : 'Thu nhập'} · {category.isDefault ? 'Mặc định' : 'Của bạn'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {isCreateCategoryVisible ? (
              <View style={styles.inlineCreateOverlay}>
                <View style={styles.createCategoryModal}>
                  <Text style={styles.createCategoryTitle}>Thêm category</Text>
                  <TextInput
                    placeholder="Tên category"
                    placeholderTextColor="#6f7682"
                    style={styles.categoryInput}
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                  />
                  <View style={styles.categoryTypeRow}>
                    {(['Expense', 'Income'] as CategoryType[]).map((categoryType) => {
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
                            {categoryType === 'Expense' ? 'Chi tiêu' : 'Thu nhập'}
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
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.createCategoryButtonText}>Thêm</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="slide"
        visible={isBillEditorVisible}
        onRequestClose={() => setIsBillEditorVisible(false)}
      >
        <View style={styles.editorScreen}>
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
              <Text style={styles.editorSectionTitle}>Thông tin</Text>
              <TextInput
                keyboardType="decimal-pad"
                placeholder="Tổng tiền"
                placeholderTextColor="#6f7682"
                style={styles.categoryInput}
                value={String(billEditDraft.amount ?? '')}
                onChangeText={(value) =>
                  setBillEditDraft((currentDraft) => ({ ...currentDraft, amount: parseOptionalNumber(value) }))
                }
              />
              <TextInput
                placeholder="Mô tả"
                placeholderTextColor="#6f7682"
                style={styles.categoryInput}
                value={billEditDraft.description}
                onChangeText={(value) => setBillEditDraft((currentDraft) => ({ ...currentDraft, description: value }))}
              />
              <TextInput
                placeholder="Ngày giao dịch"
                placeholderTextColor="#6f7682"
                style={styles.categoryInput}
                value={billEditDraft.transactionDate}
                onChangeText={(value) =>
                  setBillEditDraft((currentDraft) => ({ ...currentDraft, transactionDate: value }))
                }
              />
              <TextInput
                placeholder="Địa điểm"
                placeholderTextColor="#6f7682"
                style={styles.categoryInput}
                value={billEditDraft.location}
                onChangeText={(value) => setBillEditDraft((currentDraft) => ({ ...currentDraft, location: value }))}
              />
            </View>

            <View style={styles.editorCard}>
              <Text style={styles.editorSectionTitle}>Chi tiết hóa đơn</Text>
              {billEditDraft.items.length === 0 ? (
                <Text style={styles.emptyAccountText}>Không có chi tiết hóa đơn.</Text>
              ) : (
                billEditDraft.items.map((item, index) => (
                  <View key={`${item.name ?? 'item'}-${index}`} style={styles.editItemBox}>
                    <TextInput
                      placeholder="Tên món"
                      placeholderTextColor="#6f7682"
                      style={styles.categoryInput}
                      value={item.name ?? ''}
                      onChangeText={(value) => updateBillItem(index, { name: value })}
                    />
                    <View style={styles.itemEditGrid}>
                      <TextInput
                        keyboardType="decimal-pad"
                        placeholder="SL"
                        placeholderTextColor="#6f7682"
                        style={styles.categoryInput}
                        value={item.quantity === null || item.quantity === undefined ? '' : String(item.quantity)}
                        onChangeText={(value) => updateBillItem(index, { quantity: parseOptionalNumber(value) })}
                      />
                      <TextInput
                        keyboardType="decimal-pad"
                        placeholder="Đơn giá"
                        placeholderTextColor="#6f7682"
                        style={styles.categoryInput}
                        value={item.unitPrice === null || item.unitPrice === undefined ? '' : String(item.unitPrice)}
                        onChangeText={(value) => updateBillItem(index, { unitPrice: parseOptionalNumber(value) })}
                      />
                      <TextInput
                        keyboardType="decimal-pad"
                        placeholder="Thành tiền"
                        placeholderTextColor="#6f7682"
                        style={styles.categoryInput}
                        value={item.amount === null || item.amount === undefined ? '' : String(item.amount)}
                        onChangeText={(value) => updateBillItem(index, { amount: parseOptionalNumber(value) })}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
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
          {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Lưu</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#020204', flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 14,
  },
  headerAction: { color: '#31c452', fontSize: 17, fontWeight: '800' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  editIconButton: {
    alignItems: 'center',
    backgroundColor: '#1e1e1f',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  editIconFallback: { color: '#fff', fontSize: 20, fontWeight: '900' },
  headerSpacer: { width: 58 },
  content: { gap: 14, padding: 20, paddingBottom: 130 },
  summaryGrid: { flexDirection: 'row', gap: 12 },
  summaryTile: {
    backgroundColor: '#1e1e1f',
    borderColor: '#303039',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 104,
    padding: 14,
  },
  summaryTileLabel: { color: '#9698a1', fontSize: 13, fontWeight: '800', marginBottom: 10 },
  summaryTileValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  summaryTileMeta: { color: '#31c452', fontSize: 13, fontWeight: '800', marginTop: 8 },
  card: { backgroundColor: '#1e1e1f', borderRadius: 8, overflow: 'hidden' },
  inlineGrid: { flexDirection: 'row', gap: 1 },
  inlineTile: {
    borderBottomColor: '#303039',
    borderBottomWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inlineTileLabel: { color: '#9698a1', fontSize: 13, fontWeight: '800' },
  inlineTileValue: { color: '#fff', fontSize: 16, fontWeight: '900', lineHeight: 21 },
  fieldRow: { borderBottomColor: '#303039', borderBottomWidth: 1, gap: 6, paddingHorizontal: 16, paddingVertical: 14 },
  fieldLabel: { color: '#9698a1', fontSize: 13, fontWeight: '700' },
  fieldValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  categoryHeaderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  aiHint: { color: '#31c452', fontSize: 12, fontWeight: '800' },
  categoryGrid: { gap: 10, paddingTop: 8 },
  categoryInput: {
    backgroundColor: '#1e1e1f',
    borderColor: '#303039',
    borderRadius: 8,
    borderWidth: 1,
    color: '#fff',
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  categoryTypeRow: { flexDirection: 'row', gap: 8 },
  categoryTypeOption: {
    alignItems: 'center',
    backgroundColor: '#1e1e1f',
    borderColor: '#303039',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  categoryTypeOptionSelected: { backgroundColor: '#17351f', borderColor: '#31c452' },
  categoryTypeOptionText: { color: '#9698a1', fontSize: 14, fontWeight: '800' },
  categoryTypeOptionTextSelected: { color: '#fff' },
  createCategoryButton: {
    alignItems: 'center',
    backgroundColor: '#31c452',
    borderRadius: 8,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
  },
  createCategoryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  categoryOption: {
    alignItems: 'center',
    borderColor: '#303039',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryOptionSelected: { backgroundColor: '#17351f', borderColor: '#31c452' },
  categoryOptionText: { color: '#fff', flex: 1, fontSize: 15, fontWeight: '800' },
  categoryIcon: { alignItems: 'center', backgroundColor: '#17351f', borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  categoryIconText: { color: '#31c452', fontSize: 17, fontWeight: '900' },
  categoryInfo: { flex: 1, gap: 3 },
  categoryName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  categoryMeta: { color: '#9698a1', fontSize: 13, fontWeight: '700' },
  rawTitle: { color: '#fff', fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16 },
  rawText: { color: '#c8cbd2', fontSize: 14, lineHeight: 21, padding: 16 },
  emptyAccountText: { color: '#9698a1', fontSize: 14, lineHeight: 20, padding: 16, textAlign: 'center' },
  accountRow: { alignItems: 'center', borderBottomColor: '#303039', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  accountRowSelected: { backgroundColor: '#17351f' },
  accountDot: { alignItems: 'center', borderColor: '#31c452', borderRadius: 11, borderWidth: 2, height: 22, justifyContent: 'center', width: 22 },
  accountDotInner: { backgroundColor: '#31c452', borderRadius: 6, height: 12, width: 12 },
  accountInfo: { flex: 1, gap: 4 },
  accountName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  accountMeta: { color: '#9698a1', fontSize: 13 },
  itemsHeader: { alignItems: 'center', borderBottomColor: '#303039', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  itemsTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  itemsCount: { color: '#9698a1', fontSize: 13, fontWeight: '700' },
  itemRow: { alignItems: 'center', borderBottomColor: '#303039', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  itemMeta: { color: '#9698a1', fontSize: 13 },
  itemAmount: { color: '#fff', fontSize: 15, fontWeight: '800' },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  totalLabel: { color: '#9698a1', fontSize: 14, fontWeight: '700' },
  totalValue: { color: '#fff', fontSize: 15, fontWeight: '800' },
  note: { color: '#8f939d', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  modalOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardModalOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  amountModalDismissArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#1e1e1f',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    maxHeight: '76%',
    paddingBottom: 20,
  },
  smallBottomSheet: {
    backgroundColor: '#1e1e1f',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    gap: 14,
    padding: 18,
    paddingBottom: 28,
  },
  sheetHeader: {
    alignItems: 'center',
    borderBottomColor: '#303039',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 18,
  },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  sheetActions: { alignItems: 'center', flexDirection: 'row', gap: 18 },
  sheetAdd: { color: '#31c452', fontSize: 32, fontWeight: '600', lineHeight: 34 },
  sheetClose: { color: '#31c452', fontSize: 15, fontWeight: '900' },
  sheetList: { maxHeight: 460 },
  sheetListContent: { gap: 10, padding: 16 },
  sheetLoading: { alignItems: 'center', minHeight: 180, justifyContent: 'center' },
  pickerRow: {
    alignItems: 'center',
    borderColor: '#303039',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerRowSelected: { backgroundColor: '#17351f', borderColor: '#31c452' },
  inlineCreateOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 24,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  createCategoryModal: {
    backgroundColor: '#1e1e1f',
    borderColor: '#303039',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    width: '100%',
  },
  createCategoryTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  createCategoryActions: { flexDirection: 'row', gap: 10 },
  cancelCategoryButton: {
    alignItems: 'center',
    backgroundColor: '#303039',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  cancelCategoryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  editorScreen: { backgroundColor: '#020204', flex: 1 },
  editorContent: { gap: 14, padding: 20, paddingBottom: 36 },
  editorCard: { backgroundColor: '#1e1e1f', borderRadius: 8, gap: 12, padding: 14 },
  editorSectionTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  editItemBox: { borderColor: '#303039', borderRadius: 8, borderWidth: 1, gap: 10, padding: 12 },
  itemEditGrid: { gap: 8 },
  footer: {
    backgroundColor: '#020204',
    borderTopColor: '#1e1e1f',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    left: 0,
    padding: 20,
    position: 'absolute',
    right: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#1e1e1f',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#31c452',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  buttonDisabled: { opacity: 0.65 },
});
