import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Category } from "@/api/categoriesApi";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { getLightCategoryColor } from "@/utils/lightCategoryColors";

import { useBudgetStyles } from "./budgets.styles";
import { formatDateInput } from "./helpers";
import type { BudgetFormState } from "./types";

type BudgetDateField = "startDate" | "endDate";

function parseBudgetDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function formatBudgetDate(value: string) {
  const date = parseBudgetDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}`;
}

export function CreateBudgetModal({
  categories = [],
  form,
  isSubmitting,
  onChangeForm,
  onClose,
  onSubmit,
  visible,
}: {
  categories: Category[];
  form: BudgetFormState;
  isSubmitting: boolean;
  onChangeForm: (form: BudgetFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  visible: boolean;
}) {
  const theme = useAppTheme();
  const themeMode = useThemeMode();
  const styles = useBudgetStyles();
  const [activeDateField, setActiveDateField] = useState<BudgetDateField | null>(null);

  function updateForm(nextForm: Partial<BudgetFormState>) {
    onChangeForm({ ...form, ...nextForm });
  }

  function openDatePicker(field: BudgetDateField) {
    setActiveDateField(field);
  }

  function closeDatePicker() {
    setActiveDateField(null);
  }

  function handlePickDate(event: DateTimePickerEvent, pickedDate?: Date) {
    if (Platform.OS === "android") {
      closeDatePicker();
    }

    if (event.type === "dismissed" || !pickedDate || !activeDateField) {
      return;
    }

    const startDate = parseBudgetDate(form.startDate);
    const endDate = parseBudgetDate(form.endDate);

    if (activeDateField === "startDate" && pickedDate.getTime() > endDate.getTime()) {
      updateForm({ startDate: formatDateInput(endDate) });
      return;
    }

    if (activeDateField === "endDate" && pickedDate.getTime() < startDate.getTime()) {
      updateForm({ endDate: formatDateInput(startDate) });
      return;
    }

    updateForm({ [activeDateField]: formatDateInput(pickedDate) });
  }

  const selectedDateValue = activeDateField ? parseBudgetDate(form[activeDateField]) : new Date();
  const startDateLimit = parseBudgetDate(form.startDate);
  const endDateLimit = parseBudgetDate(form.endDate);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.formScreen}
      >
        <View style={styles.formHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.formClose}>×</Text>
          </Pressable>
          <Text style={styles.formTitle}>Tạo Ngân sách</Text>
          <Pressable onPress={onSubmit} disabled={isSubmitting} hitSlop={12}>
            <Text style={[styles.formSave, isSubmitting && styles.disabledText]}>Lưu</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.field}>
            <Text style={styles.label}>Tên ngân sách</Text>
            <TextInput
              placeholder="Ăn uống tháng này"
              placeholderTextColor={theme.inputPlaceholder}
              style={styles.input}
              value={form.name}
              onChangeText={(name) => updateForm({ name })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Hạn mức</Text>
            <TextInput
              keyboardType="decimal-pad"
              placeholder="5000000"
              placeholderTextColor={theme.inputPlaceholder}
              style={styles.input}
              value={form.amount}
              onChangeText={(amount) => updateForm({ amount })}
            />
          </View>

          <View style={styles.budgetDateCapsule}>
            <Pressable style={styles.budgetDateSide} onPress={() => openDatePicker("startDate")}>
              <Text style={styles.dateCapsuleLabel}>Bắt đầu</Text>
              <Text style={styles.dateCapsuleValue}>{formatBudgetDate(form.startDate)}</Text>
            </Pressable>
            <View style={styles.budgetDateIconBubble}>
              <SymbolView name="calendar" size={28} tintColor={theme.textInverse} />
            </View>
            <Pressable style={styles.budgetDateSide} onPress={() => openDatePicker("endDate")}>
              <Text style={styles.dateCapsuleLabel}>Kết thúc</Text>
              <Text style={styles.dateCapsuleValue}>{formatBudgetDate(form.endDate)}</Text>
            </Pressable>
          </View>

          <View style={styles.compactBudgetControls}>
            <View style={styles.alertMiniControl}>
              <Text style={styles.label}>Cảnh báo</Text>
              <View style={styles.alertPercentRow}>
                <TextInput
                  keyboardType="number-pad"
                  placeholder="80"
                  placeholderTextColor={theme.inputPlaceholder}
                  style={styles.alertMiniInput}
                  value={form.alertThreshold}
                  onChangeText={(alertThreshold) => updateForm({ alertThreshold })}
                />
                <Text style={styles.alertPercentText}>%</Text>
              </View>
            </View>
            <View style={styles.recurringMiniControl}>
              <View style={styles.recurringMiniContent}>
                <View style={styles.recurringCopy}>
                  <Text style={styles.label}>Lặp lại</Text>
                  <Text style={styles.helperText}>Theo kỳ</Text>
                </View>
                <View style={styles.recurringSwitchSlot}>
                  <Switch
                    thumbColor={theme.textInverse}
                    trackColor={{ false: theme.borderStrong, true: theme.primary }}
                    value={form.isRecurring}
                    onValueChange={(isRecurring) => updateForm({ isRecurring })}
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Danh mục</Text>
            <View style={styles.categoryGrid}>
              <Pressable
                style={[
                  styles.categoryGridItem,
                  form.categoryId !== null && getLightCategoryColor("all-categories"),
                  form.categoryId === null && styles.categoryGridItemSelected,
                ]}
                onPress={() => updateForm({ categoryId: null })}
              >
                <View style={styles.categoryGridContent}>
                  <Text style={[styles.categoryGridText, form.categoryId === null && styles.categoryGridTextSelected]}>
                    Tất cả
                  </Text>
                </View>
              </Pressable>
              {(categories ?? []).map((category) => {
                const isSelected = form.categoryId === category.id;

                return (
                  <Pressable
                    key={category.id}
                    style={[
                      styles.categoryGridItem,
                      !isSelected && getLightCategoryColor(category.id ?? category.name),
                      isSelected && styles.categoryGridItemSelected,
                    ]}
                    onPress={() => updateForm({ categoryId: category.id })}
                  >
                    <View style={styles.categoryGridContent}>
                      <Text
                        numberOfLines={2}
                        style={[styles.categoryGridText, isSelected && styles.categoryGridTextSelected]}
                      >
                        {category.name}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        <View style={styles.formFooter}>
          <Pressable
            style={[styles.fullCreateButton, isSubmitting && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <Text style={styles.createButtonText}>Tạo Ngân sách</Text>
            )}
          </Pressable>
        </View>

        {activeDateField && Platform.OS === "android" ? (
          <DateTimePicker
            display="default"
            maximumDate={activeDateField === "startDate" ? endDateLimit : undefined}
            minimumDate={activeDateField === "endDate" ? startDateLimit : undefined}
            mode="date"
            onChange={handlePickDate}
            value={selectedDateValue}
          />
        ) : null}

        <Modal
          animationType="slide"
          transparent
          visible={activeDateField !== null && Platform.OS !== "android"}
          onRequestClose={closeDatePicker}
        >
          <Pressable style={styles.bottomSheetOverlay} onPress={closeDatePicker}>
            <Pressable style={styles.budgetDatePickerSheet} onPress={(event) => event.stopPropagation()}>
              <View style={styles.datePickerHeader}>
                <Pressable onPress={closeDatePicker} hitSlop={10}>
                  <Text style={[styles.datePickerAction, { color: theme.textSubtle }]}>Hủy</Text>
                </Pressable>
                <Text style={styles.datePickerTitle}>
                  {activeDateField === "startDate" ? "Chọn ngày bắt đầu" : "Chọn ngày kết thúc"}
                </Text>
                <Pressable onPress={closeDatePicker} hitSlop={10}>
                  <Text style={[styles.datePickerAction, { color: theme.primary }]}>Xong</Text>
                </Pressable>
              </View>
              <DateTimePicker
                accentColor={theme.primary}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={activeDateField === "startDate" ? endDateLimit : undefined}
                minimumDate={activeDateField === "endDate" ? startDateLimit : undefined}
                mode="date"
                onChange={handlePickDate}
                style={styles.datePicker}
                textColor={theme.text}
                themeVariant={themeMode}
                value={selectedDateValue}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}
