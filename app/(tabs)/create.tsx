import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { categoriesApi, Category } from '@/api/categoriesApi';
import { FinancialAccount, financialAccountApi } from '@/api/financialAccountApi';
import {
  transactionsApi,
  TransactionType,
  CreateTransactionPayload,
} from '@/api/transactionsApi';
import { presentTransactionNotifications } from '@/services/transactionNotifications';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemeMode } from '@/hooks/use-theme-mode';

const transactionTypes: { label: string; value: TransactionType }[] = [
  { label: 'Chi tiêu', value: 'Expense' },
  { label: 'Thu nhập', value: 'Income' },
  { label: 'Chuyển vào', value: 'TransferIn' },
  { label: 'Chuyển ra', value: 'TransferOut' },
];

function formatAmount(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount);
}

function formatDate(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} | ${hours}:${minutes}`;
}

export default function CreateScreen() {
  const theme = useAppTheme();
  const themeMode = useThemeMode();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [type, setType] = useState<TransactionType>('Expense');
  const [transactionDate, setTransactionDate] = useState<Date>(new Date());
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isExcluded, setIsExcluded] = useState(false);

  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isCategoryPickerVisible, setIsCategoryPickerVisible] = useState(false);
  const [isTypePickerVisible, setIsTypePickerVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [accountsRes, categoriesRes] = await Promise.all([
        financialAccountApi.list(),
        categoriesApi.list(),
      ]);
      
      setAccounts(accountsRes.data);
      setCategories(categoriesRes.data);
      
      if (accountsRes.data.length > 0 && selectedAccountId === null) {
        setSelectedAccountId(accountsRes.data[0].id);
      }
    } catch (error) {
      console.error('Failed to load data', error);
    }
  }, [selectedAccountId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSave = async () => {
    if (!amount || isNaN(Number(amount))) {
      Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
      return;
    }
    if (selectedAccountId === null) {
      Alert.alert('Lỗi', 'Vui lòng chọn tài khoản');
      return;
    }

    try {
      setIsSaving(true);
      const payload: CreateTransactionPayload = {
        accountId: selectedAccountId,
        categoryId: selectedCategoryId,
        type,
        amount: Number(amount),
        description: description || undefined,
        location: location || undefined,
        transactionDate: transactionDate.toISOString(),
        isExcluded,
      };

      const response = await transactionsApi.create(payload);
      await presentTransactionNotifications(response.data);
      
      Alert.alert('Thành công', 'Đã lưu giao dịch', [
        { text: 'OK', onPress: () => {
          // Reset form
          setAmount('');
          setDescription('');
          setLocation('');
          setType('Expense');
          setTransactionDate(new Date());
          setSelectedCategoryId(null);
          setIsExcluded(false);
          router.replace('/(tabs)/transactions');
        }}
      ]);
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể lưu giao dịch. Vui lòng thử lại.');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setIsDatePickerVisible(false);
    }

    if (event.type === 'dismissed') {
      return;
    }

    if (date) {
      setTransactionDate(date);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.screen }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Tạo giao dịch</Text>
        <Pressable 
          style={[styles.scanButton, { backgroundColor: theme.primaryPressed }]} 
          onPress={() => router.push('/(tabs)/scan-bill')}
        >
          <SymbolView
            name={{ ios: 'camera.fill', android: 'camera', web: 'camera' }}
            size={18}
            tintColor={theme.primary}
          />
          <Text style={[styles.scanButtonText, { color: theme.primary }]}>Quét hóa đơn</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>Số tiền</Text>
            <TextInput
              style={[styles.amountInput, { color: theme.primary }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={theme.textSubtle}
            />
          </View>

          <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={() => setIsTypePickerVisible(true)}>
            <View style={styles.rowLabelContainer}>
              <SymbolView name="tag" size={20} tintColor={theme.textSubtle} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>Loại</Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.text }]}>
              {transactionTypes.find(t => t.value === type)?.label}
            </Text>
          </Pressable>

          <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={() => setIsAccountPickerVisible(true)}>
            <View style={styles.rowLabelContainer}>
              <SymbolView name="creditcard" size={20} tintColor={theme.textSubtle} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>Tài khoản</Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.text }]}>
              {selectedAccount?.name || 'Chọn tài khoản'}
            </Text>
          </Pressable>

          <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={() => setIsCategoryPickerVisible(true)}>
            <View style={styles.rowLabelContainer}>
              <SymbolView name="list.bullet" size={20} tintColor={theme.textSubtle} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>Danh mục</Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.text }]}>
              {selectedCategory?.name || 'Chưa phân loại'}
            </Text>
          </Pressable>

          <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={() => setIsDatePickerVisible(true)}>
            <View style={styles.rowLabelContainer}>
              <SymbolView name="calendar" size={20} tintColor={theme.textSubtle} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>Ngày</Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.text }]}>
              {formatDate(transactionDate)}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, marginTop: 16 }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>Ghi chú</Text>
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Nhập ghi chú..."
              placeholderTextColor={theme.textSubtle}
              multiline
            />
          </View>

          <View style={[styles.inputGroup, { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>Địa điểm</Text>
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              value={location}
              onChangeText={setLocation}
              placeholder="Nhập địa điểm..."
              placeholderTextColor={theme.textSubtle}
            />
          </View>
        </View>

        <Pressable 
          style={[styles.saveButton, { backgroundColor: theme.primary }, isSaving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={theme.textInverse} />
          ) : (
            <Text style={[styles.saveButtonText, { color: theme.textInverse }]}>Lưu giao dịch</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Pickers */}
      <Modal visible={isAccountPickerVisible} transparent animationType="slide">
        <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={() => setIsAccountPickerVisible(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Chọn tài khoản</Text>
            <ScrollView>
              {accounts.map(account => (
                <Pressable
                  key={account.id}
                  style={[styles.pickerItem, selectedAccountId === account.id && { backgroundColor: theme.primaryPressed }]}
                  onPress={() => {
                    setSelectedAccountId(account.id);
                    setIsAccountPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: theme.text }]}>{account.name}</Text>
                  <Text style={[styles.pickerItemSubtext, { color: theme.textSubtle }]}>
                    {formatAmount(account.initialBalance)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={isCategoryPickerVisible} transparent animationType="slide">
        <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={() => setIsCategoryPickerVisible(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Chọn danh mục</Text>
            <ScrollView>
              <Pressable
                style={[styles.pickerItem, selectedCategoryId === null && { backgroundColor: theme.primaryPressed }]}
                onPress={() => {
                  setSelectedCategoryId(null);
                  setIsCategoryPickerVisible(false);
                }}
              >
                <Text style={[styles.pickerItemText, { color: theme.text }]}>Chưa phân loại</Text>
              </Pressable>
              {categories.map(category => (
                <Pressable
                  key={category.id}
                  style={[styles.pickerItem, selectedCategoryId === category.id && { backgroundColor: theme.primaryPressed }]}
                  onPress={() => {
                    setSelectedCategoryId(category.id);
                    setIsCategoryPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: theme.text }]}>{category.name}</Text>
                  <Text style={[styles.pickerItemSubtext, { color: theme.textSubtle }]}>
                    {category.type === 'Expense' ? 'Chi tiêu' : 'Thu nhập'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={isTypePickerVisible} transparent animationType="slide">
        <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={() => setIsTypePickerVisible(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Chọn loại giao dịch</Text>
            {transactionTypes.map(t => (
              <Pressable
                key={t.value}
                style={[styles.pickerItem, type === t.value && { backgroundColor: theme.primaryPressed }]}
                onPress={() => {
                  setType(t.value);
                  setIsTypePickerVisible(false);
                }}
              >
                <Text style={[styles.pickerItemText, { color: theme.text }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {isDatePickerVisible && Platform.OS === 'android' ? (
        <DateTimePicker
          value={transactionDate}
          mode="datetime"
          display="default"
          onChange={handleDateChange}
        />
      ) : null}

      <Modal
        visible={isDatePickerVisible && Platform.OS !== 'android'}
        transparent
        animationType="slide"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={() => setIsDatePickerVisible(false)}>
          <Pressable style={[styles.datePickerContent, { backgroundColor: theme.card }]}>
            <View style={styles.datePickerHeader}>
              <Pressable onPress={() => setIsDatePickerVisible(false)} hitSlop={10}>
                <Text style={[styles.datePickerAction, { color: theme.textSubtle }]}>Hủy</Text>
              </Pressable>
              <Text style={[styles.modalTitle, styles.datePickerTitle, { color: theme.text }]}>Chọn ngày</Text>
              <Pressable onPress={() => setIsDatePickerVisible(false)} hitSlop={10}>
                <Text style={[styles.datePickerAction, { color: theme.primary }]}>Xong</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={transactionDate}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              accentColor={theme.primary}
              textColor={theme.text}
              themeVariant={themeMode}
              style={styles.datePicker}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  scanButtonText: { fontSize: 14, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  card: { borderRadius: 16, overflow: 'hidden', padding: 4 },
  inputGroup: { padding: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  amountInput: { fontSize: 32, fontWeight: 'bold', paddingVertical: 4 },
  textInput: { fontSize: 16, paddingVertical: 8, minHeight: 40 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
  },
  rowLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
  rowValue: { fontSize: 16, fontWeight: '600' },
  saveButton: {
    marginTop: 32,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: { fontSize: 18, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  datePickerContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
  },
  datePickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  datePickerTitle: { marginBottom: 0 },
  datePickerAction: { fontSize: 16, fontWeight: '700' },
  datePicker: { alignSelf: 'stretch' },
  pickerItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 8,
  },
  pickerItemText: { fontSize: 16, fontWeight: '600' },
  pickerItemSubtext: { fontSize: 12, marginTop: 4 },
});
