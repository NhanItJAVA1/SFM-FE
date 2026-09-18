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
} from 'react-native';

import type { Category } from '@/api/categoriesApi';

import { styles } from './budgets.styles';
import type { BudgetFormState } from './types';

export function CreateBudgetModal({
  categories,
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
  function updateForm(nextForm: Partial<BudgetFormState>) {
    onChangeForm({ ...form, ...nextForm });
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.formScreen}>
        <View style={styles.formHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.formClose}>×</Text>
          </Pressable>
          <Text style={styles.formTitle}>Tạo Ngân sách</Text>
          <Pressable onPress={onSubmit} disabled={isSubmitting} hitSlop={12}>
            <Text style={[styles.formSave, isSubmitting && styles.disabledText]}>Lưu</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Tên ngân sách</Text>
            <TextInput
              placeholder="Ăn uống tháng này"
              placeholderTextColor="#686b73"
              style={styles.input}
              value={form.name}
              onChangeText={(name) => updateForm({ name })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Danh mục</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
              <Pressable
                style={[styles.categoryChip, form.categoryId === null && styles.categoryChipSelected]}
                onPress={() => updateForm({ categoryId: null })}
              >
                <Text style={[styles.categoryChipText, form.categoryId === null && styles.categoryChipTextSelected]}>
                  Tất cả
                </Text>
              </Pressable>
              {categories.map((category) => {
                const isSelected = form.categoryId === category.id;

                return (
                  <Pressable
                    key={category.id}
                    style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                    onPress={() => updateForm({ categoryId: category.id })}
                  >
                    <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                      {category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Hạn mức</Text>
            <TextInput
              keyboardType="decimal-pad"
              placeholder="5000000"
              placeholderTextColor="#686b73"
              style={styles.input}
              value={form.amount}
              onChangeText={(amount) => updateForm({ amount })}
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.field, styles.formRowItem]}>
              <Text style={styles.label}>Bắt đầu</Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#686b73"
                style={styles.input}
                value={form.startDate}
                onChangeText={(startDate) => updateForm({ startDate })}
              />
            </View>
            <View style={[styles.field, styles.formRowItem]}>
              <Text style={styles.label}>Kết thúc</Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#686b73"
                style={styles.input}
                value={form.endDate}
                onChangeText={(endDate) => updateForm({ endDate })}
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={[styles.field, styles.formRowItem]}>
              <Text style={styles.label}>Cảnh báo (%)</Text>
              <TextInput
                keyboardType="number-pad"
                placeholder="80"
                placeholderTextColor="#686b73"
                style={styles.input}
                value={form.alertThreshold}
                onChangeText={(alertThreshold) => updateForm({ alertThreshold })}
              />
            </View>
            <View style={styles.recurringRow}>
              <View>
                <Text style={styles.label}>Lặp lại</Text>
                <Text style={styles.helperText}>Tạo lại theo kỳ</Text>
              </View>
              <Switch
                thumbColor="#fff"
                trackColor={{ false: '#3a3d43', true: '#31c452' }}
                value={form.isRecurring}
                onValueChange={(isRecurring) => updateForm({ isRecurring })}
              />
            </View>
          </View>

          <Pressable
            style={[styles.fullCreateButton, isSubmitting && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Tạo Ngân sách</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
