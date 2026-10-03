import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Google from "expo-auth-session/providers/google";
import * as ImagePicker from "expo-image-picker";
import { router, useNavigation } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { authApi } from "@/api/authApi";
import { FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";
import { financialInsightsApi, FinancialInsightsResponse } from "@/api/financialInsightsApi";
import { CategorySpendingItem, CategorySpendingResponse, transactionsApi } from "@/api/transactionsApi";
import { usersApi } from "@/api/usersApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { SpendingDonutChart, SpendingDonutSegment } from "@/components/spending-donut-chart";
import { ThemeModeIconFrame, useThemeModeTransition } from "@/components/theme-mode-transition";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { getAuthRefreshToken, getAuthUser } from "@/stores/authSession";
import { clearAuthSession, updatePersistedAuthUser } from "@/stores/persistedAuthSession";
import {
  clearSpendingStatsFromTransactions,
  consumePendingSpendingStatsRequest,
  getSpendingStatsReturnPath,
  subscribeSpendingStatsRequest,
} from "@/stores/spendingStatsNavigation";
import { subscribeUserTabPress } from "@/stores/userTabPress";
import type { AppTheme } from "@/theme/appTheme";
import { exportTransactionsFile } from "@/utils/transactionExportFile";

WebBrowser.maybeCompleteAuthSession();

type UserView = "menu" | "manage" | "editProfile" | "spendingStats" | "exportFile" | "resetWarning" | "resetPassword";
type SpendingStatsReturnPath = "/(tabs)/transactions";
type ExportDateField = "fromDate" | "toDate";
type TabsNavigation = {
  jumpTo?: (screen: string) => void;
  navigate: (screen: string) => void;
};

const chartColors = ["#8e7cf4", "#ffb14a", "#31c48d", "#f06292", "#60a5fa", "#facc15", "#9ca3af"];
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const googleClientIdForPlatform = Platform.select({
  android: googleAndroidClientId,
  default: googleWebClientId,
  ios: googleIosClientId,
});

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("vi-VN", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function getPreviousMonth(month: number, year: number) {
  if (month === 1) {
    return { month: 12, year: year - 1 };
  }

  return { month: month - 1, year };
}

function formatChange(value: number | null) {
  if (value === null) {
    return "Mới";
  }

  const prefix = value > 0 ? "↑" : value < 0 ? "↓" : "";

  return `${prefix} ${Math.abs(value).toFixed(1)}%`.trim();
}

function getCategoryKey(category: CategorySpendingItem) {
  return category.categoryId === null ? `uncategorized-${category.categoryName}` : String(category.categoryId);
}

function getPeriodLabel(month: number, year: number, currentMonth: number, currentYear: number) {
  if (month === currentMonth && year === currentYear) {
    return "Tháng này";
  }

  return `Tháng ${month}/${year}`;
}

function getNextMonth(month: number, year: number) {
  if (month === 12) {
    return { month: 1, year: year + 1 };
  }

  return { month: month + 1, year };
}

function getCurrentMonthExportRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return { fromDate: start, toDate: new Date(end.getTime() - 1) };
}

function normalizeDateStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function normalizeDateEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatExportDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}`;
}

function formatSignedMoney(current: number, compare: number) {
  const difference = current - compare;
  const sign = difference > 0 ? "+" : difference < 0 ? "-" : "";

  return `${sign}${formatMoney(Math.abs(difference), "VND")}`;
}

function getFinancialInsightIcon(type: string) {
  const normalizedType = type.toLowerCase();

  if (normalizedType.includes("increase")) {
    return "↗";
  }

  if (normalizedType.includes("decrease")) {
    return "↘";
  }

  if (normalizedType.includes("warning") || normalizedType.includes("risk")) {
    return "!";
  }

  return "i";
}

function getS3ErrorCode(detail: string) {
  return detail.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? null;
}

function getAvatarCacheKey(avatarUrl: string | null | undefined) {
  return avatarUrl ?? "avatar-empty";
}

function getSignedHeaders(uploadUrl: string) {
  try {
    return new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders")?.toLowerCase().split(";") ?? [];
  } catch {
    return [];
  }
}

export default function UserScreen() {
  const [user, setUser] = useState(() => getAuthUser());
  const tabsNavigation = useNavigation<TabsNavigation>();
  const theme = useAppTheme();
  const themeMode = useThemeMode();
  const isDarkMode = themeMode === "dark";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { iconAnimatedStyle, toggleThemeMode, transitionOverlay } = useThemeModeTransition({
    screenColor: theme.screen,
    themeMode,
  });
  const initial = (user?.displayName ?? user?.username ?? "U").trim().charAt(0).toUpperCase() || "U";
  const [editDisplayName, setEditDisplayName] = useState(user?.displayName ?? "");
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [selectedAvatar, setSelectedAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isResettingAccount, setIsResettingAccount] = useState(false);
  const [isGoogleResettingAccount, setIsGoogleResettingAccount] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [isExportingTransactions, setIsExportingTransactions] = useState(false);
  const [exportAccounts, setExportAccounts] = useState<FinancialAccount[]>([]);
  const [isLoadingExportAccounts, setIsLoadingExportAccounts] = useState(false);
  const [selectedExportAccountId, setSelectedExportAccountId] = useState<number | null>(null);
  const [activeExportDateField, setActiveExportDateField] = useState<ExportDateField | null>(null);
  const today = new Date();
  const defaultMonth = today.getMonth() + 1;
  const defaultYear = today.getFullYear();
  const defaultExportRange = useMemo(() => getCurrentMonthExportRange(), []);
  const [exportFromDate, setExportFromDate] = useState(defaultExportRange.fromDate);
  const [exportToDate, setExportToDate] = useState(defaultExportRange.toDate);
  const initialStatsReturnPath = useMemo(() => {
    const pendingRequest = consumePendingSpendingStatsRequest();

    return pendingRequest ? (getSpendingStatsReturnPath() ?? "/(tabs)/transactions") : null;
  }, []);
  const [view, setView] = useState<UserView>(initialStatsReturnPath ? "spendingStats" : "menu");
  const [statsMonth, setStatsMonth] = useState(defaultMonth);
  const [statsYear, setStatsYear] = useState(defaultYear);
  const [spendingStats, setSpendingStats] = useState<CategorySpendingResponse | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [financialInsights, setFinancialInsights] = useState<FinancialInsightsResponse | null>(null);
  const [isLoadingFinancialInsights, setIsLoadingFinancialInsights] = useState(false);
  const [financialInsightsError, setFinancialInsightsError] = useState<string | null>(null);
  const [isFinancialInsightsVisible, setIsFinancialInsightsVisible] = useState(false);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [statsReturnPath, setStatsReturnPath] = useState<SpendingStatsReturnPath | null>(initialStatsReturnPath);
  const [googleResetRequest, googleResetResponse, promptGoogleReset] = Google.useIdTokenAuthRequest({
    androidClientId: googleAndroidClientId,
    iosClientId: googleIosClientId,
    selectAccount: true,
    webClientId: googleWebClientId,
  });

  const isCurrentStatsPeriod = statsMonth === defaultMonth && statsYear === defaultYear;
  const canGoNextStatsPeriod = !isCurrentStatsPeriod;
  const statsPeriodLabel = getPeriodLabel(statsMonth, statsYear, defaultMonth, defaultYear);
  const chartData = useMemo<SpendingDonutSegment[]>(() => {
    if (!spendingStats) {
      return [];
    }

    return (spendingStats.categories ?? [])
      .filter((category) => category.amount > 0)
      .map((category, index) => ({
        amount: category.amount,
        color: chartColors[index % chartColors.length],
        key: getCategoryKey(category),
        label: category.categoryName,
        percentage: category.percentage,
      }));
  }, [spendingStats]);
  const activeExportDate = activeExportDateField === "toDate" ? exportToDate : exportFromDate;

  useEffect(() => {
    return subscribeUserTabPress(() => {
      setStatsReturnPath(null);
      setView("menu");
    });
  }, []);

  const openSpendingStatsFromTransactions = useCallback(() => {
    setStatsReturnPath(getSpendingStatsReturnPath() ?? "/(tabs)/transactions");
    setStatsMonth(defaultMonth);
    setStatsYear(defaultYear);
    setIsFinancialInsightsVisible(false);
    setView("spendingStats");
  }, [defaultMonth, defaultYear]);

  useEffect(() => {
    const unsubscribe = subscribeSpendingStatsRequest(() => {
      consumePendingSpendingStatsRequest();
      openSpendingStatsFromTransactions();
    });

    return () => {
      unsubscribe();
    };
  }, [openSpendingStatsFromTransactions]);

  const loadSpendingStats = useCallback(async () => {
    try {
      setIsLoadingStats(true);
      const response = await transactionsApi.categorySpending(
        statsMonth === defaultMonth && statsYear === defaultYear ? {} : { month: statsMonth, year: statsYear },
      );
      setSpendingStats(
        response.data
          ? { ...response.data, categories: Array.isArray(response.data.categories) ? response.data.categories : [] }
          : null,
      );
      setSelectedCategoryKey(null);
    } catch (error) {
      Alert.alert("Không tải được thống kê", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsLoadingStats(false);
    }
  }, [defaultMonth, defaultYear, statsMonth, statsYear]);

  const loadFinancialInsights = useCallback(async () => {
    try {
      setIsLoadingFinancialInsights(true);
      setFinancialInsightsError(null);
      const response = await financialInsightsApi.get({ month: statsMonth, year: statsYear });

      setFinancialInsights(
        response.data
          ? { ...response.data, insights: Array.isArray(response.data.insights) ? response.data.insights : [] }
          : null,
      );
    } catch (error) {
      console.warn("Không tải được financial insights", error);
      setFinancialInsights(null);
      setFinancialInsightsError(error instanceof Error ? error.message : "Không tải được nhận xét AI.");
    } finally {
      setIsLoadingFinancialInsights(false);
    }
  }, [statsMonth, statsYear]);

  useEffect(() => {
    if (view === "spendingStats") {
      const timeoutId = setTimeout(() => {
        loadSpendingStats();
      }, 0);

      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [loadSpendingStats, view]);

  useEffect(() => {
    if (view !== "spendingStats" || !isFinancialInsightsVisible) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      loadFinancialInsights();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [isFinancialInsightsVisible, loadFinancialInsights, view]);

  const loadExportAccounts = useCallback(async () => {
    try {
      setIsLoadingExportAccounts(true);
      const response = await financialAccountApi.list();
      setExportAccounts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      Alert.alert("Không tải được ví", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsLoadingExportAccounts(false);
    }
  }, []);

  const resetAccountData = useCallback(async (payload: { password: string; idToken: string }) => {
    try {
      setIsResettingAccount(true);
      await usersApi.resetMyData(payload);
      setResetPassword("");
      setView("menu");
      router.replace("/(tabs)/home");
      Alert.alert("Đã đặt lại tài khoản", "Dữ liệu tài chính của bạn đã được làm mới.");
    } catch (error) {
      Alert.alert(
        "Không thể đặt lại tài khoản",
        error instanceof Error ? error.message : "Vui lòng kiểm tra thông tin xác nhận và thử lại.",
      );
    } finally {
      setIsResettingAccount(false);
      setIsGoogleResettingAccount(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "exportFile") {
      return;
    }

    loadExportAccounts();
  }, [loadExportAccounts, view]);

  useEffect(() => {
    if (!isGoogleResettingAccount || googleResetResponse?.type !== "success") {
      return;
    }

    const idToken = googleResetResponse.params.id_token;

    if (!idToken) {
      setIsGoogleResettingAccount(false);
      Alert.alert("Không thể xác nhận Google", "Google không trả về ID token.");
      return;
    }

    resetAccountData({ idToken, password: "" });
  }, [googleResetResponse, isGoogleResettingAccount, resetAccountData]);

  function goPreviousStatsPeriod() {
    const previous = getPreviousMonth(statsMonth, statsYear);
    setStatsMonth(previous.month);
    setStatsYear(previous.year);
  }

  function goNextStatsPeriod() {
    if (!canGoNextStatsPeriod) {
      return;
    }

    const next = getNextMonth(statsMonth, statsYear);
    setStatsMonth(next.month);
    setStatsYear(next.year);
  }

  function handleSelectCategory(key: string) {
    setSelectedCategoryKey(key);
  }

  function toggleFinancialInsights() {
    setIsFinancialInsightsVisible((isVisible) => !isVisible);
  }

  function closeSpendingStats() {
    const returnPath = statsReturnPath ?? getSpendingStatsReturnPath();

    if (returnPath) {
      setStatsReturnPath(null);
      clearSpendingStatsFromTransactions();
      setView("menu");
      if (tabsNavigation.jumpTo) {
        tabsNavigation.jumpTo("transactions");
      } else {
        tabsNavigation.navigate("transactions");
      }
      return;
    }

    setStatsReturnPath(null);
    clearSpendingStatsFromTransactions();
    setView("menu");
  }

  function openEditProfile() {
    setEditDisplayName(user?.displayName ?? "");
    setEditAvatarUrl(user?.avatarUrl ?? null);
    setSelectedAvatar(null);
    setView("editProfile");
  }

  function openExportFile() {
    setView("exportFile");
  }

  function openResetWarning() {
    setResetPassword("");
    setView("resetWarning");
  }

  function openResetPassword() {
    setResetPassword("");
    setView("resetPassword");
  }

  function closeExportDatePicker() {
    setActiveExportDateField(null);
  }

  function handlePickExportDate(event: DateTimePickerEvent, pickedDate?: Date) {
    if (Platform.OS === "android") {
      closeExportDatePicker();
    }

    if (event.type === "dismissed" || !pickedDate || !activeExportDateField) {
      return;
    }

    if (activeExportDateField === "fromDate") {
      const nextFromDate = normalizeDateStart(pickedDate);
      setExportFromDate(nextFromDate);

      if (nextFromDate.getTime() > exportToDate.getTime()) {
        setExportToDate(normalizeDateEnd(pickedDate));
      }
      return;
    }

    const nextToDate = normalizeDateEnd(pickedDate);
    setExportToDate(nextToDate);

    if (nextToDate.getTime() < exportFromDate.getTime()) {
      setExportFromDate(normalizeDateStart(pickedDate));
    }
  }

  async function handlePickAvatar() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert("Cần quyền truy cập ảnh", "Vui lòng cấp quyền thư viện ảnh để đổi avatar.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    setSelectedAvatar(asset);
    setEditAvatarUrl(asset.uri);
  }

  async function uploadAvatar(asset: ImagePicker.ImagePickerAsset) {
    const imageResponse = await fetch(asset.uri);
    const imageBlob = await imageResponse.blob();
    const contentType = imageBlob.type || asset.mimeType || "image/jpeg";
    const extension = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1] || "jpg";
    const fileName = asset.fileName ?? `avatar.${extension}`;
    const uploadUrlResponse = await usersApi.createAvatarUploadUrl({ contentType, fileName });
    const signedHeaders = getSignedHeaders(uploadUrlResponse.data.uploadUrl);
    const headers = signedHeaders.includes("content-type") ? { "Content-Type": contentType } : undefined;
    const s3Response = await fetch(uploadUrlResponse.data.uploadUrl, {
      method: "PUT",
      headers,
      body: imageBlob,
    });

    if (!s3Response.ok) {
      const detail = await s3Response.text();
      const s3ErrorCode = getS3ErrorCode(detail);
      const statusText = s3Response.statusText ? ` ${s3Response.statusText}` : "";
      console.warn("Upload avatar lên S3 thất bại", {
        contentType,
        detail,
        fileName,
        s3ErrorCode,
        signedHeaders,
        status: s3Response.status,
        statusText: s3Response.statusText,
      });
      throw new Error(
        s3ErrorCode
          ? `Upload S3 lỗi ${s3Response.status}: ${s3ErrorCode}.`
          : `Upload S3 lỗi ${s3Response.status}${statusText}.`,
      );
    }

    return uploadUrlResponse.data.publicUrl;
  }

  async function handleSaveProfile() {
    if (!user) {
      Alert.alert("Chưa có người dùng", "Vui lòng đăng nhập lại để cập nhật hồ sơ.");
      return;
    }

    try {
      setIsSavingProfile(true);
      const nextAvatarUrl = selectedAvatar ? await uploadAvatar(selectedAvatar) : editAvatarUrl;
      const nextDisplayName = editDisplayName.trim() || null;

      await usersApi.update(user.id, {
        avatarUrl: nextAvatarUrl,
        displayName: nextDisplayName,
        email: user.email,
      });

      const nextUserResponse = await usersApi.get(user.id);
      const nextUser = nextUserResponse.data;

      await updatePersistedAuthUser(nextUser);
      setUser(nextUser);
      setSelectedAvatar(null);
      setView("menu");
      Alert.alert("Đã cập nhật", "Hồ sơ người dùng đã được lưu.");
    } catch (error) {
      console.warn("Không lưu được hồ sơ", error);
      Alert.alert("Không lưu được hồ sơ", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleExportFile() {
    try {
      setIsExportingTransactions(true);
      const result = await exportTransactionsFile({
        accountId: selectedExportAccountId,
        fromDate: exportFromDate.toISOString(),
        toDate: exportToDate.toISOString(),
      });

      if (result.fileUri && !result.shared) {
        Alert.alert("Đã xuất file", `File đã được lưu tạm tại ${result.fileUri}`);
      }
    } catch (error) {
      Alert.alert("Xuất file thất bại", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsExportingTransactions(false);
    }
  }

  async function handleResetAccountData() {
    if (!resetPassword.trim()) {
      Alert.alert("Thiếu mật khẩu", "Vui lòng nhập mật khẩu để xác nhận.");
      return;
    }

    await resetAccountData({ idToken: "", password: resetPassword });
  }

  async function handleGoogleResetAccountData() {
    if (!googleClientIdForPlatform) {
      Alert.alert("Không thể xác nhận Google", `Thiếu Google client id cho ${Platform.OS}.`);
      return;
    }

    if (!googleResetRequest) {
      Alert.alert("Không thể xác nhận Google", "Google login chưa sẵn sàng, vui lòng thử lại.");
      return;
    }

    try {
      setIsGoogleResettingAccount(true);
      const result = await promptGoogleReset();

      if (result.type !== "success") {
        setIsGoogleResettingAccount(false);
      }
    } catch (error) {
      setIsGoogleResettingAccount(false);
      Alert.alert("Không thể xác nhận Google", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    }
  }

  async function handleLogout() {
    try {
      setIsLoggingOut(true);
      const refreshToken = getAuthRefreshToken();

      await authApi.logout(refreshToken ? { refreshToken } : undefined);
    } catch {
      // Local logout should still proceed if the server cannot clear the refresh token.
    } finally {
      await clearAuthSession();
      setIsLoggingOut(false);
      router.replace("/auth/login");
    }
  }

  if (view === "exportFile") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView("menu")} hitSlop={12}>
            <Text style={styles.backText}>‹ Cá nhân</Text>
          </Pressable>
          <Text style={styles.topTitle}>Xuất File</Text>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.exportContent} keyboardShouldPersistTaps="handled">
          <View style={styles.exportSection}>
            <Text style={styles.exportSectionTitle}>Ví</Text>
            <Pressable
              style={[styles.exportOptionRow, selectedExportAccountId === null && styles.exportOptionRowActive]}
              onPress={() => setSelectedExportAccountId(null)}
            >
              <View style={styles.exportOptionIcon}>
                <Text style={styles.exportOptionIconText}>▰</Text>
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.exportOptionTitle}>Tất cả ví</Text>
                <Text style={styles.exportOptionSubtitle}>Xuất giao dịch của mọi ví</Text>
              </View>
              <Text style={styles.exportOptionCheck}>{selectedExportAccountId === null ? "✓" : ""}</Text>
            </Pressable>

            {isLoadingExportAccounts ? (
              <View style={styles.exportLoadingRow}>
                <ActivityIndicator color={theme.primary} />
                <Text style={styles.exportOptionSubtitle}>Đang tải ví...</Text>
              </View>
            ) : (
              (exportAccounts ?? []).map((account) => {
                const isSelected = selectedExportAccountId === account.id;

                return (
                  <Pressable
                    key={account.id}
                    style={[styles.exportOptionRow, isSelected && styles.exportOptionRowActive]}
                    onPress={() => setSelectedExportAccountId(account.id)}
                  >
                    <View style={styles.exportOptionIcon}>
                      <Text style={styles.exportOptionIconText}>◧</Text>
                    </View>
                    <View style={styles.walletInfo}>
                      <Text style={styles.exportOptionTitle}>{account.name}</Text>
                      <Text style={styles.exportOptionSubtitle}>{account.type}</Text>
                    </View>
                    <Text style={styles.exportOptionCheck}>{isSelected ? "✓" : ""}</Text>
                  </Pressable>
                );
              })
            )}
          </View>

          <View style={styles.exportSection}>
            <Text style={styles.exportSectionTitle}>Thời gian</Text>
            <View style={styles.exportDateGrid}>
              <Pressable style={styles.exportDateCard} onPress={() => setActiveExportDateField("fromDate")}>
                <Text style={styles.exportDateLabel}>Từ ngày</Text>
                <Text style={styles.exportDateValue}>{formatExportDate(exportFromDate)}</Text>
              </Pressable>
              <Pressable style={styles.exportDateCard} onPress={() => setActiveExportDateField("toDate")}>
                <Text style={styles.exportDateLabel}>Đến ngày</Text>
                <Text style={styles.exportDateValue}>{formatExportDate(exportToDate)}</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.primaryButton, isExportingTransactions && styles.buttonDisabled]}
            onPress={handleExportFile}
            disabled={isExportingTransactions}
          >
            {isExportingTransactions ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <Text style={styles.primaryButtonText}>Xuất File</Text>
            )}
          </Pressable>
        </ScrollView>

        {activeExportDateField && Platform.OS === "android" ? (
          <DateTimePicker
            display="default"
            maximumDate={activeExportDateField === "fromDate" ? exportToDate : undefined}
            minimumDate={activeExportDateField === "toDate" ? exportFromDate : undefined}
            mode="date"
            onChange={handlePickExportDate}
            value={activeExportDate}
          />
        ) : null}

        <Modal
          animationType="slide"
          transparent
          visible={activeExportDateField !== null && Platform.OS !== "android"}
          onRequestClose={closeExportDatePicker}
        >
          <Pressable style={styles.bottomSheetOverlay} onPress={closeExportDatePicker}>
            <Pressable style={styles.exportDatePickerSheet} onPress={(event) => event.stopPropagation()}>
              <View style={styles.datePickerHeader}>
                <Pressable onPress={closeExportDatePicker} hitSlop={10}>
                  <Text style={[styles.datePickerAction, { color: theme.textSubtle }]}>Hủy</Text>
                </Pressable>
                <Text style={styles.datePickerTitle}>
                  {activeExportDateField === "fromDate" ? "Chọn ngày bắt đầu" : "Chọn ngày kết thúc"}
                </Text>
                <Pressable onPress={closeExportDatePicker} hitSlop={10}>
                  <Text style={[styles.datePickerAction, { color: theme.primary }]}>Xong</Text>
                </Pressable>
              </View>
              <DateTimePicker
                accentColor={theme.primary}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={activeExportDateField === "fromDate" ? exportToDate : undefined}
                minimumDate={activeExportDateField === "toDate" ? exportFromDate : undefined}
                mode="date"
                onChange={handlePickExportDate}
                style={styles.datePicker}
                textColor={theme.text}
                themeVariant={themeMode}
                value={activeExportDate}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </FocusedScreenTransition>
    );
  }

  if (view === "resetWarning") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView("manage")} hitSlop={12}>
            <Text style={styles.backText}>‹ Quản lý</Text>
          </Pressable>
          <Text style={styles.topTitle}>Đặt lại tài khoản</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.resetScreenBody}>
          <ScrollView contentContainerStyle={styles.resetWarningContent}>
            <View style={styles.resetWarningHero}>
              <Text style={styles.resetWarningIcon}>!</Text>
              <Text style={styles.resetWarningTitle}>Hành động này sẽ xóa Vĩnh Viễn dữ liệu tài chính hiện tại</Text>
              <Text style={styles.resetWarningText}>
                Tài khoản đăng nhập vẫn được giữ, nhưng dữ liệu bên dưới sẽ được làm mới và không thể hoàn tác.
              </Text>
            </View>

            <View style={styles.resetImpactCard}>
              {[
                "Xóa tất cả ví",
                "Xóa tất cả giao dịch và chi tiết hóa đơn",
                "Xóa tất cả ngân sách và cảnh báo ngân sách",
                "Xóa tất cả danh mục tự tạo",
              ].map((item) => (
                <View key={item} style={styles.resetImpactRow}>
                  <Text style={styles.resetImpactBullet}>×</Text>
                  <Text style={styles.resetImpactText}>{item}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.resetFooter}>
            <Pressable style={styles.dangerButton} onPress={openResetPassword}>
              <Text style={styles.dangerButtonText}>Tiếp tục</Text>
            </Pressable>
          </View>
        </View>
      </FocusedScreenTransition>
    );
  }

  if (view === "resetPassword") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", default: undefined })} style={styles.screen}>
          <View style={styles.walletHeader}>
            <Pressable onPress={() => setView("resetWarning")} hitSlop={12}>
              <Text style={styles.backText}>‹ Cảnh báo</Text>
            </Pressable>
            <Text style={styles.topTitle}>Xác nhận</Text>
            <View style={styles.topSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.resetPasswordContent} keyboardShouldPersistTaps="handled">
            <View style={styles.resetConfirmCard}>
              <Text style={styles.resetConfirmTitle}>Nhập mật khẩu để xác nhận</Text>
              <Text style={styles.resetConfirmText}>
                Dùng mật khẩu cho tài khoản thường, hoặc xác nhận bằng Google nếu tài khoản của bạn đăng nhập OAuth.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>Mật khẩu</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isResettingAccount}
                  onChangeText={setResetPassword}
                  placeholder="Nhập mật khẩu hiện tại"
                  placeholderTextColor={theme.inputPlaceholder}
                  secureTextEntry
                  style={styles.input}
                  value={resetPassword}
                />
              </View>

              <View style={styles.resetAuthDividerRow}>
                <View style={styles.resetAuthDividerLine} />
                <Text style={styles.resetAuthDividerText}>hoặc</Text>
                <View style={styles.resetAuthDividerLine} />
              </View>

              <Pressable
                style={[
                  styles.googleResetButton,
                  (isResettingAccount || isGoogleResettingAccount) && styles.buttonDisabled,
                ]}
                onPress={handleGoogleResetAccountData}
                disabled={isResettingAccount || isGoogleResettingAccount}
              >
                {isGoogleResettingAccount ? (
                  <ActivityIndicator color={theme.text} />
                ) : (
                  <>
                    <Text style={styles.googleResetIcon}>G</Text>
                    <Text style={styles.googleResetText}>Xác nhận bằng Google</Text>
                  </>
                )}
              </Pressable>
            </View>

            <Pressable
              style={[styles.dangerButton, (isResettingAccount || isGoogleResettingAccount) && styles.buttonDisabled]}
              onPress={handleResetAccountData}
              disabled={isResettingAccount || isGoogleResettingAccount}
            >
              {isResettingAccount ? (
                <ActivityIndicator color={theme.textInverse} />
              ) : (
                <Text style={styles.dangerButtonText}>Đặt lại tài khoản</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </FocusedScreenTransition>
    );
  }

  if (view === "manage") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView("menu")} hitSlop={12}>
            <Text style={styles.backText}>‹ Người dùng</Text>
          </Pressable>
          <Text style={styles.topTitle}>Quản lý người dùng</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.manageContent}>
          <View style={styles.profileMiniCard}>
            <View style={styles.smallAvatar}>
              {user?.avatarUrl ? (
                <Image
                  key={getAvatarCacheKey(user.avatarUrl)}
                  source={{ uri: user.avatarUrl }}
                  style={styles.smallAvatarImage}
                  onError={(event) => console.warn("Không tải được avatar nhỏ", event.nativeEvent)}
                />
              ) : (
                <Text style={styles.smallAvatarText}>{initial}</Text>
              )}
            </View>
            <View style={styles.manageTextGroup}>
              <Text style={styles.manageTitle}>{user?.username ?? "Người dùng"}</Text>
              <Text style={styles.manageSubtitle}>{user?.email ?? "Chưa có email"}</Text>
            </View>
          </View>

          <View style={styles.manageActionCard}>
            <Pressable style={styles.manageDangerRow} onPress={openResetWarning}>
              <Text style={styles.manageDangerIcon}>!</Text>
              <View style={styles.manageTextGroup}>
                <Text style={styles.manageDangerTitle}>Đặt lại tài khoản</Text>
                <Text style={styles.manageSubtitle}>Xóa dữ liệu tài chính và bắt đầu lại</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.logoutButton, isLoggingOut && styles.buttonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <Text style={styles.logoutButtonText}>Đăng xuất</Text>
            )}
          </Pressable>
        </View>
      </FocusedScreenTransition>
    );
  }

  if (view === "editProfile") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <View style={styles.walletHeader}>
          <Pressable onPress={() => setView("menu")} hitSlop={12}>
            <Text style={styles.backText}>‹ Cá nhân</Text>
          </Pressable>
          <Text style={styles.topTitle}>Chỉnh sửa hồ sơ</Text>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.editProfileContent}>
          <Pressable style={styles.editAvatarButton} onPress={handlePickAvatar}>
            {editAvatarUrl ? (
              <Image
                key={getAvatarCacheKey(editAvatarUrl)}
                source={{ uri: editAvatarUrl }}
                style={styles.editAvatarImage}
                onError={(event) => console.warn("Không tải được avatar edit", event.nativeEvent)}
              />
            ) : (
              <Text style={styles.editAvatarText}>{initial}</Text>
            )}
            <View style={styles.avatarChangeBadge}>
              <Text style={styles.avatarChangeText}>Đổi ảnh</Text>
            </View>
          </Pressable>

          <View style={styles.field}>
            <Text style={styles.label}>Tên hiển thị</Text>
            <TextInput
              value={editDisplayName}
              onChangeText={setEditDisplayName}
              placeholder="Nhập tên hiển thị"
              placeholderTextColor={theme.inputPlaceholder}
              style={styles.input}
            />
          </View>

          <View style={styles.profileInfoBox}>
            <Text style={styles.profileInfoLabel}>Tài khoản</Text>
            <Text style={styles.profileInfoValue}>{user?.username ?? "Người dùng"}</Text>
            <Text style={styles.profileInfoSubValue}>{user?.email ?? "Chưa có email"}</Text>
          </View>

          <Pressable
            style={[styles.primaryButton, isSavingProfile && styles.buttonDisabled]}
            onPress={handleSaveProfile}
            disabled={isSavingProfile}
          >
            {isSavingProfile ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <Text style={styles.primaryButtonText}>Lưu thay đổi</Text>
            )}
          </Pressable>
        </ScrollView>
      </FocusedScreenTransition>
    );
  }

  if (view === "spendingStats") {
    return (
      <FocusedScreenTransition
        style={styles.screen}
        triggerKey={`${view}-${statsReturnPath ?? "user"}`}
        variant="slide-left"
      >
        <View style={styles.walletHeader}>
          <Pressable onPress={closeSpendingStats} hitSlop={12}>
            <Text style={styles.backText}>{statsReturnPath ? "‹ Sổ giao dịch" : "‹ Người dùng"}</Text>
          </Pressable>
          <Text style={styles.topTitle}>Thống kê chi tiêu</Text>
          <Pressable
            style={[styles.insightToggleButton, isFinancialInsightsVisible && styles.insightToggleButtonActive]}
            onPress={toggleFinancialInsights}
            hitSlop={8}
          >
            <Text style={[styles.insightToggleText, isFinancialInsightsVisible && styles.insightToggleTextActive]}>
              AI
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.statsContent}>
          <View style={styles.statsPanel}>
            <View style={styles.monthSwitcher}>
              <Pressable style={styles.monthButton} onPress={goPreviousStatsPeriod} hitSlop={10}>
                <Text style={styles.monthButtonText}>‹</Text>
              </Pressable>
              <View style={styles.monthTitleWrap}>
                <Text style={styles.monthTitle}>{statsPeriodLabel}</Text>
                <Text style={styles.monthSubtitle}>
                  {spendingStats
                    ? `${spendingStats.currentPeriod.start} → ${spendingStats.currentPeriod.end}`
                    : `Tháng ${statsMonth}/${statsYear}`}
                </Text>
              </View>
              <Pressable
                style={[styles.monthButton, !canGoNextStatsPeriod && styles.monthButtonDisabled]}
                onPress={goNextStatsPeriod}
                disabled={!canGoNextStatsPeriod}
                hitSlop={10}
              >
                <Text style={styles.monthButtonText}>›</Text>
              </Pressable>
            </View>

            {isFinancialInsightsVisible ? (
              <View style={styles.insightCard}>
                <View style={styles.insightHeaderRow}>
                  <View style={styles.insightBadge}>
                    <Text style={styles.insightBadgeText}>AI</Text>
                  </View>
                  <Text style={styles.insightTitle}>Nhận xét tháng này</Text>
                </View>

                {isLoadingFinancialInsights ? (
                  <View style={styles.insightLoadingRow}>
                    <ActivityIndicator color={theme.primary} size="small" />
                    <Text style={styles.insightMutedText}>Đang đọc số liệu...</Text>
                  </View>
                ) : financialInsights ? (
                  <>
                    <Text style={styles.insightSummary}>{financialInsights.summary}</Text>
                    {(financialInsights.insights ?? []).map((insight) => (
                      <View key={`${insight.type}-${insight.title}`} style={styles.insightItem}>
                        <View style={styles.insightIcon}>
                          <Text style={styles.insightIconText}>{getFinancialInsightIcon(insight.type)}</Text>
                        </View>
                        <View style={styles.insightCopy}>
                          <Text style={styles.insightItemTitle}>{insight.title}</Text>
                          <Text style={styles.insightItemMessage}>{insight.message}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  <View style={styles.insightErrorRow}>
                    <Text style={styles.insightMutedText}>
                      {financialInsightsError ?? "Chưa có nhận xét cho kỳ này."}
                    </Text>
                    <Pressable onPress={loadFinancialInsights} hitSlop={8}>
                      <Text style={styles.insightRetryText}>Thử lại</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            {isLoadingStats ? (
              <View style={styles.statsLoading}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : spendingStats ? (
              <>
                <View style={styles.statsSummaryRow}>
                  <View style={[styles.statsSummaryCard, styles.statsSummaryCardActive]}>
                    <Text style={styles.statsSummaryLabel}>Chi tiêu</Text>
                    <Text style={styles.statsSummaryValue}>{formatMoney(spendingStats.totalAmount, "VND")}</Text>
                  </View>
                  <View style={styles.statsSummaryCard}>
                    <Text style={styles.statsSummaryLabel}>Kỳ trước</Text>
                    <Text style={styles.statsSummaryValue}>{formatMoney(spendingStats.compareTotalAmount, "VND")}</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.statsTrendCard,
                    (spendingStats.totalChangePercentage ?? 0) <= 0
                      ? styles.statsTrendCardGood
                      : styles.statsTrendCardWarn,
                  ]}
                >
                  <Text
                    style={[
                      styles.statsTrendText,
                      (spendingStats.totalChangePercentage ?? 0) <= 0
                        ? styles.statsTrendTextGood
                        : styles.statsTrendTextWarn,
                    ]}
                  >
                    {spendingStats.totalChangePercentage === null
                      ? "Mới có chi tiêu trong kỳ này"
                      : `${spendingStats.totalChangePercentage <= 0 ? "Giảm" : "Tăng"} ${formatSignedMoney(
                          spendingStats.totalAmount,
                          spendingStats.compareTotalAmount,
                        )} so với kỳ trước`}
                  </Text>
                </View>

                {chartData.length === 0 ? (
                  <Text style={styles.statsEmptyText}>Không có chi tiêu trong kỳ này.</Text>
                ) : (
                  <View style={styles.chartSection}>
                    <SpendingDonutChart
                      data={chartData}
                      selectedKey={selectedCategoryKey}
                      onSelect={handleSelectCategory}
                    />
                  </View>
                )}

                <Text style={styles.detailTitle}>
                  Chi tiết từng danh mục ({(spendingStats.categories ?? []).length})
                </Text>
                {(spendingStats.categories ?? []).map((category) => {
                  const categoryKey = getCategoryKey(category);
                  const isSelected = selectedCategoryKey === categoryKey;
                  const chartColor = chartData.find((item) => item.key === categoryKey)?.color ?? "#9ca3af";

                  return (
                    <Pressable
                      key={categoryKey}
                      onPress={() => handleSelectCategory(categoryKey)}
                      style={[styles.statCard, isSelected && styles.statCardSelected]}
                    >
                      <View style={styles.statCategoryHeader}>
                        <View style={[styles.statIcon, { backgroundColor: `${chartColor}24` }]}>
                          <Text style={[styles.statIconText, { color: chartColor }]}>
                            {category.icon?.charAt(0).toUpperCase() ?? "?"}
                          </Text>
                        </View>
                        <View style={styles.walletInfo}>
                          <Text style={styles.statCategoryName}>{category.categoryName}</Text>
                          <Text style={styles.statCategoryMeta}>
                            {category.transactionCount} giao dịch · {category.percentage.toFixed(1)}%
                          </Text>
                        </View>
                        <Text style={styles.statCategoryAmount}>{formatMoney(category.amount, "VND")}</Text>
                      </View>
                      <Text style={styles.statCompareText}>
                        Kỳ trước: {formatMoney(category.compareAmount, "VND")} ·{" "}
                        {formatChange(category.changePercentage)}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            ) : (
              <Text style={styles.statsEmptyText}>Chưa tải được thống kê.</Text>
            )}
          </View>
        </ScrollView>
      </FocusedScreenTransition>
    );
  }

  return (
    <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-right">
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerSide}>
            <Text style={styles.supportText}>Hỗ trợ</Text>
          </View>
          <Text style={styles.pageTitle}>Cá nhân</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.themeButton} onPress={toggleThemeMode} hitSlop={10}>
              <ThemeModeIconFrame style={iconAnimatedStyle}>
                <SymbolView
                  name={{
                    ios: isDarkMode ? "sun.max.fill" : "moon.fill",
                    android: isDarkMode ? "light_mode" : "dark_mode",
                    web: isDarkMode ? "light_mode" : "dark_mode",
                  }}
                  size={21}
                  tintColor={theme.text}
                  fallback={<Text style={styles.themeFallbackIcon}>{isDarkMode ? "☀" : "☾"}</Text>}
                />
              </ThemeModeIconFrame>
            </Pressable>
          </View>
        </View>

        <View style={styles.profileCard}>
          <Pressable style={styles.avatar} onPress={openEditProfile} accessibilityLabel="Chỉnh sửa hồ sơ">
            {user?.avatarUrl ? (
              <Image
                key={getAvatarCacheKey(user.avatarUrl)}
                source={{ uri: user.avatarUrl }}
                style={styles.avatarImage}
                onError={(event) => console.warn("Không tải được avatar", event.nativeEvent)}
              />
            ) : (
              <Text style={styles.avatarText}>{initial}</Text>
            )}
          </Pressable>
          <Text style={styles.username}>{user?.displayName ?? user?.username ?? "Người dùng"}</Text>
          <Text style={styles.email}>{user?.email ?? "Chưa có email"}</Text>

          <View style={styles.divider} />

          <Pressable style={styles.manageRow} onPress={openEditProfile}>
            <Text style={styles.manageIcon}>♙</Text>
            <View style={styles.manageTextGroup}>
              <Text style={styles.manageTitle}>Chỉnh sửa hồ sơ</Text>
              <Text style={styles.manageSubtitle}>Avatar và tên hiển thị</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        <View style={styles.menuCard}>
          <Pressable style={styles.menuRow} onPress={() => router.push("/account")}>
            <Text style={styles.menuIcon}>▰</Text>
            <Text style={styles.menuText}>Ví của tôi</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={styles.menuRow}
            onPress={() => {
              clearSpendingStatsFromTransactions();
              setStatsReturnPath(null);
              setView("spendingStats");
            }}
          >
            <Text style={styles.menuIcon}>◷</Text>
            <Text style={styles.menuText}>Thống kê chi tiêu</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={[styles.menuRow, isExportingTransactions && styles.menuRowDisabled]}
            onPress={openExportFile}
            disabled={isExportingTransactions}
          >
            <Text style={styles.menuIcon}>⇩</Text>
            <Text style={styles.menuText}>Xuất File</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable style={styles.menuRow} onPress={() => setView("manage")}>
            <Text style={styles.menuIcon}>⚙</Text>
            <Text style={styles.menuText}>Tài khoản</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
      {transitionOverlay}
    </FocusedScreenTransition>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.screen },
    content: { padding: 24, paddingBottom: 96 },
    headerRow: { alignItems: "center", flexDirection: "row", marginBottom: 32, marginTop: 36 },
    headerSide: { flex: 1 },
    pageTitle: { color: theme.text, flex: 1, fontSize: 24, fontWeight: "700", textAlign: "center" },
    headerActions: { alignItems: "center", flex: 1, flexDirection: "row", justifyContent: "flex-end" },
    supportText: { color: theme.text, fontSize: 16 },
    themeButton: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 17,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    themeFallbackIcon: { color: theme.text, fontSize: 18, fontWeight: "800" },
    profileCard: { backgroundColor: theme.card, borderRadius: 8, overflow: "hidden", paddingTop: 34 },
    avatar: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.avatar,
      borderRadius: 44,
      height: 88,
      justifyContent: "center",
      marginBottom: 16,
      width: 88,
    },
    avatarImage: { borderRadius: 44, height: 88, width: 88 },
    avatarText: { color: theme.textInverse, fontSize: 44, fontWeight: "500" },
    username: { color: theme.text, fontSize: 23, fontWeight: "600", textAlign: "center" },
    email: { color: theme.textMuted, fontSize: 17, marginTop: 6, textAlign: "center" },
    divider: { backgroundColor: theme.border, height: 1, marginTop: 34 },
    manageRow: { alignItems: "center", flexDirection: "row", minHeight: 78, paddingHorizontal: 22 },
    manageIcon: { color: theme.text, fontSize: 30, width: 46 },
    manageTextGroup: { flex: 1 },
    manageTitle: { color: theme.text, fontSize: 18, fontWeight: "700" },
    manageSubtitle: { color: theme.textMuted, fontSize: 16, marginTop: 3 },
    manageContent: { gap: 18, padding: 20 },
    manageActionCard: { backgroundColor: theme.card, borderRadius: 8, overflow: "hidden" },
    manageDangerRow: { alignItems: "center", flexDirection: "row", minHeight: 78, paddingHorizontal: 18 },
    manageDangerIcon: {
      color: theme.dangerText,
      fontSize: 28,
      fontWeight: "900",
      marginRight: 14,
      textAlign: "center",
      width: 34,
    },
    manageDangerTitle: { color: theme.dangerText, fontSize: 18, fontWeight: "800" },
    profileMiniCard: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderRadius: 8,
      flexDirection: "row",
      minHeight: 84,
      padding: 18,
    },
    smallAvatar: {
      alignItems: "center",
      backgroundColor: theme.avatar,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      marginRight: 14,
      width: 48,
    },
    smallAvatarImage: { borderRadius: 24, height: 48, width: 48 },
    smallAvatarText: { color: theme.textInverse, fontSize: 24, fontWeight: "700" },
    editProfileContent: { gap: 18, padding: 20, paddingBottom: 96 },
    editAvatarButton: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.avatar,
      borderRadius: 58,
      height: 116,
      justifyContent: "center",
      marginBottom: 8,
      overflow: "hidden",
      width: 116,
    },
    editAvatarImage: { height: 116, width: 116 },
    editAvatarText: { color: theme.textInverse, fontSize: 52, fontWeight: "700" },
    avatarChangeBadge: {
      alignItems: "center",
      backgroundColor: theme.overlayStrong,
      bottom: 0,
      height: 34,
      justifyContent: "center",
      left: 0,
      position: "absolute",
      right: 0,
    },
    avatarChangeText: { color: theme.textInverse, fontSize: 12, fontWeight: "800" },
    profileInfoBox: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 4,
      padding: 14,
    },
    profileInfoLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "800" },
    profileInfoValue: { color: theme.text, fontSize: 16, fontWeight: "800" },
    profileInfoSubValue: { color: theme.textMuted, fontSize: 14, fontWeight: "600" },
    logoutButton: {
      alignItems: "center",
      backgroundColor: theme.danger,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 52,
    },
    logoutButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: "700" },
    resetScreenBody: { flex: 1 },
    resetWarningContent: { gap: 16, padding: 20, paddingBottom: 110 },
    resetWarningHero: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      padding: 22,
    },
    resetWarningIcon: {
      color: theme.dangerText,
      fontSize: 44,
      fontWeight: "900",
      lineHeight: 48,
      marginBottom: 10,
    },
    resetWarningTitle: { color: theme.text, fontSize: 20, fontWeight: "900", lineHeight: 27, textAlign: "center" },
    resetWarningText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 21,
      marginTop: 10,
      textAlign: "center",
    },
    resetImpactCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      overflow: "hidden",
    },
    resetImpactRow: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      minHeight: 58,
      paddingHorizontal: 16,
    },
    resetImpactBullet: { color: theme.dangerText, fontSize: 22, fontWeight: "900", marginRight: 12, width: 20 },
    resetImpactText: { color: theme.text, flex: 1, fontSize: 15, fontWeight: "800", lineHeight: 21 },
    resetFooter: {
      backgroundColor: theme.screen,
      borderTopColor: theme.border,
      borderTopWidth: 1,
      bottom: 0,
      left: 0,
      paddingBottom: 22,
      paddingHorizontal: 20,
      paddingTop: 12,
      position: "absolute",
      right: 0,
    },
    resetPasswordContent: { gap: 18, padding: 20, paddingBottom: 96 },
    resetConfirmCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 18,
      padding: 18,
    },
    resetConfirmTitle: { color: theme.text, fontSize: 19, fontWeight: "900" },
    resetConfirmText: { color: theme.textMuted, fontSize: 14, fontWeight: "600", lineHeight: 21 },
    resetAuthDividerRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    resetAuthDividerLine: { backgroundColor: theme.border, flex: 1, height: 1 },
    resetAuthDividerText: { color: theme.textMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
    googleResetButton: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      minHeight: 50,
    },
    googleResetIcon: { color: theme.primary, fontSize: 18, fontWeight: "900" },
    googleResetText: { color: theme.text, fontSize: 15, fontWeight: "900" },
    dangerButton: {
      alignItems: "center",
      backgroundColor: theme.danger,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 52,
    },
    dangerButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: "900" },
    chevron: { color: theme.chevron, fontSize: 40, lineHeight: 42 },
    menuCard: { backgroundColor: theme.card, borderRadius: 8, marginTop: 34, overflow: "hidden" },
    menuRow: { alignItems: "center", flexDirection: "row", minHeight: 76, paddingHorizontal: 22 },
    menuRowDisabled: { opacity: 0.62 },
    menuDivider: { backgroundColor: theme.border, height: 1, marginLeft: 68 },
    menuIcon: { color: theme.text, fontSize: 30, width: 46 },
    menuText: { color: theme.text, flex: 1, fontSize: 22, fontWeight: "500" },
    walletHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 16,
      paddingHorizontal: 20,
      paddingTop: 56,
    },
    backText: { color: theme.primary, fontSize: 17, fontWeight: "700" },
    topTitle: { color: theme.text, fontSize: 22, fontWeight: "700" },
    topBar: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
      marginTop: 32,
    },
    topSpacer: { width: 82 },
    insightToggleButton: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      height: 32,
      justifyContent: "center",
      width: 82,
    },
    insightToggleButtonActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    insightToggleText: { color: theme.textMuted, fontSize: 13, fontWeight: "900" },
    insightToggleTextActive: { color: theme.textInverse },
    addWalletButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    addWalletText: { color: theme.textInverse, fontSize: 30, fontWeight: "500", lineHeight: 33 },
    walletList: { gap: 14, padding: 20, paddingBottom: 96 },
    exportContent: { gap: 16, padding: 20, paddingBottom: 96 },
    exportSection: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      overflow: "hidden",
    },
    exportSectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "900",
      paddingHorizontal: 16,
      paddingTop: 15,
      paddingBottom: 10,
    },
    exportOptionRow: {
      alignItems: "center",
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: "row",
      minHeight: 70,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    exportOptionRowActive: { backgroundColor: theme.primaryPressed },
    exportOptionIcon: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 19,
      height: 38,
      justifyContent: "center",
      marginRight: 12,
      width: 38,
    },
    exportOptionIconText: { color: theme.text, fontSize: 18, fontWeight: "900" },
    exportOptionTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
    exportOptionSubtitle: { color: theme.textMuted, fontSize: 13, fontWeight: "700", marginTop: 3 },
    exportOptionCheck: { color: theme.primary, fontSize: 21, fontWeight: "900", width: 24 },
    exportLoadingRow: {
      alignItems: "center",
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 62,
      paddingHorizontal: 16,
    },
    exportDateGrid: { flexDirection: "row", gap: 10, padding: 14, paddingTop: 0 },
    exportDateCard: {
      backgroundColor: theme.cardAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      gap: 7,
      minHeight: 76,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    exportDateLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
    exportDateValue: { color: theme.text, fontSize: 17, fontWeight: "900" },
    bottomSheetOverlay: {
      backgroundColor: theme.overlay,
      flex: 1,
      justifyContent: "flex-end",
    },
    exportDatePickerSheet: {
      backgroundColor: theme.sheet,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      padding: 18,
      paddingBottom: 28,
    },
    datePickerHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    datePickerTitle: { color: theme.text, flex: 1, fontSize: 17, fontWeight: "900", textAlign: "center" },
    datePickerAction: { fontSize: 16, fontWeight: "900" },
    datePicker: { alignSelf: "stretch" },
    statsContent: { backgroundColor: theme.screen, padding: 14, paddingBottom: 96 },
    statsPanel: { backgroundColor: theme.screen, borderRadius: 8, gap: 12, padding: 4 },
    monthSwitcher: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 44 },
    monthButton: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
    monthButtonDisabled: { opacity: 0.28 },
    monthButtonText: { color: theme.chevron, fontSize: 34, fontWeight: "500", lineHeight: 34 },
    monthTitleWrap: { alignItems: "center", flex: 1 },
    monthTitle: { color: theme.text, fontSize: 15, fontWeight: "800" },
    monthSubtitle: { color: theme.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
    insightCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      padding: 14,
    },
    insightHeaderRow: { alignItems: "center", flexDirection: "row", gap: 9 },
    insightBadge: {
      alignItems: "center",
      backgroundColor: theme.primaryPressed,
      borderRadius: 11,
      height: 22,
      justifyContent: "center",
      width: 34,
    },
    insightBadgeText: { color: theme.primary, fontSize: 11, fontWeight: "900" },
    insightTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
    insightSummary: { color: theme.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
    insightLoadingRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 34 },
    insightErrorRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
    insightMutedText: { color: theme.textMuted, flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 19 },
    insightRetryText: { color: theme.primary, fontSize: 13, fontWeight: "900" },
    insightItem: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
    insightIcon: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 15,
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    insightIconText: { color: theme.primary, fontSize: 15, fontWeight: "900" },
    insightCopy: { flex: 1, gap: 2 },
    insightItemTitle: { color: theme.text, fontSize: 13, fontWeight: "900" },
    insightItemMessage: { color: theme.textMuted, fontSize: 13, fontWeight: "600", lineHeight: 19 },
    statsLoading: { alignItems: "center", minHeight: 260, justifyContent: "center" },
    statsSummaryRow: { flexDirection: "row", gap: 8 },
    statsSummaryCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      minHeight: 72,
      padding: 10,
    },
    statsSummaryCardActive: { borderColor: theme.accent },
    statsSummaryLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "800", marginBottom: 7 },
    statsSummaryValue: { color: theme.text, fontSize: 18, fontWeight: "900" },
    statsTrendCard: {
      borderRadius: 8,
      minHeight: 42,
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statsTrendCardGood: { backgroundColor: theme.goodBackground },
    statsTrendCardWarn: { backgroundColor: theme.warningBackground },
    statsTrendText: { fontSize: 13, fontWeight: "800", lineHeight: 18 },
    statsTrendTextGood: { color: theme.goodText },
    statsTrendTextWarn: { color: theme.warning },
    chartSection: {
      alignItems: "center",
      elevation: 24,
      paddingVertical: 8,
      position: "relative",
      zIndex: 24,
    },
    detailTitle: { color: theme.accent, fontSize: 13, fontWeight: "900", marginTop: 2, textAlign: "center" },
    statsEmptyText: { color: theme.textMuted, fontSize: 15, lineHeight: 22, paddingVertical: 36, textAlign: "center" },
    balanceSummary: { backgroundColor: theme.card, borderRadius: 8, padding: 18 },
    summaryLabel: { color: theme.textMuted, fontSize: 14, marginBottom: 4 },
    summaryValue: { color: theme.text, fontSize: 26, fontWeight: "700" },
    walletCard: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderRadius: 8,
      flexDirection: "row",
      minHeight: 78,
      padding: 16,
    },
    statControlCard: { backgroundColor: theme.card, borderRadius: 8, gap: 14, padding: 16 },
    statControlTitle: { color: theme.textMuted, fontSize: 13, fontWeight: "800" },
    periodRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
    periodValue: { color: theme.text, fontSize: 15, fontWeight: "800", minWidth: 64, textAlign: "center" },
    stepButton: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 8,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    stepButtonText: { color: theme.text, fontSize: 22, fontWeight: "700", lineHeight: 24 },
    statCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 14,
    },
    statCardSelected: { borderColor: theme.accent, shadowColor: theme.accent, shadowOpacity: 0.2, shadowRadius: 10 },
    statCategoryHeader: { alignItems: "center", flexDirection: "row" },
    statIcon: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      marginRight: 14,
      width: 40,
    },
    statIconText: { color: theme.primary, fontSize: 18, fontWeight: "800" },
    statCategoryName: { color: theme.text, fontSize: 16, fontWeight: "900" },
    statCategoryMeta: { color: theme.textMuted, fontSize: 13, fontWeight: "700", marginTop: 3 },
    statCategoryAmount: { color: theme.text, fontSize: 15, fontWeight: "900" },
    statCompareText: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
    walletIcon: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      marginRight: 14,
      width: 40,
    },
    walletIconText: { color: theme.text, fontSize: 20 },
    walletInfo: { flex: 1 },
    walletName: { color: theme.text, fontSize: 18, fontWeight: "700" },
    walletType: { color: theme.textMuted, fontSize: 14, marginTop: 3 },
    walletBalance: { color: theme.text, fontSize: 16, fontWeight: "700" },
    emptyText: { color: theme.textMuted, fontSize: 16, lineHeight: 23, marginTop: 18, textAlign: "center" },
    form: { gap: 18, paddingTop: 28 },
    field: { gap: 8 },
    label: { color: theme.text, fontSize: 14, fontWeight: "700" },
    input: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      fontSize: 16,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    typeOption: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 104,
      paddingHorizontal: 14,
    },
    typeOptionSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    typeOptionText: { color: theme.textSoft, fontWeight: "700" },
    typeOptionTextSelected: { color: theme.textInverse },
    row: { flexDirection: "row", gap: 12 },
    currencyField: { flex: 0.8 },
    balanceField: { flex: 1.4 },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 50,
    },
    buttonDisabled: { opacity: 0.7 },
    primaryButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: "700" },
  });
}
