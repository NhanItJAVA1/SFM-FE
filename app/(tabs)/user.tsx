import { AppText as Text, AppTextInput as TextInput } from "@/components/app-text";
import { BottomPopup, BottomPopupPressable } from "@/components/bottom-popup";
import { ScreenGradientBackground } from "@/components/screen-gradient-background";
import { Typography } from "@/theme/typography";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import axios from "axios";
import * as Google from "expo-auth-session/providers/google";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  ChartPie,
  Check,
  ChevronRight,
  Download,
  LogOut,
  Moon,
  Settings2,
  Sun,
  Trash2,
  UserRound,
  UserRoundPen,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authApi } from "@/api/authApi";
import { FinancialAccount, financialAccountApi } from "@/api/financialAccountApi";
import { financialInsightsApi, FinancialInsightsResponse } from "@/api/financialInsightsApi";
import { CategorySpendingItem, CategorySpendingResponse, Transaction, transactionsApi } from "@/api/transactionsApi";
import { usersApi } from "@/api/usersApi";
import { CategoryIconBadge, getCategoryVisual } from "@/components/category-icon";
import { CURVED_TAB_BAR_HEIGHT } from "@/components/curved-tab-bar-background";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { SpendingDonutChart, SpendingDonutSegment } from "@/components/spending-donut-chart";
import { ThemeModeIconFrame, useThemeModeTransition } from "@/components/theme-mode-transition";
import { AccountIcon, getAccountTypeMeta } from "@/components/wallet-card";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { getAuthRefreshToken, getAuthUser } from "@/stores/authSession";
import { clearAuthSession, updatePersistedAuthUser } from "@/stores/persistedAuthSession";
import {
  clearSpendingStatsFromTransactions,
  consumePendingSpendingStatsRequest,
  getSpendingStatsReturnPath,
  subscribeSpendingStatsRequest,
  type SpendingStatsPeriod,
  type SpendingStatsReturnPath,
} from "@/stores/spendingStatsNavigation";
import { subscribeUserTabPress } from "@/stores/userTabPress";
import type { AppTheme } from "@/theme/appTheme";
import { exportTransactionsFile } from "@/utils/transactionExportFile";
import { isIncomingTransaction } from "@/utils/transactionPresentation";

WebBrowser.maybeCompleteAuthSession();

type UserView = "menu" | "manage" | "editProfile" | "spendingStats" | "exportFile" | "resetWarning" | "resetPassword";
type ExportDateField = "fromDate" | "toDate";

const profileAvatarSize = 192;

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

function formatApiDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function formatTransactionDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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
  const resetStatsOnFocus = useRef(false);
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const themeMode = useThemeMode();
  const isDarkMode = themeMode === "dark";
  const styles = useMemo(() => createStyles(theme, insets.top, insets.bottom), [theme, insets.top, insets.bottom]);
  const { iconAnimatedStyle, toggleThemeMode, transitionOverlay } = useThemeModeTransition({
    screenColor: theme.screen,
    themeMode,
  });
  const initial = (user?.displayName ?? user?.username ?? "U").trim().charAt(0).toUpperCase() || "U";
  const [editDisplayName, setEditDisplayName] = useState(user?.displayName ?? user?.username ?? "");
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
  const initialStatsRequest = useMemo(() => consumePendingSpendingStatsRequest(), []);
  const initialStatsReturnPath = initialStatsRequest?.returnPath ?? null;
  const [view, setView] = useState<UserView>(initialStatsReturnPath ? "spendingStats" : "menu");
  const [statsMonth, setStatsMonth] = useState(initialStatsRequest?.period?.month ?? defaultMonth);
  const [statsYear, setStatsYear] = useState(initialStatsRequest?.period?.year ?? defaultYear);
  const [spendingStats, setSpendingStats] = useState<CategorySpendingResponse | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [financialInsights, setFinancialInsights] = useState<FinancialInsightsResponse | null>(null);
  const [isLoadingFinancialInsights, setIsLoadingFinancialInsights] = useState(false);
  const [financialInsightsError, setFinancialInsightsError] = useState<string | null>(null);
  const [isFinancialInsightsVisible, setIsFinancialInsightsVisible] = useState(false);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(null);
  const [categoryTransactions, setCategoryTransactions] = useState<Transaction[]>([]);
  const [categoryTransactionPage, setCategoryTransactionPage] = useState(1);
  const [categoryTransactionTotalPages, setCategoryTransactionTotalPages] = useState(1);
  const [isLoadingCategoryTransactions, setIsLoadingCategoryTransactions] = useState(false);
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
      .map((category) => ({
        amount: category.amount,
        color: getCategoryVisual({ icon: category.icon, name: category.categoryName, type: "Expense" }).color,
        key: getCategoryKey(category),
        label: category.categoryName,
        percentage: category.percentage,
      }));
  }, [spendingStats]);
  const activeExportDate = activeExportDateField === "toDate" ? exportToDate : exportFromDate;

  useEffect(() => {
    return subscribeUserTabPress(() => {
      resetStatsOnFocus.current = false;
      setStatsReturnPath(null);
      setView("menu");
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (resetStatsOnFocus.current) {
        resetStatsOnFocus.current = false;
        setStatsReturnPath(null);
        setView("menu");
      }
    }, []),
  );

  const openSpendingStats = useCallback(
    (returnPath: SpendingStatsReturnPath, period?: SpendingStatsPeriod) => {
      resetStatsOnFocus.current = false;
      setStatsReturnPath(returnPath);
      setStatsMonth(period?.month ?? defaultMonth);
      setStatsYear(period?.year ?? defaultYear);
      setIsFinancialInsightsVisible(false);
      setView("spendingStats");
    },
    [defaultMonth, defaultYear],
  );

  useEffect(() => {
    const unsubscribe = subscribeSpendingStatsRequest((request) => {
      consumePendingSpendingStatsRequest();
      openSpendingStats(request.returnPath, request.period);
    });

    return () => {
      unsubscribe();
    };
  }, [openSpendingStats]);

  const loadSpendingStats = useCallback(async () => {
    try {
      setIsLoadingStats(true);
      const comparePeriod = getPreviousMonth(statsMonth, statsYear);
      const response = await transactionsApi.categorySpending({
        month: statsMonth,
        year: statsYear,
        compareMonth: comparePeriod.month,
        compareYear: comparePeriod.year,
      });
      setSpendingStats(
        response.data
          ? { ...response.data, categories: Array.isArray(response.data.categories) ? response.data.categories : [] }
          : null,
      );
      setSelectedCategoryKey(null);
      setExpandedCategoryKey(null);
      setCategoryTransactions([]);
      setCategoryTransactionPage(1);
      setCategoryTransactionTotalPages(1);
    } catch (error) {
      Alert.alert("Không tải được thống kê", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsLoadingStats(false);
    }
  }, [statsMonth, statsYear]);

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

  useFocusEffect(
    useCallback(() => {
      if (view !== "spendingStats") {
        return undefined;
      }

      const timeoutId = setTimeout(() => {
        void loadSpendingStats();
      }, 0);

      return () => clearTimeout(timeoutId);
    }, [loadSpendingStats, view]),
  );

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
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      loadExportAccounts();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadExportAccounts, view]);

  useEffect(() => {
    if (!isGoogleResettingAccount || googleResetResponse?.type !== "success") {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      const idToken = googleResetResponse.params.id_token;

      if (!idToken) {
        setIsGoogleResettingAccount(false);
        Alert.alert("Không thể xác nhận Google", "Google không trả về ID token.");
        return;
      }

      resetAccountData({ idToken, password: "" });
    }, 0);

    return () => clearTimeout(timeoutId);
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

  async function loadCategoryTransactions(category: CategorySpendingItem, page: number, append = false) {
    try {
      setIsLoadingCategoryTransactions(true);
      const fromDate = new Date(statsYear, statsMonth - 1, 1);
      const toDate = new Date(statsYear, statsMonth, 0);
      const response = await transactionsApi.list({
        categoryId: category.categoryId,
        fromDate: formatApiDate(fromDate),
        page,
        pageSize: 20,
        toDate: formatApiDate(toDate),
        uncategorized: category.categoryId === null,
      });
      const items = Array.isArray(response.data.items) ? response.data.items : [];

      setCategoryTransactions((current) => (append ? [...current, ...items] : items));
      setCategoryTransactionPage(response.data.page);
      setCategoryTransactionTotalPages(Math.max(1, response.data.totalPages));
    } catch (error) {
      Alert.alert("Không tải được giao dịch", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsLoadingCategoryTransactions(false);
    }
  }

  function toggleCategoryDetail(category: CategorySpendingItem) {
    const categoryKey = getCategoryKey(category);

    if (expandedCategoryKey === categoryKey) {
      setExpandedCategoryKey(null);
      return;
    }

    setExpandedCategoryKey(categoryKey);
    setCategoryTransactions([]);
    setCategoryTransactionPage(1);
    setCategoryTransactionTotalPages(1);
    void loadCategoryTransactions(category, 1);
  }

  function toggleFinancialInsights() {
    setIsFinancialInsightsVisible((isVisible) => !isVisible);
  }

  function closeSpendingStats() {
    if (resetStatsOnFocus.current) return;
    const returnPath = statsReturnPath ?? getSpendingStatsReturnPath();

    if (returnPath) {
      // Preserve the visible stats view until the user tab is focused again.
      // Resetting it here briefly renders the personal menu before navigation.
      resetStatsOnFocus.current = true;
      clearSpendingStatsFromTransactions();
      router.navigate(returnPath);
      return;
    }

    setStatsReturnPath(null);
    clearSpendingStatsFromTransactions();
    setView("menu");
  }

  function openEditProfile() {
    setEditDisplayName(user?.displayName ?? user?.username ?? "");
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
    console.log("[Avatar Upload]", {
      assetMimeType: asset.mimeType,
      blobType: imageBlob.type,
      contentType,
      signedHeaders,
      headers,
      blobSize: imageBlob.size,
    });
    const s3Response = await FileSystem.uploadAsync(uploadUrlResponse.data.uploadUrl, asset.uri, {
      httpMethod: "PUT",
      headers,
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (s3Response.status < 200 || s3Response.status >= 300) {
      const detail = s3Response.body;
      const s3ErrorCode = getS3ErrorCode(detail);
      console.warn("Upload avatar lên S3 thất bại", {
        contentType,
        detail,
        fileName,
        s3ErrorCode,
        signedHeaders,
        status: s3Response.status,
      });
      throw new Error(
        s3ErrorCode ? `Upload S3 lỗi ${s3Response.status}: ${s3ErrorCode}.` : `Upload S3 lỗi ${s3Response.status}.`,
      );
    }

    return uploadUrlResponse.data.publicUrl;
  }

  async function handleSaveProfile() {
    if (!user) {
      Alert.alert("Chưa có người dùng", "Vui lòng đăng nhập lại để cập nhật hồ sơ.");
      return;
    }

    const nextDisplayName = editDisplayName.trim() || user.username;

    try {
      setIsSavingProfile(true);
      const nextAvatarUrl = selectedAvatar ? await uploadAvatar(selectedAvatar) : editAvatarUrl;

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
      if (axios.isAxiosError(error)) {
        console.log("UPDATE USER VALIDATION:", JSON.stringify(error.response?.data?.errors, null, 2));
        console.log("UPDATE USER REQUEST:", error.config?.data);
      }
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
        <ScreenGradientBackground darkOnly />
        <PersonalScreenHeader title="Xuất giao dịch" onBack={() => setView("menu")} styles={styles} />

        <ScrollView contentContainerStyle={styles.exportContent} keyboardShouldPersistTaps="handled">
          <View style={styles.exportSection}>
            <Text style={styles.exportSectionTitle}>Ví</Text>
            <Pressable
              accessibilityRole="radio"
              aria-checked={selectedExportAccountId === null}
              style={[styles.exportOptionRow, selectedExportAccountId === null && styles.exportOptionRowActive]}
              onPress={() => setSelectedExportAccountId(null)}
            >
              <View style={styles.exportOptionIcon}>
                <Wallet size={22} color={theme.primary} strokeWidth={1.8} />
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.exportOptionTitle}>Tất cả ví</Text>
                <Text style={styles.exportOptionSubtitle}>Xuất giao dịch của mọi ví</Text>
              </View>
              {selectedExportAccountId === null ? (
                <Check size={20} color={theme.primary} />
              ) : (
                <View style={styles.exportCheckSpacer} />
              )}
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
                    accessibilityRole="radio"
                    aria-checked={isSelected}
                    style={[styles.exportOptionRow, isSelected && styles.exportOptionRowActive]}
                    onPress={() => setSelectedExportAccountId(account.id)}
                  >
                    <AccountIcon type={account.type} compact />
                    <View style={styles.walletInfo}>
                      <Text style={styles.exportOptionTitle}>{account.name}</Text>
                      <Text style={styles.exportOptionSubtitle}>{getAccountTypeMeta(account.type).label}</Text>
                    </View>
                    {isSelected ? <Check size={20} color={theme.primary} /> : <View style={styles.exportCheckSpacer} />}
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
              <Text style={styles.primaryButtonText}>Xuất giao dịch</Text>
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

        <BottomPopup
          animationType="fade"
          transparent
          visible={activeExportDateField !== null && Platform.OS !== "android"}
          onRequestClose={closeExportDatePicker}
        >
          <Pressable style={styles.bottomSheetOverlay} onPress={closeExportDatePicker}>
            <BottomPopupPressable style={styles.exportDatePickerSheet} onPress={(event) => event.stopPropagation()}>
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
            </BottomPopupPressable>
          </Pressable>
        </BottomPopup>
      </FocusedScreenTransition>
    );
  }

  if (view === "resetWarning") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <ScreenGradientBackground darkOnly />
        <PersonalScreenHeader title="Đặt lại tài khoản" onBack={() => setView("manage")} styles={styles} />

        <View style={styles.resetScreenBody}>
          <ScrollView contentContainerStyle={styles.resetWarningContent}>
            <View style={styles.resetWarningHero}>
              <Text style={styles.resetWarningIcon}>!</Text>
              <Text style={styles.resetWarningTitle}>Hành động này sẽ xóa vĩnh viễn dữ liệu tài chính hiện tại</Text>
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
          <ScreenGradientBackground darkOnly />
          <PersonalScreenHeader title="Xác nhận" onBack={() => setView("resetWarning")} styles={styles} />

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
        <ScreenGradientBackground darkOnly />
        <PersonalScreenHeader title="Tài khoản" onBack={() => setView("menu")} styles={styles} />

        <ScrollView contentContainerStyle={styles.manageContent} showsVerticalScrollIndicator={false}>
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
              <Text style={styles.manageTitle}>{user?.displayName ?? user?.username ?? "Người dùng"}</Text>
              <Text style={styles.manageSubtitle}>{user?.email ?? "Chưa có email"}</Text>
            </View>
          </View>

          <View style={styles.manageActionCard}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.manageDangerRow, pressed && styles.menuRowPressed]}
              onPress={openResetWarning}
            >
              <View style={[styles.menuIconBubble, { backgroundColor: `${theme.dangerText}12` }]}>
                <Trash2 size={20} color={theme.dangerText} strokeWidth={1.8} />
              </View>
              <View style={styles.manageTextGroup}>
                <Text style={styles.manageDangerTitle}>Đặt lại tài khoản</Text>
                <Text style={styles.manageSubtitle}>Xóa dữ liệu tài chính và bắt đầu lại</Text>
              </View>
              <ChevronRight size={18} color={theme.chevron} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            style={[styles.logoutButton, isLoggingOut && styles.buttonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? (
              <ActivityIndicator color={theme.dangerText} />
            ) : (
              <>
                <LogOut size={19} color={theme.dangerText} />
                <Text style={styles.logoutButtonText}>Đăng xuất</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </FocusedScreenTransition>
    );
  }

  if (view === "editProfile") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <ScreenGradientBackground darkOnly />
        <PersonalScreenHeader title="Chỉnh sửa hồ sơ" onBack={() => setView("menu")} styles={styles} />

        <ScrollView contentContainerStyle={styles.editProfileContent} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đổi ảnh đại diện"
            style={styles.editAvatarButton}
            onPress={handlePickAvatar}
          >
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
        reanimateOnFocus={false}
        style={styles.screen}
        triggerKey={`${view}-${statsReturnPath ?? "user"}`}
        variant="slide-left"
      >
        <ScreenGradientBackground darkOnly />
        <View style={styles.walletHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={closeSpendingStats}
            style={styles.statsBackButton}
          >
            <ArrowLeft size={23} color={theme.primary} />
          </Pressable>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[styles.topTitle, styles.statsHeaderTitle]}
          >
            Thống kê chi tiêu
          </Text>
          <View style={styles.statsHeaderSpacer} />
        </View>

        <ScrollView contentContainerStyle={[styles.statsContent, isDarkMode && { backgroundColor: "transparent" }]}>
          <View style={[styles.statsPanel, isDarkMode && { backgroundColor: "transparent" }]}>
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
                  <Pressable
                    accessibilityLabel="Xem nhận xét AI"
                    hitSlop={8}
                    onPress={toggleFinancialInsights}
                    style={[styles.insightToggleButton, isFinancialInsightsVisible && styles.insightToggleButtonActive]}
                  >
                    <SymbolView
                      fallback={
                        <Text
                          style={[
                            styles.insightToggleFallback,
                            isFinancialInsightsVisible && styles.insightToggleFallbackActive,
                          ]}
                        >
                          ✦
                        </Text>
                      }
                      name={{ android: "auto_awesome", ios: "sparkles", web: "auto_awesome" }}
                      size={18}
                      tintColor={isFinancialInsightsVisible ? theme.textInverse : theme.primary}
                    />
                  </Pressable>
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
                  const isExpanded = expandedCategoryKey === categoryKey;

                  return (
                    <Pressable
                      key={categoryKey}
                      onPress={() => handleSelectCategory(categoryKey)}
                      style={[styles.statCard, isSelected && styles.statCardSelected]}
                    >
                      <View style={styles.statCategoryHeader}>
                        <CategoryIconBadge
                          icon={category.icon}
                          name={category.categoryName}
                          type="Expense"
                          size={40}
                          style={{ marginRight: 14 }}
                        />
                        <View style={styles.walletInfo}>
                          <Text style={styles.statCategoryName}>{category.categoryName}</Text>
                          <Text style={styles.statCategoryMeta}>
                            {category.transactionCount} giao dịch · {category.percentage.toFixed(1)}%
                          </Text>
                        </View>
                        <Text style={styles.statCategoryAmount}>{formatMoney(category.amount, "VND")}</Text>
                        <Pressable
                          accessibilityLabel={isExpanded ? "Thu gọn giao dịch" : "Xem giao dịch"}
                          hitSlop={8}
                          onPress={(event) => {
                            event.stopPropagation();
                            toggleCategoryDetail(category);
                          }}
                          style={[styles.categoryDetailButton, isExpanded && styles.categoryDetailButtonActive]}
                        >
                          <SymbolView
                            fallback={<Text style={styles.categoryDetailIcon}>{isExpanded ? "⌃" : "⌄"}</Text>}
                            name={{
                              android: isExpanded ? "expand_less" : "expand_more",
                              ios: isExpanded ? "chevron.up" : "chevron.down",
                              web: isExpanded ? "expand_less" : "expand_more",
                            }}
                            size={17}
                            tintColor={theme.primary}
                          />
                        </Pressable>
                      </View>
                      <Text
                        style={[
                          styles.statCompareText,
                          category.changePercentage !== null && category.changePercentage < 0
                            ? styles.statCompareTextDecrease
                            : null,
                          category.changePercentage !== null && category.changePercentage > 0
                            ? styles.statCompareTextIncrease
                            : null,
                        ]}
                      >
                        Kỳ trước: {formatMoney(category.compareAmount, "VND")} ·{" "}
                        {formatChange(category.changePercentage)}
                      </Text>
                      {isExpanded ? (
                        <View style={styles.categoryTransactionsPanel}>
                          {isLoadingCategoryTransactions && categoryTransactions.length === 0 ? (
                            <ActivityIndicator color={theme.primary} size="small" />
                          ) : categoryTransactions.length === 0 ? (
                            <Text style={styles.categoryTransactionsEmpty}>Không có giao dịch trong tháng này.</Text>
                          ) : (
                            categoryTransactions.map((transaction) => (
                              <View key={transaction.id} style={styles.categoryTransactionRow}>
                                <View style={{ marginRight: 8 }}>
                                  <CategoryIconBadge
                                    icon={category.icon}
                                    name={category.categoryName}
                                    type={transaction.type}
                                    transferId={transaction.transferId}
                                    size={28}
                                    iconSize={18}
                                  />
                                </View>
                                <View style={styles.categoryTransactionCopy}>
                                  <Text numberOfLines={1} style={styles.categoryTransactionDescription}>
                                    {transaction.description || category.categoryName}
                                  </Text>
                                  <Text style={styles.categoryTransactionDate}>
                                    {formatTransactionDate(transaction.transactionDate)}
                                  </Text>
                                </View>
                                <Text
                                  style={[
                                    styles.categoryTransactionAmount,
                                    {
                                      color: isIncomingTransaction(transaction.type)
                                        ? theme.goodText
                                        : theme.dangerText,
                                    },
                                  ]}
                                >
                                  {isIncomingTransaction(transaction.type) ? "+" : "-"}
                                  {formatMoney(Math.abs(transaction.amount), "VND")}
                                </Text>
                              </View>
                            ))
                          )}
                          {categoryTransactionPage < categoryTransactionTotalPages ? (
                            <Pressable
                              disabled={isLoadingCategoryTransactions}
                              onPress={(event) => {
                                event.stopPropagation();
                                void loadCategoryTransactions(category, categoryTransactionPage + 1, true);
                              }}
                              style={styles.categoryTransactionsMoreButton}
                            >
                              {isLoadingCategoryTransactions ? (
                                <ActivityIndicator color={theme.primary} size="small" />
                              ) : (
                                <Text style={styles.categoryTransactionsMoreText}>Xem thêm</Text>
                              )}
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
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
      <ScreenGradientBackground />
      <ScrollView
        style={styles.scrollViewport}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.pageTitle}>Cá nhân</Text>
            <Text style={styles.pageSubtitle}>Tài khoản và tiện ích của bạn</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDarkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
            style={({ pressed }) => [styles.themeButton, pressed && styles.menuRowPressed]}
            onPress={toggleThemeMode}
          >
            <ThemeModeIconFrame style={iconAnimatedStyle}>
              {isDarkMode ? (
                <Sun size={21} color={theme.text} strokeWidth={1.8} />
              ) : (
                <Moon size={21} color={theme.text} strokeWidth={1.8} />
              )}
            </ThemeModeIconFrame>
          </Pressable>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.profileIdentity}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.avatar, pressed && styles.menuRowDisabled]}
              onPress={openEditProfile}
              accessibilityLabel="Chỉnh sửa hồ sơ"
            >
              {user?.avatarUrl ? (
                <Image
                  key={getAvatarCacheKey(user.avatarUrl)}
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatarImage}
                  onError={(event) => console.warn("Không tải được avatar", event.nativeEvent)}
                />
              ) : (
                <UserRound size={120} color={theme.textInverse} fill={theme.textInverse} strokeWidth={1.4} />
              )}
            </Pressable>
            <View style={styles.identityCopy}>
              <Text style={styles.username}>{user?.displayName ?? user?.username ?? "Người dùng"}</Text>
              <Text style={styles.email}>{user?.email ?? "Chưa có email"}</Text>
            </View>
          </View>

          <View style={styles.menuCard}>
            <PersonalMenuRow
              Icon={UserRoundPen}
              color={theme.primary}
              title="Chỉnh sửa hồ sơ"
              subtitle="Ảnh đại diện và tên hiển thị"
              onPress={openEditProfile}
              styles={styles}
            />
          </View>
        </View>

        <Text style={styles.menuSectionTitle}>Tài chính</Text>
        <View style={styles.menuCard}>
          <PersonalMenuRow
            Icon={Wallet}
            color={theme.primary}
            title="Ví của tôi"
            subtitle="Quản lý số dư và các ví"
            onPress={() => router.push("/account")}
            styles={styles}
          />
          <View style={styles.menuDivider} />
          <PersonalMenuRow
            Icon={ChartPie}
            color="#4285E5"
            title="Thống kê chi tiêu"
            subtitle="Theo dõi chi tiêu theo danh mục"
            styles={styles}
            onPress={() => {
              clearSpendingStatsFromTransactions();
              setStatsReturnPath(null);
              setView("spendingStats");
            }}
          />
          <View style={styles.menuDivider} />
          <PersonalMenuRow
            Icon={Download}
            color="#CF9131"
            title="Xuất giao dịch"
            subtitle="Lưu dữ liệu theo ví và thời gian"
            styles={styles}
            onPress={openExportFile}
            disabled={isExportingTransactions}
          />
        </View>

        <Text style={styles.menuSectionTitle}>Tài khoản</Text>
        <View style={styles.menuCard}>
          <PersonalMenuRow
            Icon={Settings2}
            color={theme.textMuted}
            title="Quản lý tài khoản"
            subtitle="Dữ liệu tài khoản và đăng xuất"
            onPress={() => setView("manage")}
            styles={styles}
          />
        </View>
      </ScrollView>
      {transitionOverlay}
    </FocusedScreenTransition>
  );
}

function PersonalScreenHeader({
  title,
  onBack,
  styles,
}: {
  title: string;
  onBack: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.walletHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        onPress={onBack}
        style={({ pressed }) => [styles.statsBackButton, pressed && styles.headerButtonPressed]}
      >
        <ArrowLeft size={22} color={theme.text} strokeWidth={1.8} />
      </Pressable>
      <Text style={[styles.topTitle, styles.statsHeaderTitle]}>{title}</Text>
      <View style={styles.statsHeaderSpacer} />
    </View>
  );
}

function PersonalMenuRow({
  Icon,
  color,
  title,
  subtitle,
  onPress,
  disabled = false,
  styles,
}: {
  Icon: LucideIcon;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed, disabled && styles.menuRowDisabled]}
    >
      <View style={[styles.menuIconBubble, { backgroundColor: `${color}18` }]}>
        <Icon size={21} color={color} strokeWidth={1.8} />
      </View>
      <View style={styles.manageTextGroup}>
        <Text style={styles.menuText}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={theme.chevron} />
    </Pressable>
  );
}

function createStyles(theme: AppTheme, topInset: number, bottomInset: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.screen },
    scrollViewport: { flex: 1 },
    content: {
      paddingHorizontal: 20,
      paddingTop: topInset + 16,
      paddingBottom: CURVED_TAB_BAR_HEIGHT + Math.max(bottomInset, 6) + 24,
    },
    headerRow: { alignItems: "center", flexDirection: "row", gap: 16, marginBottom: 24 },
    headerCopy: { flex: 1, minWidth: 0, gap: 4 },
    pageTitle: { ...Typography.title, color: theme.text, fontSize: 26, lineHeight: 34 },
    pageSubtitle: { ...Typography.small, color: theme.textMuted },
    themeButton: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    profileSection: { gap: 16 },
    profileIdentity: { alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    identityCopy: { width: "100%", minWidth: 0, alignItems: "center" },
    avatar: {
      alignItems: "center",
      backgroundColor: "#565D66",
      borderRadius: profileAvatarSize / 2,
      height: profileAvatarSize,
      flexShrink: 0,
      justifyContent: "center",
      width: profileAvatarSize,
    },
    avatarImage: { borderRadius: profileAvatarSize / 2, height: profileAvatarSize, width: profileAvatarSize },
    username: {
      color: theme.link,
      fontSize: 20,
      lineHeight: 28,
      fontWeight: "600",
      textAlign: "center",
      width: "100%",
    },
    email: { ...Typography.small, color: theme.textMuted, marginTop: 4, textAlign: "center", width: "100%" },
    manageTextGroup: { flex: 1, minWidth: 0 },
    manageTitle: { ...Typography.bodyLarge, color: theme.text, fontWeight: "600" },
    manageSubtitle: { ...Typography.small, color: theme.textMuted, marginTop: 4 },
    manageContent: { gap: 16, padding: 20, paddingBottom: CURVED_TAB_BAR_HEIGHT + Math.max(bottomInset, 6) + 24 },
    manageActionCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 20,
      overflow: "hidden",
    },
    manageDangerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: 80,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    manageDangerTitle: { ...Typography.label, color: theme.dangerText, fontWeight: "600" },
    profileMiniCard: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 20,
      flexDirection: "row",
      minHeight: 84,
      padding: 18,
    },
    smallAvatar: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 18,
      height: 48,
      justifyContent: "center",
      marginRight: 14,
      width: 48,
    },
    smallAvatarImage: { borderRadius: 18, height: 48, width: 48 },
    smallAvatarText: { color: theme.textInverse, fontSize: 24, fontWeight: "600" },
    editProfileContent: { gap: 22, padding: 20, paddingBottom: CURVED_TAB_BAR_HEIGHT + Math.max(bottomInset, 6) + 24 },
    editAvatarButton: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.primary,
      borderRadius: 32,
      height: 112,
      justifyContent: "center",
      marginBottom: 8,
      overflow: "hidden",
      width: 112,
    },
    editAvatarImage: { height: 112, width: 112 },
    editAvatarText: { color: theme.textInverse, fontSize: 52, fontWeight: "600" },
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
    avatarChangeText: { color: theme.textInverse, fontSize: 12, fontWeight: "600" },
    profileInfoBox: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: 6,
      padding: 18,
    },
    profileInfoLabel: { ...Typography.caption, color: theme.textMuted },
    profileInfoValue: { color: theme.text, fontSize: 16, fontWeight: "600" },
    profileInfoSubValue: { ...Typography.body, color: theme.textMuted },
    logoutButton: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: `${theme.dangerText}40`,
      borderWidth: 1,
      borderRadius: 16,
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      minHeight: 52,
    },
    logoutButtonText: { ...Typography.button, color: theme.dangerText },
    resetScreenBody: { flex: 1 },
    resetWarningContent: {
      gap: 16,
      padding: 20,
      paddingBottom: CURVED_TAB_BAR_HEIGHT + Math.max(bottomInset, 6) + 100,
    },
    resetWarningHero: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      padding: 22,
    },
    resetWarningIcon: {
      color: theme.dangerText,
      fontSize: 44,
      fontWeight: "600",
      lineHeight: 48,
      marginBottom: 10,
    },
    resetWarningTitle: { color: theme.text, fontSize: 20, fontWeight: "600", lineHeight: 27, textAlign: "center" },
    resetWarningText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: "400",
      lineHeight: 21,
      marginTop: 10,
      textAlign: "center",
    },
    resetImpactCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 20,
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
    resetImpactBullet: { color: theme.dangerText, fontSize: 22, fontWeight: "600", marginRight: 12, width: 20 },
    resetImpactText: { color: theme.text, flex: 1, fontSize: 15, fontWeight: "600", lineHeight: 21 },
    resetFooter: {
      backgroundColor: theme.screen,
      borderTopColor: theme.border,
      borderTopWidth: 1,
      bottom: 0,
      left: 0,
      paddingBottom: CURVED_TAB_BAR_HEIGHT + Math.max(bottomInset, 6) + 12,
      paddingHorizontal: 20,
      paddingTop: 12,
      position: "absolute",
      right: 0,
    },
    resetPasswordContent: {
      gap: 18,
      padding: 20,
      paddingBottom: CURVED_TAB_BAR_HEIGHT + Math.max(bottomInset, 6) + 24,
    },
    resetConfirmCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: 18,
      padding: 18,
    },
    resetConfirmTitle: { color: theme.text, fontSize: 19, fontWeight: "600" },
    resetConfirmText: { ...Typography.body, color: theme.textMuted, lineHeight: 21 },
    resetAuthDividerRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    resetAuthDividerLine: { backgroundColor: theme.border, flex: 1, height: 1 },
    resetAuthDividerText: { color: theme.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
    googleResetButton: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      minHeight: 50,
    },
    googleResetIcon: { color: theme.primary, fontSize: 18, fontWeight: "600" },
    googleResetText: { color: theme.text, fontSize: 15, fontWeight: "600" },
    dangerButton: {
      alignItems: "center",
      backgroundColor: theme.danger,
      borderRadius: 16,
      justifyContent: "center",
      minHeight: 52,
    },
    dangerButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: "600" },
    menuSectionTitle: {
      ...Typography.label,
      fontWeight: "600",
      color: theme.textMuted,
      marginTop: 24,
      marginBottom: 10,
      marginLeft: 4,
    },
    menuCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 20,
      overflow: "hidden",
    },
    menuRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: 76,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    menuRowPressed: { backgroundColor: theme.cardAlt },
    menuRowDisabled: { opacity: 0.62 },
    menuDivider: { backgroundColor: theme.border, height: StyleSheet.hairlineWidth, marginLeft: 68, marginRight: 16 },
    menuIconBubble: {
      alignItems: "center",
      justifyContent: "center",
      width: 40,
      height: 40,
      borderRadius: 13,
      flexShrink: 0,
    },
    menuText: { ...Typography.label, color: theme.text, fontSize: 15, lineHeight: 22, fontWeight: "600" },
    menuSubtitle: { ...Typography.caption, color: theme.textMuted, marginTop: 3 },
    walletHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 16,
      paddingHorizontal: 20,
      paddingTop: topInset + 12,
    },
    topTitle: { ...Typography.section, color: theme.text, flexShrink: 1, textAlign: "center" },
    statsBackButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    headerButtonPressed: { backgroundColor: theme.cardAlt },
    statsHeaderTitle: { flex: 1, textAlign: "center" },
    statsHeaderSpacer: { width: 44 },
    topBar: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
      marginTop: 32,
    },
    insightToggleButton: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    insightToggleButtonActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    insightToggleFallback: { color: theme.primary, fontSize: 18, fontWeight: "600" },
    insightToggleFallbackActive: { color: theme.textInverse },
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
    exportContent: { gap: 16, padding: 20, paddingBottom: CURVED_TAB_BAR_HEIGHT + Math.max(bottomInset, 6) + 24 },
    exportSection: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      overflow: "hidden",
    },
    exportSectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "600",
      paddingHorizontal: 16,
      paddingTop: 15,
      paddingBottom: 10,
    },
    exportOptionRow: {
      alignItems: "center",
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      minHeight: 70,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    exportOptionRowActive: { backgroundColor: theme.primaryPressed },
    exportOptionIcon: {
      alignItems: "center",
      backgroundColor: `${theme.primary}18`,
      borderRadius: 12,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    exportOptionTitle: { ...Typography.label, color: theme.text, fontWeight: "600" },
    exportOptionSubtitle: { ...Typography.small, color: theme.textMuted, marginTop: 3 },
    exportCheckSpacer: { width: 20 },
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
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      gap: 7,
      minHeight: 76,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    exportDateLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
    exportDateValue: { ...Typography.label, color: theme.text, fontWeight: "600" },
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
    datePickerTitle: { color: theme.text, flex: 1, fontSize: 17, fontWeight: "600", textAlign: "center" },
    datePickerAction: { fontSize: 16, fontWeight: "600" },
    datePicker: { alignSelf: "stretch" },
    statsContent: { backgroundColor: theme.screen, padding: 14, paddingBottom: 96 },
    statsPanel: { backgroundColor: theme.screen, borderRadius: 8, gap: 12, padding: 4 },
    monthSwitcher: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 44 },
    monthButton: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
    monthButtonDisabled: { opacity: 0.28 },
    monthButtonText: { color: theme.chevron, fontSize: 34, fontWeight: "500", lineHeight: 34 },
    monthTitleWrap: { alignItems: "center", flex: 1 },
    monthTitle: { color: theme.text, fontSize: 15, fontWeight: "600" },
    monthSubtitle: { color: theme.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
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
    insightBadgeText: { color: theme.primary, fontSize: 11, fontWeight: "600" },
    insightTitle: { color: theme.text, fontSize: 15, fontWeight: "600" },
    insightSummary: { color: theme.text, fontSize: 14, fontWeight: "600", lineHeight: 20 },
    insightLoadingRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 34 },
    insightErrorRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
    insightMutedText: { color: theme.textMuted, flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 19 },
    insightRetryText: { color: theme.primary, fontSize: 13, fontWeight: "600" },
    insightItem: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
    insightIcon: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 15,
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    insightIconText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
    insightCopy: { flex: 1, gap: 2 },
    insightItemTitle: { color: theme.text, fontSize: 13, fontWeight: "600" },
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
    statsSummaryLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "600", marginBottom: 7 },
    statsSummaryValue: { color: theme.text, fontSize: 18, fontWeight: "600" },
    statsTrendCard: {
      alignItems: "center",
      borderRadius: 8,
      flexDirection: "row",
      gap: 10,
      minHeight: 42,
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statsTrendCardGood: { backgroundColor: theme.goodBackground },
    statsTrendCardWarn: { backgroundColor: theme.warningBackground },
    statsTrendText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
    statsTrendTextGood: { color: theme.goodText },
    statsTrendTextWarn: { color: theme.warning },
    chartSection: {
      alignItems: "center",
      elevation: 24,
      paddingVertical: 8,
      position: "relative",
      zIndex: 24,
    },
    detailTitle: { color: theme.accent, fontSize: 13, fontWeight: "600", marginTop: 2, textAlign: "center" },
    statsEmptyText: { color: theme.textMuted, fontSize: 15, lineHeight: 22, paddingVertical: 36, textAlign: "center" },
    balanceSummary: { backgroundColor: theme.card, borderRadius: 8, padding: 18 },
    summaryLabel: { color: theme.textMuted, fontSize: 14, marginBottom: 4 },
    summaryValue: { color: theme.text, fontSize: 26, fontWeight: "600" },
    walletCard: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderRadius: 8,
      flexDirection: "row",
      minHeight: 78,
      padding: 16,
    },
    statControlCard: { backgroundColor: theme.card, borderRadius: 8, gap: 14, padding: 16 },
    statControlTitle: { color: theme.textMuted, fontSize: 13, fontWeight: "600" },
    periodRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
    periodValue: { color: theme.text, fontSize: 15, fontWeight: "600", minWidth: 64, textAlign: "center" },
    stepButton: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 8,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    stepButtonText: { color: theme.text, fontSize: 22, fontWeight: "600", lineHeight: 24 },
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
    statCategoryName: { color: theme.text, fontSize: 16, fontWeight: "600" },
    statCategoryMeta: { color: theme.textMuted, fontSize: 13, fontWeight: "600", marginTop: 3 },
    statCategoryAmount: { color: theme.text, fontSize: 15, fontWeight: "600" },
    categoryDetailButton: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 16,
      height: 32,
      justifyContent: "center",
      marginLeft: 9,
      width: 32,
    },
    categoryDetailButtonActive: { backgroundColor: theme.primaryPressed },
    categoryDetailIcon: { color: theme.primary, fontSize: 18, fontWeight: "600", lineHeight: 20 },
    statCompareText: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
    statCompareTextDecrease: { color: theme.goodText, fontWeight: "600" },
    statCompareTextIncrease: { color: theme.dangerText, fontWeight: "600" },
    categoryTransactionsPanel: { borderTopColor: theme.border, borderTopWidth: 1, gap: 2, paddingTop: 8 },
    categoryTransactionsEmpty: { color: theme.textMuted, fontSize: 12, paddingVertical: 10, textAlign: "center" },
    categoryTransactionRow: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      minHeight: 48,
      paddingVertical: 7,
    },
    categoryTransactionCopy: { flex: 1, marginRight: 10 },
    categoryTransactionDescription: { color: theme.text, fontSize: 13, fontWeight: "600" },
    categoryTransactionDate: { color: theme.textMuted, fontSize: 11, marginTop: 3 },
    categoryTransactionAmount: { color: theme.dangerText, fontSize: 12, fontWeight: "600" },
    categoryTransactionsMoreButton: { alignItems: "center", minHeight: 38, justifyContent: "center" },
    categoryTransactionsMoreText: { color: theme.primary, fontSize: 13, fontWeight: "600" },
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
    walletName: { ...Typography.section, color: theme.text },
    walletType: { color: theme.textMuted, fontSize: 14, marginTop: 3 },
    walletBalance: { ...Typography.label, color: theme.text },
    emptyText: { color: theme.textMuted, fontSize: 16, lineHeight: 23, marginTop: 18, textAlign: "center" },
    form: { gap: 18, paddingTop: 28 },
    field: { gap: 8 },
    label: { ...Typography.label, color: theme.text },
    input: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.border,
      borderRadius: 16,
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
    typeOptionText: { color: theme.textSoft, fontWeight: "600" },
    typeOptionTextSelected: { color: theme.textInverse },
    row: { flexDirection: "row", gap: 12 },
    currencyField: { flex: 0.8 },
    balanceField: { flex: 1.4 },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 16,
      justifyContent: "center",
      minHeight: 50,
    },
    buttonDisabled: { opacity: 0.7 },
    primaryButtonText: { ...Typography.button, color: theme.textInverse },
  });
}
