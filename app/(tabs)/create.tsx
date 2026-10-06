import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { categoriesApi, Category, CategoryType } from "@/api/categoriesApi";
import { FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";
import { CreateTransactionPayload, transactionsApi, TransactionType } from "@/api/transactionsApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { invalidateAIAnalysis } from "@/hooks/use-ai-analysis";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { presentTransactionNotifications } from "@/services/transactionNotifications";
import { getAccountCurrentBalance } from "@/utils/accountBalance";
import { openVietQRPayment } from "@/utils/paymentDeeplink";

const transactionTypes: { label: string; value: TransactionType }[] = [
  { label: "Chi tiêu", value: "Expense" },
  { label: "Thu nhập", value: "Income" },
  { label: "Chuyển vào", value: "TransferIn" },
  { label: "Chuyển ra", value: "TransferOut" },
];

type VietQRBankApp = {
  appId: string;
  appLogo: string;
  appName: string;
  bankName: string;
  autofill: number;
  deeplink: string;
};

const VIETQR_BANK_APP_ENDPOINT =
  Platform.OS === "ios"
    ? "https://api.vietqr.io/v2/ios-app-deeplinks"
    : "https://api.vietqr.io/v2/android-app-deeplinks";
const BANK_LOGO_PREFETCH_LIMIT = 12;
const PAYMENT_AUTO_SAVE_SECONDS = 30;
const PAYMENT_AUTO_SAVE_STORAGE_KEY = "sfm.pendingPaymentAutoSave";

type PendingPaymentAutoSave = {
  deadline: number;
  payload: CreateTransactionPayload;
};

let inMemoryPendingPaymentAutoSave: PendingPaymentAutoSave | null = null;

async function savePendingPaymentAutoSave(pendingPayment: PendingPaymentAutoSave) {
  inMemoryPendingPaymentAutoSave = pendingPayment;
  await SecureStore.setItemAsync(PAYMENT_AUTO_SAVE_STORAGE_KEY, JSON.stringify(pendingPayment));
}

async function loadPendingPaymentAutoSave() {
  if (inMemoryPendingPaymentAutoSave) {
    return inMemoryPendingPaymentAutoSave;
  }

  const storedValue = await SecureStore.getItemAsync(PAYMENT_AUTO_SAVE_STORAGE_KEY);
  if (!storedValue) {
    return null;
  }

  try {
    inMemoryPendingPaymentAutoSave = JSON.parse(storedValue) as PendingPaymentAutoSave;
    return inMemoryPendingPaymentAutoSave;
  } catch {
    await SecureStore.deleteItemAsync(PAYMENT_AUTO_SAVE_STORAGE_KEY);
    return null;
  }
}

async function clearPendingPaymentAutoSave() {
  inMemoryPendingPaymentAutoSave = null;
  await SecureStore.deleteItemAsync(PAYMENT_AUTO_SAVE_STORAGE_KEY);
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    currency: "VND",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

function formatDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} | ${hours}:${minutes}`;
}

export default function CreateScreen() {
  const theme = useAppTheme();
  const themeMode = useThemeMode();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentBankApps, setPaymentBankApps] = useState<VietQRBankApp[]>([]);

  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [type, setType] = useState<TransactionType>("Expense");
  const [transactionDate, setTransactionDate] = useState<Date>(new Date());
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedPaymentBank, setSelectedPaymentBank] = useState<VietQRBankApp | null>(null);
  const [recipientAccountNumber, setRecipientAccountNumber] = useState("");
  const [isExcluded, setIsExcluded] = useState(false);
  const [isPaymentMode, setIsPaymentMode] = useState(false);
  const [isPaymentAutoSavePending, setIsPaymentAutoSavePending] = useState(false);
  const [paymentAutoSaveCountdown, setPaymentAutoSaveCountdown] = useState(PAYMENT_AUTO_SAVE_SECONDS);

  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isCategoryPickerVisible, setIsCategoryPickerVisible] = useState(false);
  const [isTypePickerVisible, setIsTypePickerVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isPaymentBankPickerVisible, setIsPaymentBankPickerVisible] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const paymentAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPaymentPayloadRef = useRef<CreateTransactionPayload | null>(null);
  const paymentAutoSaveDeadlineRef = useRef<number | null>(null);
  const hasLoadedDataRef = useRef(false);
  const categoryType: CategoryType = type === "Income" || type === "TransferIn" ? "Income" : "Expense";
  const availableCategories = (categories ?? []).filter((category) => category.type === categoryType);

  const clearPaymentAutoSaveTimers = useCallback(() => {
    if (paymentAutoSaveTimerRef.current) {
      clearTimeout(paymentAutoSaveTimerRef.current);
      paymentAutoSaveTimerRef.current = null;
    }

    if (paymentCountdownTimerRef.current) {
      clearInterval(paymentCountdownTimerRef.current);
      paymentCountdownTimerRef.current = null;
    }
  }, []);

  const getPaymentAutoSaveRemainingSeconds = useCallback(() => {
    const deadline = paymentAutoSaveDeadlineRef.current;

    if (!deadline) {
      return PAYMENT_AUTO_SAVE_SECONDS;
    }

    return Math.max(Math.ceil((deadline - Date.now()) / 1000), 0);
  }, []);

  const loadData = useCallback(async () => {
    try {
      if (!hasLoadedDataRef.current) {
        setIsLoading(true);
      }

      const [accountsRes, categoriesRes, paymentBankAppsRes] = await Promise.all([
        financialAccountApi.list(),
        categoriesApi.list(),
        fetch(VIETQR_BANK_APP_ENDPOINT).then((response) => response.json()),
      ]);

      const accountData = Array.isArray(accountsRes.data) ? accountsRes.data : [];
      const categoryData = Array.isArray(categoriesRes.data) ? categoriesRes.data : [];

      setAccounts(accountData);
      setCategories(categoryData);
      const bankApps: VietQRBankApp[] = paymentBankAppsRes.apps ?? [];
      setPaymentBankApps(bankApps);
      setSelectedPaymentBank((current) => current ?? bankApps.find((app) => app.appId === "mb") ?? bankApps[0] ?? null);
      bankApps.slice(0, BANK_LOGO_PREFETCH_LIMIT).forEach((app) => {
        if (app.appLogo) {
          Image.prefetch(app.appLogo);
        }
      });

      if (accountData.length > 0 && selectedAccountId === null) {
        setSelectedAccountId(accountData[0].id);
      }
    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      hasLoadedDataRef.current = true;
      setIsLoading(false);
    }
  }, [selectedAccountId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    return clearPaymentAutoSaveTimers;
  }, [clearPaymentAutoSaveTimers]);

  const buildTransactionPayload = useCallback((): CreateTransactionPayload | null => {
    if (!amount || isNaN(Number(amount))) {
      Alert.alert("Lỗi", "Vui lòng nhập số tiền hợp lệ");
      return null;
    }

    if (selectedAccountId === null) {
      Alert.alert("Lỗi", "Vui lòng chọn tài khoản");
      return null;
    }

    if (selectedCategoryId === null) {
      Alert.alert("Lỗi", "Vui lòng chọn danh mục cho giao dịch");
      return null;
    }

    return {
      accountId: selectedAccountId,
      categoryId: selectedCategoryId,
      type,
      amount: Number(amount),
      description: description || undefined,
      location: location || undefined,
      transactionDate: transactionDate.toISOString(),
      isExcluded,
    };
  }, [amount, description, isExcluded, location, selectedAccountId, selectedCategoryId, transactionDate, type]);

  const resetForm = useCallback(() => {
    setAmount("");
    setDescription("");
    setLocation("");
    setType("Expense");
    setTransactionDate(new Date());
    setSelectedCategoryId(null);
    setIsExcluded(false);
    setRecipientAccountNumber("");
    setIsPaymentAutoSavePending(false);
    setPaymentAutoSaveCountdown(PAYMENT_AUTO_SAVE_SECONDS);
    pendingPaymentPayloadRef.current = null;
    paymentAutoSaveDeadlineRef.current = null;
    clearPendingPaymentAutoSave();
  }, []);

  const saveTransaction = useCallback(
    async (payload: CreateTransactionPayload) => {
      try {
        setIsSaving(true);
        const response = await transactionsApi.create(payload);
        invalidateAIAnalysis();
        await presentTransactionNotifications(response.data);

        Alert.alert("Thành công", "Đã lưu giao dịch", [
          {
            text: "OK",
            onPress: () => {
              resetForm();
              router.replace("/(tabs)/transactions");
            },
          },
        ]);
      } catch (error) {
        Alert.alert("Lỗi", "Không thể lưu giao dịch. Vui lòng thử lại.");
        console.error(error);
      } finally {
        setIsSaving(false);
      }
    },
    [resetForm],
  );

  const completePaymentAutoSave = useCallback(() => {
    const payload = pendingPaymentPayloadRef.current;

    if (!payload) {
      return;
    }

    clearPaymentAutoSaveTimers();
    pendingPaymentPayloadRef.current = null;
    paymentAutoSaveDeadlineRef.current = null;
    clearPendingPaymentAutoSave();
    setIsPaymentAutoSavePending(false);
    setPaymentAutoSaveCountdown(PAYMENT_AUTO_SAVE_SECONDS);
    saveTransaction(payload);
  }, [clearPaymentAutoSaveTimers, saveTransaction]);

  const schedulePaymentAutoSaveTimers = useCallback(() => {
    clearPaymentAutoSaveTimers();

    paymentCountdownTimerRef.current = setInterval(() => {
      const remainingSeconds = getPaymentAutoSaveRemainingSeconds();
      setPaymentAutoSaveCountdown(remainingSeconds);

      if (remainingSeconds <= 0) {
        completePaymentAutoSave();
      }
    }, 1000);

    const remainingMs = Math.max((paymentAutoSaveDeadlineRef.current ?? Date.now()) - Date.now(), 0);
    paymentAutoSaveTimerRef.current = setTimeout(() => {
      completePaymentAutoSave();
    }, remainingMs);
  }, [clearPaymentAutoSaveTimers, completePaymentAutoSave, getPaymentAutoSaveRemainingSeconds]);

  const startPaymentAutoSave = useCallback(
    async (payload: CreateTransactionPayload) => {
      const pendingPayment = {
        deadline: Date.now() + PAYMENT_AUTO_SAVE_SECONDS * 1000,
        payload,
      };

      pendingPaymentPayloadRef.current = pendingPayment.payload;
      paymentAutoSaveDeadlineRef.current = pendingPayment.deadline;
      setPaymentAutoSaveCountdown(PAYMENT_AUTO_SAVE_SECONDS);
      setIsPaymentAutoSavePending(true);
      schedulePaymentAutoSaveTimers();
      await savePendingPaymentAutoSave(pendingPayment);
    },
    [schedulePaymentAutoSaveTimers],
  );

  const stopPaymentAutoSave = useCallback(() => {
    clearPaymentAutoSaveTimers();
    pendingPaymentPayloadRef.current = null;
    paymentAutoSaveDeadlineRef.current = null;
    clearPendingPaymentAutoSave();
    setIsPaymentAutoSavePending(false);
    setPaymentAutoSaveCountdown(PAYMENT_AUTO_SAVE_SECONDS);
  }, [clearPaymentAutoSaveTimers]);

  const restorePaymentAutoSave = useCallback(async () => {
    const pendingPayment = await loadPendingPaymentAutoSave();

    if (!pendingPayment) {
      return;
    }

    pendingPaymentPayloadRef.current = pendingPayment.payload;
    paymentAutoSaveDeadlineRef.current = pendingPayment.deadline;
    const remainingSeconds = getPaymentAutoSaveRemainingSeconds();

    if (remainingSeconds <= 0) {
      completePaymentAutoSave();
      return;
    }

    setPaymentAutoSaveCountdown(remainingSeconds);
    setIsPaymentAutoSavePending(true);
    schedulePaymentAutoSaveTimers();
  }, [completePaymentAutoSave, getPaymentAutoSaveRemainingSeconds, schedulePaymentAutoSaveTimers]);

  useEffect(() => {
    const restoreTimer = setTimeout(() => {
      restorePaymentAutoSave();
    }, 0);

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active") {
        return;
      }

      if (!pendingPaymentPayloadRef.current) {
        restorePaymentAutoSave();
        return;
      }

      const remainingSeconds = getPaymentAutoSaveRemainingSeconds();
      setPaymentAutoSaveCountdown(remainingSeconds);

      if (remainingSeconds <= 0) {
        completePaymentAutoSave();
        return;
      }

      setIsPaymentAutoSavePending(true);
      schedulePaymentAutoSaveTimers();
    });

    return () => {
      clearTimeout(restoreTimer);
      subscription.remove();
    };
  }, [
    completePaymentAutoSave,
    getPaymentAutoSaveRemainingSeconds,
    restorePaymentAutoSave,
    schedulePaymentAutoSaveTimers,
  ]);

  const handleSave = async () => {
    const payload = buildTransactionPayload();

    if (!payload) {
      return;
    }

    await saveTransaction(payload);
  };

  const handlePayment = async () => {
    const payload = buildTransactionPayload();

    if (!payload) {
      return;
    }

    if (!recipientAccountNumber.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập số tài khoản nhận");
      return;
    }

    if (!selectedPaymentBank) {
      Alert.alert("Lỗi", "Vui lòng chọn ngân hàng thanh toán");
      return;
    }

    await startPaymentAutoSave(payload);

    try {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 300);
      });

      const result = await openVietQRPayment({
        appCode: selectedPaymentBank.appId,
        bankCode: selectedPaymentBank.appId,
        accountNumber: recipientAccountNumber.trim(),
        amount: Number(amount),
        content: description.trim() || "TEST SFM",
        returnUrl: "https://payos.vn",
      });

      if (!result.opened) {
        stopPaymentAutoSave();
      }
    } catch (error) {
      stopPaymentAutoSave();
      throw error;
    }
  };

  const handleCancelPaymentAutoSave = () => {
    stopPaymentAutoSave();
    Alert.alert("Đã hủy giao dịch", "Giao dịch này sẽ không được tự động lưu.");
  };

  const selectedAccount = (accounts ?? []).find((a) => a.id === selectedAccountId);
  const selectedCategory = (categories ?? []).find((c) => c.id === selectedCategoryId);

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setIsDatePickerVisible(false);
    }

    if (event.type === "dismissed") {
      return;
    }

    if (date) {
      setTransactionDate(date);
    }
  };

  if (isLoading) {
    return (
      <FocusedScreenTransition style={[styles.container, { backgroundColor: theme.screen }]}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </FocusedScreenTransition>
    );
  }

  return (
    <FocusedScreenTransition style={[styles.container, { backgroundColor: theme.screen }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 84 : 0}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Tạo giao dịch</Text>
          <Pressable
            style={[styles.scanButton, { backgroundColor: theme.primaryPressed }]}
            onPress={() => router.push("/(tabs)/scan-bill")}
          >
            <SymbolView
              name={{ ios: "camera.fill", android: "camera", web: "camera" }}
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

            <Pressable
              style={[styles.row, { borderTopColor: theme.border }]}
              onPress={() => setIsTypePickerVisible(true)}
            >
              <View style={styles.rowLabelContainer}>
                <SymbolView name="tag" size={20} tintColor={theme.textSubtle} />
                <Text style={[styles.rowLabel, { color: theme.text }]}>Loại</Text>
              </View>
              <Text style={[styles.rowValue, { color: theme.text }]}>
                {transactionTypes.find((t) => t.value === type)?.label}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.row, { borderTopColor: theme.border }]}
              onPress={() => setIsAccountPickerVisible(true)}
            >
              <View style={styles.rowLabelContainer}>
                <SymbolView name="creditcard" size={20} tintColor={theme.textSubtle} />
                <Text style={[styles.rowLabel, { color: theme.text }]}>Tài khoản</Text>
              </View>
              <Text style={[styles.rowValue, { color: theme.text }]}>{selectedAccount?.name || "Chọn tài khoản"}</Text>
            </Pressable>

            <Pressable
              style={[styles.row, { borderTopColor: theme.border }]}
              onPress={() => setIsCategoryPickerVisible(true)}
            >
              <View style={styles.rowLabelContainer}>
                <SymbolView name="list.bullet" size={20} tintColor={theme.textSubtle} />
                <Text style={[styles.rowLabel, { color: theme.text }]}>Danh mục</Text>
              </View>
              <Text style={[styles.rowValue, { color: theme.text }]}>{selectedCategory?.name || "Chưa phân loại"}</Text>
            </Pressable>

            <Pressable
              style={[styles.row, { borderTopColor: theme.border }]}
              onPress={() => setIsDatePickerVisible(true)}
            >
              <View style={styles.rowLabelContainer}>
                <SymbolView name="calendar" size={20} tintColor={theme.textSubtle} />
                <Text style={[styles.rowLabel, { color: theme.text }]}>Ngày</Text>
              </View>
              <Text style={[styles.rowValue, { color: theme.text }]}>{formatDate(transactionDate)}</Text>
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

          <View style={[styles.card, { backgroundColor: theme.card, marginTop: 16 }]}>
            <View style={styles.paymentToggleRow}>
              <View style={styles.rowLabelContainer}>
                <SymbolView name="creditcard" size={20} tintColor={theme.textSubtle} />
                <Text style={[styles.rowLabel, { color: theme.text }]}>Thanh toán ngân hàng</Text>
              </View>
              <Switch
                value={isPaymentMode}
                onValueChange={(value) => {
                  if (!value && isPaymentAutoSavePending) {
                    handleCancelPaymentAutoSave();
                  }
                  setIsPaymentMode(value);
                }}
                trackColor={{ false: theme.border, true: theme.primaryPressed }}
                thumbColor={isPaymentMode ? theme.primary : theme.textSubtle}
              />
            </View>

            {isPaymentMode ? (
              <>
                <Pressable
                  style={[styles.row, { borderTopColor: theme.border }]}
                  onPress={() => setIsPaymentBankPickerVisible(true)}
                >
                  <View style={styles.rowLabelContainer}>
                    {selectedPaymentBank?.appLogo ? (
                      <View style={[styles.bankLogoFrame, { backgroundColor: theme.cardAlt }]}>
                        <Image source={{ uri: selectedPaymentBank.appLogo }} style={styles.bankLogo} />
                      </View>
                    ) : (
                      <SymbolView name="building.columns" size={20} tintColor={theme.textSubtle} />
                    )}
                    <Text numberOfLines={1} style={[styles.rowLabel, { color: theme.text }]}>
                      {selectedPaymentBank?.appName || "Ngân hàng"}
                    </Text>
                  </View>
                </Pressable>

                <View style={[styles.inputGroup, { borderTopWidth: 1, borderTopColor: theme.border }]}>
                  <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>Số tài khoản nhận</Text>
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    value={recipientAccountNumber}
                    onChangeText={setRecipientAccountNumber}
                    keyboardType="number-pad"
                    placeholder="Nhập số tài khoản"
                    placeholderTextColor={theme.textSubtle}
                  />
                </View>
              </>
            ) : null}
          </View>

          <Pressable
            style={[
              styles.saveButton,
              { backgroundColor: isPaymentAutoSavePending ? theme.danger : theme.primary },
              isSaving && { opacity: 0.7 },
            ]}
            onPress={
              isPaymentAutoSavePending ? handleCancelPaymentAutoSave : isPaymentMode ? handlePayment : handleSave
            }
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <Text style={[styles.saveButtonText, { color: theme.textInverse }]}>
                {isPaymentAutoSavePending
                  ? `Hủy giao dịch (${paymentAutoSaveCountdown}s)`
                  : isPaymentMode
                    ? "Thanh toán"
                    : "Lưu giao dịch"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pickers */}
      <Modal visible={isAccountPickerVisible} transparent animationType="slide">
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}
          onPress={() => setIsAccountPickerVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Chọn tài khoản</Text>
            <ScrollView>
              {(accounts ?? []).map((account) => (
                <Pressable
                  key={account.id}
                  style={[
                    styles.pickerItem,
                    selectedAccountId === account.id && { backgroundColor: theme.primaryPressed },
                  ]}
                  onPress={() => {
                    setSelectedAccountId(account.id);
                    setIsAccountPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: theme.text }]}>{account.name}</Text>
                  <Text style={[styles.pickerItemSubtext, { color: theme.textSubtle }]}>
                    {formatAmount(getAccountCurrentBalance(account))}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={isCategoryPickerVisible} transparent animationType="slide">
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}
          onPress={() => setIsCategoryPickerVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Chọn danh mục</Text>
            <ScrollView>
              {availableCategories.map((category) => (
                <Pressable
                  key={category.id}
                  style={[
                    styles.pickerItem,
                    selectedCategoryId === category.id && { backgroundColor: theme.primaryPressed },
                  ]}
                  onPress={() => {
                    setSelectedCategoryId(category.id);
                    setIsCategoryPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: theme.text }]}>{category.name}</Text>
                  <Text style={[styles.pickerItemSubtext, { color: theme.textSubtle }]}>
                    {category.type === "Expense" ? "Chi tiêu" : "Thu nhập"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={isTypePickerVisible} transparent animationType="slide">
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}
          onPress={() => setIsTypePickerVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Chọn loại giao dịch</Text>
            {transactionTypes.map((t) => (
              <Pressable
                key={t.value}
                style={[styles.pickerItem, type === t.value && { backgroundColor: theme.primaryPressed }]}
                onPress={() => {
                  setType(t.value);
                  setSelectedCategoryId(null);
                  setIsTypePickerVisible(false);
                }}
              >
                <Text style={[styles.pickerItemText, { color: theme.text }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={isPaymentBankPickerVisible} transparent animationType="slide">
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}
          onPress={() => setIsPaymentBankPickerVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Chọn ngân hàng thanh toán</Text>
            <ScrollView>
              {(paymentBankApps ?? []).map((bankApp) => (
                <Pressable
                  key={bankApp.appId}
                  style={[
                    styles.pickerItem,
                    selectedPaymentBank?.appId === bankApp.appId && { backgroundColor: theme.primaryPressed },
                  ]}
                  onPress={() => {
                    setSelectedPaymentBank(bankApp);
                    setIsPaymentBankPickerVisible(false);
                  }}
                >
                  <View style={styles.bankPickerItem}>
                    <View style={[styles.bankPickerLogoFrame, { backgroundColor: theme.cardAlt }]}>
                      <Image source={{ uri: bankApp.appLogo }} style={styles.bankPickerLogo} />
                    </View>
                    <View style={styles.bankPickerCopy}>
                      <Text style={[styles.pickerItemText, { color: theme.text }]}>{bankApp.appName}</Text>
                      <Text style={[styles.pickerItemSubtext, { color: theme.textSubtle }]}>{bankApp.bankName}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {isDatePickerVisible && Platform.OS === "android" ? (
        <DateTimePicker value={transactionDate} mode="datetime" display="default" onChange={handleDateChange} />
      ) : null}

      <Modal
        visible={isDatePickerVisible && Platform.OS !== "android"}
        transparent
        animationType="slide"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}
          onPress={() => setIsDatePickerVisible(false)}
        >
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
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleDateChange}
              accentColor={theme.primary}
              textColor={theme.text}
              themeVariant={themeMode}
              style={styles.datePicker}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </FocusedScreenTransition>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  loadingState: { alignItems: "center", flex: 1, justifyContent: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: "bold" },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  scanButtonText: { fontSize: 14, fontWeight: "600" },
  scrollContent: { padding: 20, paddingBottom: 40 },
  card: { borderRadius: 16, overflow: "hidden", padding: 4 },
  inputGroup: { padding: 16 },
  inputLabel: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  amountInput: { fontSize: 32, fontWeight: "bold", paddingVertical: 4 },
  textInput: { fontSize: 16, paddingVertical: 8, minHeight: 40 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
  },
  rowLabelContainer: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowLabel: { fontSize: 16, fontWeight: "500" },
  rowValue: { fontSize: 16, fontWeight: "600" },
  paymentToggleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  paymentBankValue: { alignItems: "flex-end", flex: 1, marginLeft: 12 },
  bankLogoFrame: {
    alignItems: "center",
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    overflow: "hidden",
    width: 24,
  },
  bankLogo: { height: 24, width: 24 },
  bankPickerItem: { alignItems: "center", flexDirection: "row", gap: 12 },
  bankPickerLogoFrame: {
    alignItems: "center",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    overflow: "hidden",
    width: 38,
  },
  bankPickerLogo: { height: 38, width: 38 },
  bankPickerCopy: { flex: 1 },
  saveButton: {
    marginTop: 32,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: { fontSize: 18, fontWeight: "bold" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  datePickerContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
  },
  datePickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  datePickerTitle: { marginBottom: 0 },
  datePickerAction: { fontSize: 16, fontWeight: "700" },
  datePicker: { alignSelf: "stretch" },
  pickerItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 8,
  },
  pickerItemText: { fontSize: 16, fontWeight: "600" },
  pickerItemSubtext: { fontSize: 12, marginTop: 4 },
});
