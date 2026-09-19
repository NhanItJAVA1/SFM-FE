import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AccountType, FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";

const accountTypes: { label: string; value: AccountType }[] = [
  { label: "Cash", value: "Cash" },
  { label: "Bank", value: "Bank" },
  // { label: 'E-Wallet', value: 'EWallet' },
  // { label: 'Credit Card', value: 'CreditCard' },
  { label: "Savings", value: "Savings" },
];

// Các lựa chọn hiển thị ở bước đầu; giá trị `value` được dùng để khởi tạo form.
const walletTypeOptions: { label: string; value: AccountType; color: string; icon: string }[] = [
  { label: "Ví cơ bản", value: "Cash", color: "#2abd4b", icon: "▰" },
  { label: "Ví liên kết", value: "Bank", color: "#18cdb0", icon: "▤" },
  { label: "Ví tiết kiệm", value: "Savings", color: "#f05b5b", icon: "◎" },
];

type AccountView = "wallets" | "add-options" | "create";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("vi-VN", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export default function AccountScreen() {
  // `view` điều khiển ba trạng thái màn hình: danh sách ví, chọn loại ví và form tạo ví.
  const [view, setView] = useState<AccountView>("wallets");
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("Cash");
  const [currency, setCurrency] = useState("VND");
  const [initialBalance, setInitialBalance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openAccountMenu, setOpenAccountMenu] = useState<number | null>(null);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);

  // Tổng số dư chỉ được tính lại khi danh sách tài khoản thay đổi.
  const totalBalance = useMemo(
    () => accounts.reduce((total, account) => total + account.initialBalance, 0),
    [accounts],
  );

  // Tải lại danh sách ví, đồng thời phân biệt loading lần đầu với pull-to-refresh.
  const loadAccounts = useCallback(async (mode: "loading" | "refreshing" = "loading") => {
    try {
      if (mode === "refreshing") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const response = await financialAccountApi.list();
      setAccounts(response.data);
    } catch (error) {
      Alert.alert("Không tải được ví", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Chỉ gọi API khi đang ở màn hình danh sách; các màn hình form không cần tải lại dữ liệu.
    if (view !== "wallets") {
      return undefined;
    }

    const timeoutId = setTimeout(() => loadAccounts(), 0);

    return () => clearTimeout(timeoutId);
  }, [loadAccounts, view]);

  function handleEditAccount(account: FinancialAccount) {
    // Nạp dữ liệu ví vào form dùng chung cho cả tạo mới và cập nhật.
    setEditingAccount(account);
    setName(account.name);
    setType(account.type);
    setCurrency(account.currency);
    setInitialBalance(String(account.initialBalance));
    setOpenAccountMenu(null);
    setView("create");
  }

  async function handleSaveAccount() {
    // Chuẩn hóa dữ liệu nhập trước khi kiểm tra và gửi lên API.
    const trimmedName = name.trim();
    const trimmedCurrency = currency.trim().toUpperCase();
    const normalizedBalance = initialBalance.trim().replace(/,/g, "");
    const parsedBalance = Number(normalizedBalance || "0");

    // Dừng sớm để tránh gửi request khi dữ liệu form chưa hợp lệ.
    if (!trimmedName) {
      Alert.alert("Thiếu tên ví", "Vui lòng nhập tên ví.");
      return;
    }

    if (!trimmedCurrency) {
      Alert.alert("Thiếu tiền tệ", "Vui lòng nhập mã tiền tệ, ví dụ VND.");
      return;
    }

    if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
      Alert.alert("Số dư không hợp lệ", "Số dư ban đầu phải là số lớn hơn hoặc bằng 0.");
      return;
    }

    try {
      // Khóa nút LƯU trong thời gian request để tránh gửi trùng dữ liệu.
      setIsSubmitting(true);
      if (editingAccount) {
        await financialAccountApi.update(editingAccount.id, {
          name: trimmedName,
          type,
          currency: trimmedCurrency,
          isActive: editingAccount.isActive,
        });
      } else {
        await financialAccountApi.create({
          name: trimmedName,
          type,
          currency: trimmedCurrency,
          initialBalance: parsedBalance,
        });
      }
      setName("");
      setType("Cash");
      setCurrency("VND");
      setInitialBalance("");
      setEditingAccount(null);
      setView("wallets");
    } catch (error) {
      Alert.alert(
        editingAccount ? "Cập nhật ví thất bại" : "Tạo ví thất bại",
        error instanceof Error ? error.message : "Không thể lưu ví.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteAccount(account: FinancialAccount) {
    try {
      await financialAccountApi.delete(account.id);
      setAccounts((currentAccounts) => currentAccounts.filter((item) => item.id !== account.id));
    } catch (error) {
      Alert.alert("Xóa ví thất bại", error instanceof Error ? error.message : "Không thể xóa ví.");
    }
  }

  function handleDeleteAccount(account: FinancialAccount) {
    setOpenAccountMenu(null);
    Alert.alert("Xóa ví", `Bạn có chắc muốn xóa ví "${account.name}" không?`, [
      { text: "Hủy", style: "cancel" },
      { text: "Xóa", style: "destructive", onPress: () => void deleteAccount(account) },
    ]);
  }

  function handleCloseForm() {
    setEditingAccount(null);
    setView("add-options");
  }

  // Bước chọn loại ví trước khi mở form chi tiết.
  if (view === "add-options") {
    return (
      <View style={styles.screen}>
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView("wallets")} hitSlop={12}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <Text style={styles.topTitle}>Thêm Ví</Text>
          <View style={styles.topSpacer} />
        </View>
        <View style={styles.addOptionsPanel}>
          <Text style={styles.addOptionsTitle}>Thêm ví</Text>
          <View style={styles.addOptionsGrid}>
            {walletTypeOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.addOption, { backgroundColor: option.color }]}
                onPress={() => {
                  setType(option.value);
                  setView("create");
                }}
              >
                <Text style={styles.addOptionTitle}>{option.label}</Text>
                <Text style={styles.addOptionIcon}>{option.icon}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // Form nhập thông tin ví mới hoặc chỉnh sửa ví hiện tại.
  if (view === "create") {
    return (
      <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", default: undefined })} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <Pressable onPress={handleCloseForm} hitSlop={12}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
            <Text style={styles.topTitle}>{editingAccount ? "Sửa ví" : "Thêm ví"}</Text>
            <Pressable onPress={handleSaveAccount} disabled={isSubmitting}>
              <Text style={styles.saveText}>LƯU</Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Tên Ví</Text>
              <TextInput
                placeholder="Cash wallet"
                placeholderTextColor="#6f7682"
                style={styles.input}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Loại tài khoản</Text>
              <View style={styles.typeGrid}>
                {accountTypes.map((accountType) => {
                  const isSelected = accountType.value === type;

                  return (
                    <Pressable
                      key={accountType.value}
                      style={[styles.typeOption, isSelected && styles.typeOptionSelected]}
                      onPress={() => setType(accountType.value)}
                    >
                      <Text style={[styles.typeOptionText, isSelected && styles.typeOptionTextSelected]}>
                        {accountType.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.currencyField]}>
                <Text style={styles.label}>Tiền tệ</Text>
                <TextInput
                  autoCapitalize="characters"
                  maxLength={3}
                  placeholder="VND"
                  placeholderTextColor="#6f7682"
                  style={styles.input}
                  value={currency}
                  onChangeText={setCurrency}
                />
              </View>

              <View style={[styles.field, styles.balanceField]}>
                <Text style={styles.label}>Số dư ban đầu</Text>
                <TextInput
                  editable={!editingAccount}
                  keyboardType="decimal-pad"
                  placeholder="1000000"
                  placeholderTextColor="#6f7682"
                  style={[styles.input, editingAccount && styles.inputDisabled]}
                  value={initialBalance}
                  onChangeText={setInitialBalance}
                />
              </View>
            </View>

            <View style={styles.formHint}>
              <Text style={styles.formHintTitle}>
                {editingAccount ? "Đang chỉnh sửa ví" : `Đang tạo ${type === "Savings" ? "Ví tiết kiệm" : "Ví mới"}`}
              </Text>
              <Text style={styles.formHintText}>
                {editingAccount
                  ? "Số dư ban đầu không thay đổi khi cập nhật thông tin ví."
                  : "Thông tin sẽ được lưu vào FinancialAccounts."}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Màn hình mặc định: tổng số dư, danh sách ví và thao tác thêm ví.
  if (view === "wallets") {
    return (
      <View style={styles.screen}>
        <View style={styles.walletHeader}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.topTitle}>Ví của tôi</Text>
          <View style={styles.headerTools}>
            <Text style={styles.filterIcon}>☰</Text>
            <Text style={styles.searchIcon}>⌕</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.walletList}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => loadAccounts("refreshing")} tintColor="#fff" />
          }
        >
          <View style={styles.balanceSummary}>
            <Text style={styles.summaryLabel}>Tổng số dư</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalBalance, accounts[0]?.currency ?? "VND")}</Text>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#31c452" />
          ) : accounts.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có Ví nào. Bấm + để thêm Ví đầu tiên.</Text>
          ) : (
            // Menu thao tác của từng ví được mở độc lập theo `account.id`.
            accounts.map((account) => (
              <View
                key={account.id}
                style={[styles.walletCard, openAccountMenu === account.id && styles.walletCardOpen]}
              >
                <View style={styles.walletIcon}>
                  <Text style={styles.walletIconText}>▣</Text>
                </View>
                <View style={styles.walletInfo}>
                  <Text style={styles.walletName}>{account.name}</Text>
                  <Text style={styles.walletType}>{account.type}</Text>
                </View>
                <View style={styles.walletRight}>
                  <Text style={styles.walletBalance}>{formatMoney(account.initialBalance, account.currency)}</Text>
                  <Pressable
                    style={styles.moreButton}
                    onPress={() => setOpenAccountMenu(openAccountMenu === account.id ? null : account.id)}
                  >
                    <Text style={styles.moreText}>⋯</Text>
                  </Pressable>
                </View>
                {openAccountMenu === account.id && (
                  <View style={styles.accountMenu}>
                    <Pressable
                      style={({ pressed }) => [styles.accountMenuItem, pressed && styles.accountMenuItemPressed]}
                      onPress={() => setOpenAccountMenu(null)}
                    >
                      <Text style={styles.accountMenuText}>★ Đặt làm ví mặc định</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.accountMenuItem, pressed && styles.accountMenuItemPressed]}
                      onPress={() => setOpenAccountMenu(null)}
                    >
                      <Text style={styles.accountMenuText}>↔ Chuyển tiền đến ví khác</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.accountMenuItem, pressed && styles.accountMenuItemPressed]}
                      onPress={() => handleEditAccount(account)}
                    >
                      <Text style={styles.accountMenuText}>□ Sửa</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.accountMenuItem, pressed && styles.accountMenuItemPressed]}
                      onPress={() => handleDeleteAccount(account)}
                    >
                      <Text style={[styles.accountMenuText, styles.deleteMenuText]}>♧ Xóa</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
        <Pressable style={styles.floatingAddButton} onPress={() => setView("add-options")}>
          <Text style={styles.floatingAddText}>+</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f8fa" },
  content: { padding: 24, paddingBottom: 96 },
  walletHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  backText: { color: "#31c452", fontSize: 17, fontWeight: "700" },
  closeText: { color: "#252a33", fontSize: 32, fontWeight: "300", lineHeight: 34 },
  saveText: { color: "#252a33", fontSize: 14, fontWeight: "800" },
  topTitle: { color: "#171a21", fontSize: 22, fontWeight: "700" },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 32,
  },
  topSpacer: { width: 82 },
  headerTools: { alignItems: "center", flexDirection: "row", gap: 22, width: 72 },
  filterIcon: { color: "#252a33", fontSize: 21, transform: [{ rotate: "90deg" }] },
  searchIcon: { color: "#252a33", fontSize: 27 },
  walletList: { gap: 14, padding: 20, paddingBottom: 96 },
  balanceSummary: { paddingBottom: 0, paddingTop: 0 },
  summaryLabel: { color: "#9698a1", fontSize: 14, marginBottom: 4 },
  summaryValue: { color: "#171a21", fontSize: 26, fontWeight: "700" },
  walletCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e5e8ed",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 78,
    padding: 16,
  },
  walletCardOpen: {
    borderColor: "#31c452",
    elevation: 8,
    shadowOpacity: 0.1,
    zIndex: 10,
  },
  walletIcon: {
    alignItems: "center",
    backgroundColor: "#f3f5f7",
    borderColor: "#e1e5e9",
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    marginRight: 14,
    width: 40,
  },
  walletIconText: { color: "#252a33", fontSize: 20 },
  walletInfo: { flex: 1 },
  walletName: { color: "#252a33", fontSize: 18, fontWeight: "700" },
  walletType: { color: "#9698a1", fontSize: 14, marginTop: 3 },
  walletBalance: { color: "#252a33", fontSize: 16, fontWeight: "700" },
  walletRight: { alignItems: "flex-end", gap: 12 },
  moreButton: {
    alignItems: "center",
    backgroundColor: "#f3f5f7",
    borderColor: "#e1e5e9",
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  moreText: { color: "#252a33", fontSize: 22, lineHeight: 17 },
  accountMenu: {
    backgroundColor: "#fff",
    borderColor: "#e5e8ed",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 12,
    minWidth: 236,
    paddingVertical: 6,
    position: "absolute",
    right: 8,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    top: 62,
    zIndex: 20,
  },
  accountMenuItem: { minHeight: 42, justifyContent: "center", paddingHorizontal: 16 },
  accountMenuItemPressed: { backgroundColor: "#f1f8f2" },
  accountMenuText: { color: "#252a33", fontSize: 15, lineHeight: 19 },
  deleteMenuText: { color: "#d64545" },
  floatingAddButton: {
    alignItems: "center",
    backgroundColor: "#28bd4e",
    borderRadius: 28,
    bottom: 34,
    elevation: 8,
    height: 56,
    justifyContent: "center",
    position: "absolute",
    right: 18,
    shadowColor: "#000",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    width: 56,
  },
  floatingAddText: { color: "#fff", fontSize: 32, fontWeight: "300", lineHeight: 36 },
  addOptionsPanel: { backgroundColor: "#fff", marginTop: 322, padding: 16 },
  addOptionsTitle: { color: "#252a33", fontSize: 20, fontWeight: "800", marginBottom: 28 },
  addOptionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  addOption: {
    borderRadius: 8,
    height: 95,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: 14,
    width: "49%",
  },
  addOptionTitle: { color: "#fff", fontSize: 19, fontWeight: "800", maxWidth: 120 },
  addOptionIcon: { alignSelf: "flex-end", color: "#ffffff55", fontSize: 42, lineHeight: 42 },
  formHint: {
    backgroundColor: "#fff",
    borderColor: "#e5e8ed",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 16,
  },
  formHintTitle: { color: "#252a33", fontSize: 15, fontWeight: "700" },
  formHintText: { color: "#9698a1", fontSize: 13, marginTop: 5 },
  emptyText: { color: "#9698a1", fontSize: 16, lineHeight: 23, marginTop: 18, textAlign: "center" },
  form: { gap: 18, paddingTop: 28 },
  field: { gap: 8 },
  label: { color: "#f4f6f8", fontSize: 14, fontWeight: "700" },
  input: {
    backgroundColor: "#fff",
    borderColor: "#dfe3e8",
    borderRadius: 8,
    borderWidth: 1,
    color: "#252a33",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputDisabled: { backgroundColor: "#eef0f2", color: "#9698a1" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  typeOption: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#dfe3e8",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 104,
    paddingHorizontal: 14,
  },
  typeOptionSelected: { backgroundColor: "#31c452", borderColor: "#31c452" },
  typeOptionText: { color: "#c8cbd2", fontWeight: "700" },
  typeOptionTextSelected: { color: "#fff" },
  row: { flexDirection: "row", gap: 12 },
  currencyField: { flex: 0.8 },
  balanceField: { flex: 1.4 },
  buttonDisabled: { opacity: 0.7 },
});
