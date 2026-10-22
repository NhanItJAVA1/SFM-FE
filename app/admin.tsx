import { BottomPopup, BottomPopupSheet } from "@/components/bottom-popup";
import * as DocumentPicker from "expo-document-picker";
import { router, useFocusEffect } from "expo-router";
import {
  Banknote,
  Briefcase,
  Car,
  CircleDollarSign,
  Eye,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  PiggyBank,
  Plane,
  Receipt,
  RotateCw,
  ShoppingBag,
  Trash2,
  Utensils,
  Wallet,
} from "lucide-react-native";
import { type ComponentType, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  adminApi,
  type AdminUser,
  type AdminUserRole,
  type AdminUserStatus,
} from "@/api/adminApi";
import { aiApi, type ForecastTrainingMetrics, type ForecastTrainingResponse } from "@/api/aiApi";
import { authApi } from "@/api/authApi";
import { type Category, type CategoryType } from "@/api/categoriesApi";
import { RAG_DOCUMENT_UPLOAD_CONTENT_TYPE, ragDocumentsApi, type RagDocument } from "@/api/ragDocumentsApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { useAppTheme } from "@/hooks/use-app-theme";
import { getAuthRefreshToken, getAuthUser } from "@/stores/authSession";
import { clearAuthSession } from "@/stores/persistedAuthSession";
import type { AppTheme } from "@/theme/appTheme";
import { isAdminUser } from "@/utils/authRole";

type AdminView = "dashboard" | "users" | "categories" | "documents" | "training";
type CategoryFormState = {
  icon: string;
  name: string;
  type: CategoryType;
};
type CategoryIconComponent = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;
type CategoryIconOption = {
  Icon: CategoryIconComponent;
  key: string;
  label: string;
};
type RagUploadFormState = {
  title: string;
  description: string;
  fileName: string;
  fileType: string;
  ragCategory: string;
  asset: DocumentPicker.DocumentPickerAsset | null;
};
type RagMetadataFormState = {
  title: string;
  description: string;
  ragCategory: string;
};

const emptyCategoryForm: CategoryFormState = {
  icon: "",
  name: "",
  type: "Expense",
};
const emptyRagUploadForm: RagUploadFormState = {
  asset: null,
  description: "",
  fileName: "",
  fileType: "",
  ragCategory: "General",
  title: "",
};
const emptyRagMetadataForm: RagMetadataFormState = {
  description: "",
  ragCategory: "General",
  title: "",
};
const supportedRagFileExtensions = new Set(["txt", "docs", "md", "pdf"]);
const userStatusOptions: AdminUserStatus[] = ["Active", "Inactive", "Suspended"];
const userRoleOptions: AdminUserRole[] = ["User", "Admin"];
const categoryIconOptions: CategoryIconOption[] = [
  { Icon: Utensils, key: "food", label: "Ăn uống" },
  { Icon: Car, key: "transport", label: "Di chuyển" },
  { Icon: Home, key: "home", label: "Nhà cửa" },
  { Icon: ShoppingBag, key: "shopping", label: "Mua sắm" },
  { Icon: HeartPulse, key: "health", label: "Sức khỏe" },
  { Icon: GraduationCap, key: "education", label: "Học tập" },
  { Icon: Gamepad2, key: "entertainment", label: "Giải trí" },
  { Icon: Receipt, key: "bill", label: "Hóa đơn" },
  { Icon: Wallet, key: "wallet", label: "Ví tiền" },
  { Icon: Briefcase, key: "work", label: "Công việc" },
  { Icon: Gift, key: "gift", label: "Quà tặng" },
  { Icon: CircleDollarSign, key: "income", label: "Thu nhập" },
  { Icon: PiggyBank, key: "saving", label: "Tiết kiệm" },
  { Icon: Plane, key: "travel", label: "Du lịch" },
  { Icon: Banknote, key: "cash", label: "Tiền mặt" },
  { Icon: MoreHorizontal, key: "other", label: "Khác" },
];

function showAdminMessage(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

function confirmAdminAction(title: string, message: string, onConfirm: () => void, confirmLabel: string, destructive = false) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { style: "cancel", text: "Hủy" },
    { onPress: onConfirm, style: destructive ? "destructive" : "default", text: confirmLabel },
  ]);
}

function useAdminStyles() {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();

  return useMemo(() => createStyles(theme, width >= 900), [theme, width]);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Chưa có";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getRequestErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { status?: number; data?: unknown } }).response;
    const data = response?.data;

    if (typeof data === "object" && data !== null && "message" in data) {
      return `HTTP ${response?.status ?? "?"}: ${String(data.message)}`;
    }
  }

  return error instanceof Error ? error.message : "Vui lòng thử lại sau.";
}

function formatTrainingNumber(value: number, currency?: string) {
  const formatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: currency ? 0 : 2 }).format(value);

  return currency ? `${formatted} ${currency}` : formatted;
}

function getCategoryTypeLabel(type: Category["type"]) {
  return type === "Income" ? "Thu nhập" : "Chi tiêu";
}

function getUserStatusLabel(status: AdminUserStatus | string | null | undefined) {
  if (status === "Active") {
    return "Đang hoạt động";
  }

  if (status === "Inactive") {
    return "Không hoạt động";
  }

  if (status === "Suspended") {
    return "Bị đình chỉ";
  }

  return status || "Chưa cập nhật";
}

function getCategoryIconOption(icon: string | null | undefined) {
  if (!icon) {
    return null;
  }

  return categoryIconOptions.find((option) => option.key === icon) ?? null;
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();

  return extension && extension !== fileName.toLowerCase() ? extension : "txt";
}

function isSupportedRagFileType(fileType: string) {
  return supportedRagFileExtensions.has(fileType.toLowerCase());
}

function getRagDocumentStatusLabel(document: RagDocument) {
  return document.statusName || document.status;
}

function formatFileSize(size?: number) {
  if (!size) {
    return "Không rõ dung lượng";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminScreen() {
  const theme = useAppTheme();
  const styles = useAdminStyles();
  const currentUser = getAuthUser();
  const [view, setView] = useState<AdminView>("dashboard");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ragDocuments, setRagDocuments] = useState<RagDocument[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [trainingUserIds, setTrainingUserIds] = useState<number[]>([]);
  const [trainingAsOf, setTrainingAsOf] = useState("2025-12-31");
  const [isTrainingDatePickerVisible, setIsTrainingDatePickerVisible] = useState(false);
  const [isTrainingForecast, setIsTrainingForecast] = useState(false);
  const [trainingResult, setTrainingResult] = useState<ForecastTrainingResponse | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<AdminUserRole | "All">("All");
  const [userStatusFilter, setUserStatusFilter] = useState<AdminUserStatus | "All">("All");
  const [isTrainingFilterVisible, setIsTrainingFilterVisible] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize] = useState(20);
  const [userTotalCount, setUserTotalCount] = useState(0);
  const [processingUserId, setProcessingUserId] = useState<number | null>(null);
  const [selectedRagDocument, setSelectedRagDocument] = useState<RagDocument | null>(null);
  const [actionMenuRagDocument, setActionMenuRagDocument] = useState<RagDocument | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingRagDocument, setEditingRagDocument] = useState<RagDocument | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [ragUploadForm, setRagUploadForm] = useState<RagUploadFormState>(emptyRagUploadForm);
  const [ragMetadataForm, setRagMetadataForm] = useState<RagMetadataFormState>(emptyRagMetadataForm);
  const [isCategoryFormVisible, setIsCategoryFormVisible] = useState(false);
  const [isCategoryIconPickerVisible, setIsCategoryIconPickerVisible] = useState(false);
  const [isRagDetailVisible, setIsRagDetailVisible] = useState(false);
  const [isRagUploadVisible, setIsRagUploadVisible] = useState(false);
  const [isRagMetadataVisible, setIsRagMetadataVisible] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isLoadingRagDetail, setIsLoadingRagDetail] = useState(false);
  const [isUploadingRagDocument, setIsUploadingRagDocument] = useState(false);
  const [isSavingRagMetadata, setIsSavingRagMetadata] = useState(false);
  const [processingDocumentId, setProcessingDocumentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminLoadWarnings, setAdminLoadWarnings] = useState<string[]>([]);
  const ragMetadataOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defaultCategories = categories;
  const userTotalPages = Math.max(1, Math.ceil(userTotalCount / userPageSize));

  useEffect(() => {
    return () => {
      if (ragMetadataOpenTimerRef.current) {
        clearTimeout(ragMetadataOpenTimerRef.current);
      }
    };
  }, []);

  const loadAdminData = useCallback(async ({ refresh = false, silent = false } = {}) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else if (!silent) {
        setIsLoading(true);
      }

      const usersRequest = adminApi.listUsers({
        page: userPage,
        pageSize: userPageSize,
        role: userRoleFilter === "All" ? undefined : userRoleFilter,
        search: userSearch.trim() || undefined,
        status: userStatusFilter === "All" ? undefined : userStatusFilter,
      });
      setIsLoadingUsers(true);
      // The user list has its own loading state. Don't make it wait for the
      // unrelated categories and RAG requests below.
      void usersRequest
        .then(({ data }) => {
          if (Array.isArray(data)) {
            const filteredUsers = data.filter((user) => {
              const matchesRole = userRoleFilter === "All" || user.role === userRoleFilter;
              const matchesStatus = userStatusFilter === "All" || !user.status || user.status === userStatusFilter;
              const normalizedSearch = userSearch.trim().toLowerCase();
              const matchesSearch = !normalizedSearch || [user.username, user.email, user.displayName ?? ""]
                .some((value) => value.toLowerCase().includes(normalizedSearch));

              return matchesRole && matchesStatus && matchesSearch;
            });
            const pageCount = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
            const resolvedPage = Math.min(userPage, pageCount);
            const pageStart = (resolvedPage - 1) * userPageSize;

            setUsers(filteredUsers.slice(pageStart, pageStart + userPageSize));
            setUserTotalCount(filteredUsers.length);
            setUserPage(resolvedPage);
          } else {
            setUsers(Array.isArray(data.items) ? data.items : []);
            setUserTotalCount(data.totalCount ?? 0);
            setUserPage(data.page ?? userPage);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          setIsLoadingUsers(false);
        });

      const results = await Promise.allSettled([
        usersRequest,
        adminApi.listDefaultCategories(),
        ragDocumentsApi.list(),
      ]);

      const [usersResult, categoriesResult, ragDocumentsResult] = results;
      const warnings: string[] = [];

      if (usersResult.status === "rejected") {
        warnings.push(`Không tải được danh sách user: ${getRequestErrorMessage(usersResult.reason)}`);
      }

      if (categoriesResult.status === "fulfilled") {
        setCategories(Array.isArray(categoriesResult.value.data) ? categoriesResult.value.data : []);
      } else {
        warnings.push(`Không tải được danh mục: ${getRequestErrorMessage(categoriesResult.reason)}`);
      }

      if (ragDocumentsResult.status === "fulfilled") {
        setRagDocuments(Array.isArray(ragDocumentsResult.value.data) ? ragDocumentsResult.value.data : []);
      } else {
        warnings.push(`Không tải được tài liệu RAG: ${getRequestErrorMessage(ragDocumentsResult.reason)}`);
      }

      setAdminLoadWarnings(warnings);
    } catch (error) {
      if (silent) {
        console.warn("Không tải được admin dashboard", error);
      } else {
        showAdminMessage("Không tải được dữ liệu admin", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      setIsRefreshing(false);
    }
  }, [userPage, userPageSize, userRoleFilter, userSearch, userStatusFilter]);

  useFocusEffect(
    useCallback(() => {
      if (isAdminUser(currentUser)) {
        loadAdminData({
          silent: users.length > 0 || categories.length > 0 || ragDocuments.length > 0,
        });
      }
    }, [categories.length, currentUser, loadAdminData, ragDocuments.length, users.length]),
  );

  async function openUserDetail(user: AdminUser) {
    try {
      setSelectedUser(user);
      setProcessingUserId(user.id);
      const response = await adminApi.getUser(user.id);

      setSelectedUser(response.data);
      setUsers((current) => (current ?? []).map((item) => (item.id === user.id ? response.data : item)));
    } catch (error) {
      showAdminMessage("Không tải được thông tin user", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setProcessingUserId(null);
    }
  }

  function updateUserSearch(nextSearch: string) {
    setUserSearch(nextSearch);
    setUserPage(1);
  }

  function updateUserRoleFilter(nextRole: AdminUserRole | "All") {
    setUserRoleFilter(nextRole);
    setUserPage(1);
  }

  function updateUserStatusFilter(nextStatus: AdminUserStatus | "All") {
    setUserStatusFilter(nextStatus);
    setUserPage(1);
  }

  function handleTrainingDateChange(event: DateTimePickerEvent, date?: Date) {
    if (event.type === "dismissed") {
      setIsTrainingDatePickerVisible(false);
      return;
    }

    if (date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      setTrainingAsOf(`${year}-${month}-${day}`);
    }

    if (Platform.OS === "android") {
      setIsTrainingDatePickerVisible(false);
    }
  }

  function toggleTrainingUser(userId: number) {
    setTrainingUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function trainSelectedUsers() {
    if (trainingUserIds.length === 0) {
      showAdminMessage("Chưa chọn user", "Chọn ít nhất một user để train model.");
      return;
    }

    const asOfDate = new Date(`${trainingAsOf}T00:00:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(trainingAsOf) ||
      Number.isNaN(asOfDate.getTime()) ||
      asOfDate.toISOString().slice(0, 10) !== trainingAsOf
    ) {
      showAdminMessage("Ngày không hợp lệ", "Nhập ngày theo định dạng YYYY-MM-DD.");
      return;
    }

    try {
      setIsTrainingForecast(true);
      const response = await aiApi.trainForecast({ asOf: trainingAsOf, userId: trainingUserIds });
      setTrainingResult(response.data);
    } catch (error) {
      showAdminMessage("Train model thất bại", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsTrainingForecast(false);
    }
  }

  function requestUpdateUserStatus(user: AdminUser, status: AdminUserStatus) {
    if (user.status === status) {
      return;
    }

    confirmAdminAction("Cập nhật trạng thái", `Đổi trạng thái ${user.username} thành "${getUserStatusLabel(status)}"?`, () => void updateUserStatus(user, status), "Cập nhật");
  }

  async function updateUserStatus(user: AdminUser, status: AdminUserStatus) {
    try {
      setProcessingUserId(user.id);
      const response = await adminApi.updateUserStatus(user.id, { status });

      setUsers((current) => (current ?? []).map((item) => (item.id === user.id ? response.data : item)));
      setSelectedUser((current) => (current?.id === user.id ? response.data : current));
    } catch (error) {
      showAdminMessage("Không cập nhật được trạng thái", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setProcessingUserId(null);
    }
  }

  function requestUpdateUserRole(user: AdminUser, role: AdminUserRole) {
    if (user.role === role) {
      return;
    }

    confirmAdminAction("Cập nhật vai trò", `Đổi vai trò ${user.username} thành "${role}"?`, () => void updateUserRole(user, role), "Cập nhật");
  }

  async function updateUserRole(user: AdminUser, role: AdminUserRole) {
    try {
      setProcessingUserId(user.id);
      const response = await adminApi.updateUserRole(user.id, { role });

      setUsers((current) => (current ?? []).map((item) => (item.id === user.id ? response.data : item)));
      setSelectedUser((current) => (current?.id === user.id ? response.data : current));
    } catch (error) {
      showAdminMessage("Không cập nhật được vai trò", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setProcessingUserId(null);
    }
  }

  function openAddDefaultCategory() {
    setEditingCategory(null);
    setCategoryForm(emptyCategoryForm);
    setIsCategoryIconPickerVisible(false);
    setIsCategoryFormVisible(true);
  }

  function openEditDefaultCategory(category: Category) {
    setEditingCategory(category);
    setCategoryForm({
      icon: category.icon ?? "",
      name: category.name,
      type: category.type,
    });
    setIsCategoryIconPickerVisible(false);
    setIsCategoryFormVisible(true);
  }

  function closeCategoryForm() {
    if (isSavingCategory) {
      return;
    }

    setIsCategoryFormVisible(false);
    setIsCategoryIconPickerVisible(false);
    setEditingCategory(null);
    setCategoryForm(emptyCategoryForm);
  }

  async function saveDefaultCategory() {
    const name = categoryForm.name.trim();
    const icon = categoryForm.icon.trim() || "other";

    if (!name) {
      showAdminMessage("Thiếu tên danh mục", "Vui lòng nhập tên category mặc định.");
      return;
    }

    try {
      setIsSavingCategory(true);
      const payload = {
        icon,
        isDefault: true,
        name,
        type: categoryForm.type,
      };

      if (editingCategory) {
        const response = await adminApi.updateDefaultCategory(editingCategory.id, payload);
        setCategories((current) =>
          (current ?? []).map((item) => (item.id === response.data.id ? response.data : item)),
        );
      } else {
        const response = await adminApi.createDefaultCategory(payload);
        setCategories((current) =>
          [...(current ?? []), response.data].sort((left, right) => left.name.localeCompare(right.name)),
        );
      }

      setIsCategoryFormVisible(false);
      setEditingCategory(null);
      setCategoryForm(emptyCategoryForm);
    } catch (error) {
      showAdminMessage("Không lưu được category", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsSavingCategory(false);
    }
  }

  function requestDeleteDefaultCategory(category: Category) {
    confirmAdminAction("Xóa category mặc định", `Bạn có chắc muốn xóa "${category.name}" không?`, () => void deleteDefaultCategory(category), "Xóa", true);
  }

  async function deleteDefaultCategory(category: Category) {
    try {
      await adminApi.deleteDefaultCategory(category.id);
      setCategories((current) => (current ?? []).filter((item) => item.id !== category.id));
    } catch (error) {
      showAdminMessage("Không xóa được category", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    }
  }

  function openRagUpload() {
    setRagUploadForm(emptyRagUploadForm);
    setIsRagUploadVisible(true);
  }

  async function pickRagDocumentFile() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: "*/*",
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    const fileType = getFileExtension(asset.name);

    if (!isSupportedRagFileType(fileType)) {
      showAdminMessage("Định dạng chưa hỗ trợ", "Hiện chỉ hỗ trợ .txt, .docs, .md và .pdf.");
      return;
    }

    const title = ragUploadForm.title.trim() || asset.name.replace(/\.[^/.]+$/, "");

    setRagUploadForm((current) => ({
      ...current,
      asset,
      fileName: asset.name,
      fileType,
      title,
    }));
  }

  async function uploadRagDocument() {
    const title = ragUploadForm.title.trim();
    const description = ragUploadForm.description.trim();
    const ragCategory = ragUploadForm.ragCategory.trim() || "General";
    const asset = ragUploadForm.asset;
    const fileType = ragUploadForm.fileType || (asset ? getFileExtension(asset.name) : "");
    let createdDocumentId: number | null = null;

    if (!asset) {
      showAdminMessage("Chưa chọn file", "Vui lòng chọn tài liệu cần upload.");
      return;
    }

    if (!title) {
      showAdminMessage("Thiếu tiêu đề", "Vui lòng nhập tiêu đề tài liệu.");
      return;
    }

    if (!isSupportedRagFileType(fileType)) {
      showAdminMessage("Định dạng chưa hỗ trợ", "Hiện chỉ hỗ trợ .txt, .docs, .md và .pdf.");
      return;
    }

    try {
      setIsUploadingRagDocument(true);
      const uploadUrlResponse = await ragDocumentsApi.createUploadUrl({
        contentType: RAG_DOCUMENT_UPLOAD_CONTENT_TYPE,
        description: description || null,
        fileName: ragUploadForm.fileName || asset.name,
        fileType,
        ragCategory: ragCategory || null,
        title,
      });

      createdDocumentId = uploadUrlResponse.data.documentId;

      await ragDocumentsApi.uploadFileToPresignedUrl(uploadUrlResponse.data.uploadUrl, asset.uri, asset.file ?? null);
      await ragDocumentsApi.confirm(createdDocumentId);
      setIsRagUploadVisible(false);
      setRagUploadForm(emptyRagUploadForm);
      await loadAdminData({ refresh: true });
      showAdminMessage("Upload thành công", "Tài liệu đã được upload và gửi yêu cầu indexing.");
    } catch (error) {
      if (createdDocumentId !== null) {
        await loadAdminData({ refresh: true });
      }

      showAdminMessage(
        createdDocumentId === null ? "Tạo tài liệu thất bại" : "Upload hoặc confirm thất bại",
        error instanceof Error ? error.message : "Vui lòng thử lại sau.",
      );
    } finally {
      setIsUploadingRagDocument(false);
    }
  }

  function openEditRagMetadata(document: RagDocument) {
    setEditingRagDocument(document);
    setRagMetadataForm({
      description: document.description ?? "",
      ragCategory: document.ragCategory ?? "General",
      title: document.title,
    });
    setIsRagMetadataVisible(true);
  }

  function queueOpenEditRagMetadata(document: RagDocument, { closeDetail = false } = {}) {
    if (ragMetadataOpenTimerRef.current) {
      clearTimeout(ragMetadataOpenTimerRef.current);
    }

    setActionMenuRagDocument(null);

    if (closeDetail) {
      setIsRagDetailVisible(false);
    }

    ragMetadataOpenTimerRef.current = setTimeout(() => {
      ragMetadataOpenTimerRef.current = null;
      openEditRagMetadata(document);
    }, 250);
  }

  async function saveRagMetadata() {
    if (!editingRagDocument) {
      return;
    }

    const title = ragMetadataForm.title.trim();
    const description = ragMetadataForm.description.trim();
    const ragCategory = ragMetadataForm.ragCategory.trim() || "General";

    if (!title) {
      showAdminMessage("Thiếu tiêu đề", "Vui lòng nhập tiêu đề tài liệu.");
      return;
    }

    try {
      setIsSavingRagMetadata(true);
      await ragDocumentsApi.updateMetadata(editingRagDocument.id, {
        description,
        ragCategory,
        title,
      });
      const response = await ragDocumentsApi.get(editingRagDocument.id);

      setRagDocuments((current) =>
        (current ?? []).map((document) => (document.id === editingRagDocument.id ? response.data : document)),
      );
      setSelectedRagDocument((current) => (current?.id === editingRagDocument.id ? response.data : current));
      setIsRagMetadataVisible(false);
      setEditingRagDocument(null);
      setRagMetadataForm(emptyRagMetadataForm);
      showAdminMessage("Đã lưu metadata", "Thông tin tài liệu đã được cập nhật.");
    } catch (error) {
      showAdminMessage("Không lưu được metadata", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsSavingRagMetadata(false);
    }
  }

  function requestDeleteRagDocument(document: RagDocument) {
    setActionMenuRagDocument(null);
    confirmAdminAction("Xóa tài liệu RAG", `Bạn muốn xóa "${document.title}"?`, () => void deleteRagDocument(document), "Xóa", true);
  }

  async function deleteRagDocument(document: RagDocument) {
    try {
      setProcessingDocumentId(document.id);
      await ragDocumentsApi.remove(document.id);
      setRagDocuments((current) => (current ?? []).filter((item) => item.id !== document.id));
      if (selectedRagDocument?.id === document.id) {
        setSelectedRagDocument(null);
        setIsRagDetailVisible(false);
      }
      showAdminMessage("Đã xóa tài liệu", "Tài liệu RAG đã được xóa.");
    } catch (error) {
      showAdminMessage("Không xóa được tài liệu", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setProcessingDocumentId(null);
    }
  }

  async function openRagDocumentDetail(document: RagDocument) {
    try {
      setSelectedRagDocument(document);
      setIsRagDetailVisible(true);
      setIsLoadingRagDetail(true);
      const response = await ragDocumentsApi.get(document.id);

      setSelectedRagDocument(response.data);
      setRagDocuments((current) =>
        (current ?? []).map((item) => (item.id === document.id ? response.data : item)),
      );
    } catch (error) {
      showAdminMessage("Không tải được chi tiết tài liệu", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsLoadingRagDetail(false);
    }
  }

  async function reindexRagDocument(document: RagDocument) {
    try {
      setProcessingDocumentId(document.id);
      await ragDocumentsApi.reindex(document.id);
      const response = await ragDocumentsApi.get(document.id);
      setRagDocuments((current) =>
        (current ?? []).map((item) => (item.id === document.id ? response.data : item)),
      );
      setSelectedRagDocument((current) => (current?.id === document.id ? response.data : current));
      showAdminMessage("Đã chạy reindex", "Yêu cầu indexing lại đã hoàn tất.");
    } catch (error) {
      showAdminMessage("Không chạy lại indexing", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setProcessingDocumentId(null);
    }
  }

  function confirmLogout() {
    confirmAdminAction("Đăng xuất", "Bạn muốn đăng xuất khỏi trang Admin?", () => void handleLogout(), "Đăng xuất", true);
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

  if (!isAdminUser(currentUser)) {
    return (
      <FocusedScreenTransition style={styles.screen}>
        <SafeAreaView style={styles.screen} edges={["top"]}>
          <View style={styles.deniedCard}>
            <Text style={styles.deniedTitle}>Không có quyền truy cập</Text>
            <Text style={styles.deniedText}>Tab này chỉ dành cho tài khoản Admin.</Text>
          </View>
        </SafeAreaView>
      </FocusedScreenTransition>
    );
  }

  if (selectedUser) {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey="admin-user-detail" variant="slide-left">
        <SafeAreaView style={styles.screen} edges={["top"]}>
          <View style={styles.header}>
            <Pressable onPress={() => setSelectedUser(null)} hitSlop={12}>
              <Text style={styles.backText}>‹ Users</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Thông tin user</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.userDetailCard}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {(selectedUser.displayName ?? selectedUser.username ?? "U").charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.userDetailName}>{selectedUser.displayName ?? selectedUser.username}</Text>
              <Text style={styles.userDetailEmail}>{selectedUser.email}</Text>
            </View>

            <View style={styles.infoCard}>
              <InfoRow label="ID" value={String(selectedUser.id)} />
              <InfoRow label="Username" value={selectedUser.username} />
              <InfoRow label="Email" value={selectedUser.email} />
              <InfoRow label="Display name" value={selectedUser.displayName ?? "Chưa có"} />
              <InfoRow label="Role" value={selectedUser.role} />
              <InfoRow label="Status" value={getUserStatusLabel(selectedUser.status)} />
              <InfoRow label="Ngày tạo" value={formatDate(selectedUser.createdAt)} />
              <InfoRow label="Avatar" value={selectedUser.avatarUrl ? "Có" : "Không"} />
            </View>

            <View style={styles.userControlCard}>
              <Text style={styles.sectionLabel}>Trạng thái</Text>
              <View style={styles.typeToggleRow}>
                {userStatusOptions.map((status) => (
                  <Pressable
                    key={status}
                    disabled={processingUserId === selectedUser.id}
                    onPress={() => requestUpdateUserStatus(selectedUser, status)}
                    style={[styles.typeToggle, selectedUser.status === status && styles.typeToggleSelected]}
                  >
                    <Text
                      style={[
                        styles.typeToggleText,
                        selectedUser.status === status && styles.typeToggleTextSelected,
                      ]}
                    >
                      {getUserStatusLabel(status)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Vai trò</Text>
              <View style={styles.typeToggleRow}>
                {userRoleOptions.map((role) => (
                  <Pressable
                    key={role}
                    disabled={processingUserId === selectedUser.id}
                    onPress={() => requestUpdateUserRole(selectedUser, role)}
                    style={[styles.typeToggle, selectedUser.role === role && styles.typeToggleSelected]}
                  >
                    <Text
                      style={[styles.typeToggleText, selectedUser.role === role && styles.typeToggleTextSelected]}
                    >
                      {role}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </FocusedScreenTransition>
    );
  }

  if (view === "users") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <SafeAreaView style={styles.screen} edges={["top"]}>
          <View style={styles.header}>
            <Pressable onPress={() => setView("dashboard")} hitSlop={12}>
              <Text style={styles.backText}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Users</Text>
            <Text style={styles.headerCount}>{userTotalCount}</Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadAdminData({ refresh: true })}
                tintColor={theme.primary}
              />
            }
          >
            <View style={styles.userFilterCard}>
              <TextInput
                autoCapitalize="none"
                onChangeText={updateUserSearch}
                placeholder="Tìm username, email, display name"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.formInput}
                value={userSearch}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(["All", ...userRoleOptions] as (AdminUserRole | "All")[]).map((role) => (
                  <FilterChip
                    key={role}
                    label={role === "All" ? "Tất cả role" : role}
                    selected={userRoleFilter === role}
                    onPress={() => updateUserRoleFilter(role)}
                  />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(["All", ...userStatusOptions] as (AdminUserStatus | "All")[]).map((status) => (
                  <FilterChip
                    key={status}
                    label={status === "All" ? "Tất cả trạng thái" : getUserStatusLabel(status)}
                    selected={userStatusFilter === status}
                    onPress={() => updateUserStatusFilter(status)}
                  />
                ))}
              </ScrollView>
            </View>

            {isLoadingUsers ? (
              <View style={styles.loadingCard}>
                <ActivityIndicator color={theme.primary} />
                <Text style={styles.loadingText}>Đang tải user...</Text>
              </View>
            ) : users.length === 0 ? (
              <View style={styles.emptyDocumentCard}>
                <Text style={styles.emptyDocumentTitle}>Không có user</Text>
                <Text style={styles.emptyDocumentText}>Thử đổi từ khóa tìm kiếm hoặc bộ lọc.</Text>
              </View>
            ) : (
            (users ?? []).map((user) => (
              <Pressable key={user.id} style={styles.userRow} onPress={() => openUserDetail(user)}>
                <View style={styles.userMiniAvatar}>
                  <Text style={styles.userMiniAvatarText}>
                    {(user.displayName ?? user.username ?? "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{user.displayName ?? user.username}</Text>
                  <Text style={styles.rowSubtitle}>
                    @{user.username} · {user.email}
                  </Text>
                  <Text style={styles.rowSubtitle}>
                    {getUserStatusLabel(user.status)} · {formatDate(user.createdAt)}
                  </Text>
                </View>
                <View style={[styles.roleBadge, user.role === "Admin" && styles.roleBadgeAdmin]}>
                  <Text style={[styles.roleBadgeText, user.role === "Admin" && styles.roleBadgeTextAdmin]}>
                    {user.role}
                  </Text>
                </View>
              </Pressable>
            ))
            )}

            <View style={styles.paginationRow}>
              <Pressable
                disabled={userPage <= 1 || isRefreshing}
                onPress={() => setUserPage((page) => Math.max(1, page - 1))}
                style={[styles.paginationButton, (userPage <= 1 || isRefreshing) && styles.disabledText]}
              >
                <Text style={styles.paginationButtonText}>Trước</Text>
              </Pressable>
              <Text style={styles.paginationText}>
                Trang {userPage}/{userTotalPages}
              </Text>
              <Pressable
                disabled={userPage >= userTotalPages || isRefreshing}
                onPress={() => setUserPage((page) => Math.min(userTotalPages, page + 1))}
                style={[
                  styles.paginationButton,
                  (userPage >= userTotalPages || isRefreshing) && styles.disabledText,
                ]}
              >
                <Text style={styles.paginationButtonText}>Sau</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </FocusedScreenTransition>
    );
  }

  if (view === "training") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <SafeAreaView style={styles.screen} edges={["top"]}>
          <View style={styles.header}>
            <Pressable onPress={() => setView("dashboard")} hitSlop={12}>
              <Text style={styles.backText}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Train forecast model</Text>
            <Text style={styles.headerCount}>{trainingUserIds.length} đã chọn</Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadAdminData({ refresh: true })}
                tintColor={theme.primary}
              />
            }
          >
            <View style={styles.trainingControls}>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>As of</Text>
                {Platform.OS === "web" ? (
                  <input
                    aria-label="Chọn ngày As of"
                    type="date"
                    value={trainingAsOf}
                    onChange={(event) => setTrainingAsOf(event.currentTarget.value)}
                    style={{
                      backgroundColor: theme.inputBackground,
                      borderColor: theme.border,
                      borderRadius: 8,
                      borderStyle: "solid",
                      borderWidth: 1,
                      boxSizing: "border-box",
                      color: theme.text,
                      fontFamily: "inherit",
                      fontSize: 16,
                      minHeight: 48,
                      padding: "0 14px",
                      width: "100%",
                    }}
                  />
                ) : (
                  <Pressable style={styles.trainingDateButton} onPress={() => setIsTrainingDatePickerVisible(true)}>
                    <Text style={styles.trainingDateText}>{trainingAsOf}</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                autoCapitalize="none"
                onChangeText={updateUserSearch}
                placeholder="Tìm username, email, display name"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.formInput}
                value={userSearch}
              />
              <View style={styles.trainingActions}>
                <View>
                  <Text style={styles.rowSubtitle}>Chọn một hoặc nhiều user để lấy dữ liệu train.</Text>
                  <Text style={styles.rowSubtitle}>ID đã chọn: {trainingUserIds.join(", ") || "chưa có"}</Text>
                </View>
                <Pressable
                  disabled={isTrainingForecast || trainingUserIds.length === 0}
                  onPress={() => void trainSelectedUsers()}
                  style={[styles.fullSaveButton, (isTrainingForecast || trainingUserIds.length === 0) && styles.disabledText]}
                >
                  {isTrainingForecast ? (
                    <ActivityIndicator color={theme.textInverse} />
                  ) : (
                    <Text style={styles.fullSaveButtonText}>Train {trainingUserIds.length} user</Text>
                  )}
                </Pressable>
              </View>
              <View style={styles.trainingFilterActions}>
                <Pressable style={styles.trainingFilterButton} onPress={() => setIsTrainingFilterVisible(true)}>
                  <Text style={styles.trainingFilterButtonText}>Bộ lọc</Text>
                  {(userRoleFilter !== "All" || userStatusFilter !== "All") ? (
                    <Text style={styles.trainingFilterSummary}>
                      {[userRoleFilter !== "All" ? userRoleFilter : null, userStatusFilter !== "All" ? getUserStatusLabel(userStatusFilter) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </Pressable>
              </View>
            </View>

            {trainingResult ? <ForecastTrainingResult result={trainingResult} /> : null}

            {isLoadingUsers ? (
              <View style={styles.loadingCard}>
                <ActivityIndicator color={theme.primary} />
                <Text style={styles.loadingText}>Đang tải user...</Text>
              </View>
            ) : users.length === 0 ? (
              <View style={styles.emptyDocumentCard}>
                <Text style={styles.emptyDocumentTitle}>Không có user</Text>
                <Text style={styles.emptyDocumentText}>Thử đổi từ khóa hoặc bộ lọc.</Text>
              </View>
            ) : (
              users.map((user) => {
                const isSelected = trainingUserIds.includes(user.id);

                return (
                  <Pressable key={user.id} style={styles.trainingUserRow} onPress={() => toggleTrainingUser(user.id)}>
                    <View style={[styles.trainingCheckbox, isSelected && styles.trainingCheckboxSelected]}>
                      {isSelected ? <Text style={styles.trainingCheckboxMark}>✓</Text> : null}
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{user.displayName ?? user.username}</Text>
                      <Text style={styles.rowSubtitle}>@{user.username} · {user.email}</Text>
                    </View>
                    <View style={[styles.roleBadge, user.role === "Admin" && styles.roleBadgeAdmin]}>
                      <Text style={[styles.roleBadgeText, user.role === "Admin" && styles.roleBadgeTextAdmin]}>{user.role}</Text>
                    </View>
                  </Pressable>
                );
              })
            )}

            <View style={styles.paginationRow}>
              <Pressable
                disabled={userPage <= 1 || isRefreshing}
                onPress={() => setUserPage((page) => Math.max(1, page - 1))}
                style={[styles.paginationButton, (userPage <= 1 || isRefreshing) && styles.disabledText]}
              >
                <Text style={styles.paginationButtonText}>Trước</Text>
              </Pressable>
              <Text style={styles.paginationText}>Trang {userPage}/{userTotalPages} · {userTotalCount} user</Text>
              <Pressable
                disabled={userPage >= userTotalPages || isRefreshing}
                onPress={() => setUserPage((page) => Math.min(userTotalPages, page + 1))}
                style={[styles.paginationButton, (userPage >= userTotalPages || isRefreshing) && styles.disabledText]}
              >
                <Text style={styles.paginationButtonText}>Sau</Text>
              </Pressable>
            </View>
          </ScrollView>
          {isTrainingDatePickerVisible && Platform.OS === "android" ? (
            <DateTimePicker
              value={new Date(`${trainingAsOf}T00:00:00`)}
              mode="date"
              display="default"
              onChange={handleTrainingDateChange}
            />
          ) : null}
          <BottomPopup
            animationType="fade"
            transparent
            visible={isTrainingDatePickerVisible && Platform.OS === "ios"}
            onRequestClose={() => setIsTrainingDatePickerVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={styles.modalBackdrop} onPress={() => setIsTrainingDatePickerVisible(false)} />
              <BottomPopupSheet style={styles.categoryFormSheet}>
                <View style={styles.formHeader}>
                  <Pressable onPress={() => setIsTrainingDatePickerVisible(false)} hitSlop={12}>
                    <Text style={styles.formClose}>Hủy</Text>
                  </Pressable>
                  <Text style={styles.formTitle}>Chọn ngày</Text>
                  <Pressable onPress={() => setIsTrainingDatePickerVisible(false)} hitSlop={12}>
                    <Text style={styles.formSave}>Xong</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={new Date(`${trainingAsOf}T00:00:00`)}
                  mode="date"
                  display="spinner"
                  onChange={handleTrainingDateChange}
                />
              </BottomPopupSheet>
            </View>
          </BottomPopup>
          <BottomPopup
            animationType="fade"
            transparent
            visible={isTrainingFilterVisible}
            onRequestClose={() => setIsTrainingFilterVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={styles.modalBackdrop} onPress={() => setIsTrainingFilterVisible(false)} />
              <BottomPopupSheet style={styles.categoryFormSheet}>
                <View style={styles.formHeader}>
                  <Pressable onPress={() => setIsTrainingFilterVisible(false)} hitSlop={12}>
                    <Text style={styles.formClose}>Đóng</Text>
                  </Pressable>
                  <Text style={styles.formTitle}>Bộ lọc user</Text>
                  <Pressable
                    onPress={() => {
                      updateUserRoleFilter("All");
                      updateUserStatusFilter("All");
                    }}
                    hitSlop={12}
                  >
                    <Text style={styles.formSave}>Xóa lọc</Text>
                  </Pressable>
                </View>
                <View style={styles.trainingFilterSection}>
                  <Text style={styles.formLabel}>Vai trò</Text>
                  <View style={styles.trainingFilters}>
                    {(["All", ...userRoleOptions] as (AdminUserRole | "All")[]).map((role) => (
                      <FilterChip
                        key={role}
                        label={role === "All" ? "Tất cả" : role}
                        selected={userRoleFilter === role}
                        onPress={() => updateUserRoleFilter(role)}
                      />
                    ))}
                  </View>
                  <Text style={styles.formLabel}>Trạng thái</Text>
                  <View style={styles.trainingFilters}>
                    {(["All", ...userStatusOptions] as (AdminUserStatus | "All")[]).map((status) => (
                      <FilterChip
                        key={status}
                        label={status === "All" ? "Tất cả" : getUserStatusLabel(status)}
                        selected={userStatusFilter === status}
                        onPress={() => updateUserStatusFilter(status)}
                      />
                    ))}
                  </View>
                </View>
              </BottomPopupSheet>
            </View>
          </BottomPopup>
        </SafeAreaView>
      </FocusedScreenTransition>
    );
  }

  if (view === "categories") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <SafeAreaView style={styles.screen} edges={["top"]}>
          <View style={styles.header}>
            <Pressable onPress={() => setView("dashboard")} hitSlop={12}>
              <Text style={styles.backText}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Category mặc định</Text>
            <Pressable style={styles.addButton} onPress={openAddDefaultCategory}>
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.categoryContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadAdminData({ refresh: true })}
                tintColor={theme.primary}
              />
            }
          >
            {(defaultCategories ?? []).map((category) => (
              <Pressable key={category.id} style={styles.categoryRow} onPress={() => openEditDefaultCategory(category)}>
                <View style={styles.categoryIcon}>
                  <CategoryIconMark icon={category.icon} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{category.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    {getCategoryTypeLabel(category.type)} · {category.icon ?? "no icon"}
                  </Text>
                </View>
                <Pressable
                  style={styles.deleteCategoryButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    requestDeleteDefaultCategory(category);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.deleteCategoryText}>Xóa</Text>
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>

          <CategoryFormModal
            form={categoryForm}
            iconPickerVisible={isCategoryIconPickerVisible}
            isSaving={isSavingCategory}
            onChange={setCategoryForm}
            onClose={closeCategoryForm}
            onCloseIconPicker={() => setIsCategoryIconPickerVisible(false)}
            onOpenIconPicker={() => setIsCategoryIconPickerVisible(true)}
            onSelectIcon={(icon) => {
              setCategoryForm((current) => ({ ...current, icon }));
              setIsCategoryIconPickerVisible(false);
            }}
            onSubmit={saveDefaultCategory}
            theme={theme}
            title={editingCategory ? "Sửa category mặc định" : "Thêm category mặc định"}
            visible={isCategoryFormVisible}
          />
        </SafeAreaView>
      </FocusedScreenTransition>
    );
  }

  if (view === "documents") {
    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-left">
        <SafeAreaView style={styles.screen} edges={["top"]}>
          <View style={styles.header}>
            <Pressable onPress={() => setView("dashboard")} hitSlop={12}>
              <Text style={styles.backText}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Tài liệu RAG</Text>
            <Pressable style={styles.addButton} onPress={openRagUpload}>
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.documentContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadAdminData({ refresh: true })}
                tintColor={theme.primary}
              />
            }
          >
            {ragDocuments.length === 0 ? (
              <View style={styles.emptyDocumentCard}>
                <Text style={styles.emptyDocumentTitle}>Chưa có tài liệu</Text>
                <Text style={styles.emptyDocumentText}>Upload tài liệu đầu tiên để tạo nguồn dữ liệu RAG.</Text>
                <Pressable style={styles.fullSaveButton} onPress={openRagUpload}>
                  <Text style={styles.fullSaveButtonText}>Upload tài liệu</Text>
                </Pressable>
              </View>
            ) : (
              ragDocuments.map((document) => (
                <RagDocumentRow
                  key={document.id}
                  document={document}
                  isProcessing={processingDocumentId === document.id}
                  onDelete={() => requestDeleteRagDocument(document)}
                  onMore={() => setActionMenuRagDocument(document)}
                />
              ))
            )}
          </ScrollView>

          <RagUploadModal
            form={ragUploadForm}
            isUploading={isUploadingRagDocument}
            onChange={setRagUploadForm}
            onClose={() => {
              if (!isUploadingRagDocument) {
                setIsRagUploadVisible(false);
              }
            }}
            onPickFile={pickRagDocumentFile}
            onSubmit={uploadRagDocument}
            theme={theme}
            visible={isRagUploadVisible}
          />
          <RagActionMenuModal
            document={actionMenuRagDocument}
            isProcessing={actionMenuRagDocument ? processingDocumentId === actionMenuRagDocument.id : false}
            onClose={() => setActionMenuRagDocument(null)}
            onDelete={() => {
              if (actionMenuRagDocument) {
                requestDeleteRagDocument(actionMenuRagDocument);
              }
            }}
            onDetail={() => {
              if (actionMenuRagDocument) {
                const document = actionMenuRagDocument;

                setActionMenuRagDocument(null);
                void openRagDocumentDetail(document);
              }
            }}
            onEdit={() => {
              if (actionMenuRagDocument) {
                queueOpenEditRagMetadata(actionMenuRagDocument);
              }
            }}
            onReindex={() => {
              if (actionMenuRagDocument) {
                const document = actionMenuRagDocument;

                setActionMenuRagDocument(null);
                void reindexRagDocument(document);
              }
            }}
          />
          <RagDetailModal
            document={selectedRagDocument}
            isLoading={isLoadingRagDetail}
            isProcessing={selectedRagDocument ? processingDocumentId === selectedRagDocument.id : false}
            onClose={() => {
              setIsRagDetailVisible(false);
              setSelectedRagDocument(null);
            }}
            onDelete={() => {
              if (selectedRagDocument) {
                requestDeleteRagDocument(selectedRagDocument);
              }
            }}
            onEdit={() => {
              if (selectedRagDocument) {
                queueOpenEditRagMetadata(selectedRagDocument, { closeDetail: true });
              }
            }}
            onReindex={() => {
              if (selectedRagDocument) {
                void reindexRagDocument(selectedRagDocument);
              }
            }}
            visible={isRagDetailVisible}
          />
          <RagMetadataModal
            form={ragMetadataForm}
            isSaving={isSavingRagMetadata}
            onChange={setRagMetadataForm}
            onClose={() => {
              if (!isSavingRagMetadata) {
                setIsRagMetadataVisible(false);
                setEditingRagDocument(null);
              }
            }}
            onSubmit={saveRagMetadata}
            theme={theme}
            visible={isRagMetadataVisible}
          />
        </SafeAreaView>
      </FocusedScreenTransition>
    );
  }

  return (
    <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="slide-right">
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadAdminData({ refresh: true })}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.welcomeRow}>
            <View>
              <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
              <Text style={styles.title}>Xin chào, {currentUser?.displayName ?? currentUser?.username}</Text>
            </View>
            <View style={styles.adminActions}>
              <View style={styles.adminAvatar}>
                <Text style={styles.adminAvatarText}>A</Text>
              </View>
              <Pressable
                style={[styles.logoutButton, isLoggingOut && styles.disabledText]}
                onPress={confirmLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator color={theme.textInverse} />
                ) : (
                  <Text style={styles.logoutButtonText}>Đăng xuất</Text>
                )}
              </Pressable>
            </View>
          </View>

          {adminLoadWarnings.length > 0 ? (
            <View style={styles.loadWarningCard}>
              {adminLoadWarnings.map((warning) => (
                <Text key={warning} style={styles.loadWarningText}>{warning}</Text>
              ))}
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={theme.primary} />
              <Text style={styles.loadingText}>Đang tải dữ liệu admin...</Text>
            </View>
          ) : (
            <>
              <View style={styles.tileGrid}>
                <AdminTile
                  color="#58c768"
                  label="User"
                  metric={users.length}
                  note="Quản lý người dùng"
                  onPress={() => setView("users")}
                />
                <AdminTile
                  color="#4a90e2"
                  label="Category"
                  metric={defaultCategories.length}
                  note="Danh mục mặc định"
                  onPress={() => setView("categories")}
                />
                <AdminTile
                  color="#8b5cf6"
                  label="RAG Docs"
                  metric={ragDocuments.length}
                  note="Tài liệu tri thức AI"
                  onPress={() => setView("documents")}
                />
                <AdminTile
                  color="#e58a32"
                  label="Train AI"
                  metric={trainingUserIds.length}
                  note="Chọn user để train forecast"
                  onPress={() => {
                    setIsLoading(true);
                    setUserRoleFilter("User");
                    setUserPage(1);
                    setView("training");
                  }}
                />
              </View>

              <Text style={styles.sectionLabel}>Thống kê hệ thống</Text>
              <View style={styles.statsCard}>
                <StatRow label="Tổng user" value={String(users.length)} />
                <StatRow label="Category mặc định" value={String(defaultCategories.length)} />
                <StatRow label="Tài liệu RAG" value={String(ragDocuments.length)} />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </FocusedScreenTransition>
  );
}

function AdminTile({
  color,
  label,
  metric,
  note,
  onPress,
}: {
  color: string;
  label: string;
  metric: number;
  note: string;
  onPress: () => void;
}) {
  const styles = useAdminStyles();

  return (
    <Pressable style={[styles.tile, { backgroundColor: color }]} onPress={onPress}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileMetric}>{metric}</Text>
      <Text style={styles.tileNote}>{note}</Text>
    </Pressable>
  );
}

function ForecastTrainingResult({ result }: { result: ForecastTrainingResponse }) {
  const styles = useAdminStyles();
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const validationModels = result.evaluation.validation.models;
  const testModels = result.evaluation.test.models;
  const modelNames = [...new Set([...Object.keys(validationModels), ...Object.keys(testModels)])];
  const baselineName = result.evaluation.saveCheck.baseline;
  const baselineValidation = validationModels[baselineName];
  const baselineTest = testModels[baselineName];
  const selectedModelName = Object.entries(validationModels)
    .filter(([name]) => name !== baselineName)
    .sort((left, right) => left[1].sevenDayTotalWAPE - right[1].sevenDayTotalWAPE)[0]?.[0]
    ?? modelNames[0];
  const selectedValidation = selectedModelName ? validationModels[selectedModelName] : undefined;
  const selectedTest = selectedModelName ? testModels[selectedModelName] : undefined;
  const splits = [
    ["Train", result.split.train],
    ["Validation", result.split.validation],
    ["Test", result.split.test],
  ] as const;

  function getWapeImprovement(candidate?: number, baseline?: number) {
    if (candidate === undefined || baseline === undefined || baseline === 0) {
      return "Chưa có số liệu so sánh";
    }

    const percentage = ((baseline - candidate) / baseline) * 100;

    return percentage >= 0
      ? `Giảm ${formatTrainingNumber(percentage)}% so với ${baselineName}`
      : `Cao hơn ${formatTrainingNumber(Math.abs(percentage))}% so với ${baselineName}`;
  }

  return (
    <View style={styles.trainingResultPanel}>
      <View style={styles.trainingResultHeader}>
        <View style={styles.rowCopy}>
          <Text style={styles.trainingResultTitle}>Kết quả train</Text>
          <Text style={styles.rowSubtitle}>{result.modelVersion}</Text>
        </View>
        <View style={[styles.trainingStatusBadge, result.saved ? styles.trainingStatusSaved : styles.trainingStatusNotSaved]}>
          <Text style={[styles.trainingStatusText, !result.saved && styles.trainingStatusTextWarning]}>
            {result.saved ? "Đã lưu model" : "Chưa lưu model"} · {result.status}
          </Text>
        </View>
      </View>

      <View style={styles.trainingExecutiveGrid}>
        <View style={styles.trainingExecutiveCard}>
          <Text style={styles.trainingExecutiveLabel}>WAPE dự báo 7 ngày · Validation</Text>
          <Text style={styles.trainingExecutiveValue}>
            {selectedValidation ? `${formatTrainingNumber(selectedValidation.sevenDayTotalWAPE)}%` : "—"}
          </Text>
          <Text style={styles.trainingResultNote}>{selectedModelName ?? "Chưa có model"} · càng thấp càng tốt</Text>
        </View>
        <View style={styles.trainingExecutiveCard}>
          <Text style={styles.trainingExecutiveLabel}>WAPE dự báo 7 ngày · Test</Text>
          <Text style={styles.trainingExecutiveValue}>
            {selectedTest ? `${formatTrainingNumber(selectedTest.sevenDayTotalWAPE)}%` : "—"}
          </Text>
          <Text style={styles.trainingResultNote}>{getWapeImprovement(selectedTest?.sevenDayTotalWAPE, baselineTest?.sevenDayTotalWAPE)}</Text>
        </View>
        <View style={styles.trainingExecutiveCard}>
          <Text style={styles.trainingExecutiveLabel}>User sử dụng được</Text>
          <Text style={styles.trainingExecutiveValue}>
            {formatTrainingNumber(result.dataset.usableUserCount)} / {formatTrainingNumber(result.dataset.inputUserCount)}
          </Text>
          <Text style={styles.trainingResultNote}>
            {formatTrainingNumber(result.dataset.skippedIncomeWindowCount)} income windows bị bỏ qua
          </Text>
        </View>
      </View>

      <View style={styles.trainingContextCard}>
        <Text style={styles.trainingSplitTitle}>Dữ liệu đến {result.dataset.asOf} · {result.dataset.currency}</Text>
        <Text style={styles.trainingResultNote}>
          Sai số đo tỷ lệ giữa dự báo và thực tế. So sánh model với baseline {baselineName}; test là dữ liệu theo thời gian chưa dùng để chọn model.
        </Text>
        <Text style={styles.trainingLimitationText}>Giới hạn dữ liệu: {result.dataset.limitation}</Text>
      </View>

      <View style={[styles.trainingSaveCheck, result.evaluation.saveCheck.passed ? styles.trainingStatusSaved : styles.trainingStatusNotSaved]}>
        <Text style={[styles.trainingSaveCheckTitle, !result.evaluation.saveCheck.passed && styles.trainingSaveCheckTitleWarning]}>
          {result.evaluation.saveCheck.passed ? "Model vượt điều kiện lưu" : "Model chưa vượt điều kiện lưu"}
        </Text>
        <Text style={styles.trainingResultNote}>
          Đánh giá bằng {result.evaluation.saveCheck.metric} so với baseline {baselineName}.
        </Text>
      </View>

      <Pressable onPress={() => setIsDetailsVisible((visible) => !visible)} style={styles.trainingDetailsToggle}>
        <Text style={styles.trainingDetailsToggleText}>{isDetailsVisible ? "Ẩn chi tiết đánh giá" : "Xem chi tiết đánh giá"}</Text>
        <Text style={styles.trainingDetailsToggleIcon}>{isDetailsVisible ? "−" : "+"}</Text>
      </Pressable>

      {isDetailsVisible ? (
        <View style={styles.trainingDetailsBody}>
          <Text style={styles.sectionLabel}>Dataset</Text>
          <View style={styles.trainingResultGrid}>
            <TrainingResultStat label="User đầu vào" value={formatTrainingNumber(result.dataset.inputUserCount)} />
            <TrainingResultStat label="User sử dụng được" value={formatTrainingNumber(result.dataset.usableUserCount)} />
            <TrainingResultStat label="User bị bỏ qua" value={formatTrainingNumber(result.dataset.skippedUserCount)} />
            <TrainingResultStat label="Income windows bị bỏ qua" value={formatTrainingNumber(result.dataset.skippedIncomeWindowCount)} />
            <TrainingResultStat label="Forecast windows" value={formatTrainingNumber(result.dataset.forecastWindowCount)} />
            <TrainingResultStat label="Tổng rows" value={formatTrainingNumber(result.dataset.rowCount)} />
            <TrainingResultStat label="Stride" value={`${result.dataset.originStrideDays} ngày`} />
            <TrainingResultStat label="Chế độ dữ liệu" value={result.dataset.historicalMode} />
          </View>

          <Text style={styles.sectionLabel}>Chia tập dữ liệu</Text>
          <View style={styles.trainingSplitGrid}>
            {splits.map(([label, split]) => (
              <View key={label} style={styles.trainingSplitCard}>
                <Text style={styles.trainingSplitTitle}>{label}</Text>
                <Text style={styles.trainingSplitValue}>{formatTrainingNumber(split.rowCount)} rows · {split.userCount} users</Text>
                <Text style={styles.trainingResultNote}>{split.firstOrigin} → {split.lastOrigin}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.trainingResultNote}>
            {result.split.method} · purge {result.split.purgeHorizonDays} ngày · bỏ {result.split.discardedRows} rows
          </Text>

          <Text style={styles.sectionLabel}>Chỉ số từng model</Text>
          <Text style={styles.trainingResultNote}>
            Validation: {formatTrainingNumber(result.evaluation.validation.sampleCount)} samples · Test: {formatTrainingNumber(result.evaluation.test.sampleCount)} samples
          </Text>
          {modelNames.map((modelName) => (
            <ForecastModelMetrics
              key={modelName}
              modelName={modelName}
              validation={validationModels[modelName]}
              test={testModels[modelName]}
              currency={result.dataset.currency}
            />
          ))}
          <Text style={styles.trainingResultNote}>Kết quả kiểm tra lưu: {result.evaluation.saveCheck.reason}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TrainingResultStat({ label, value }: { label: string; value: string }) {
  const styles = useAdminStyles();

  return (
    <View style={styles.trainingResultStat}>
      <Text style={styles.trainingResultNote}>{label}</Text>
      <Text style={styles.trainingResultStatValue}>{value}</Text>
    </View>
  );
}

function ForecastModelMetrics({
  modelName,
  validation,
  test,
  currency,
}: {
  modelName: string;
  validation?: ForecastTrainingMetrics;
  test?: ForecastTrainingMetrics;
  currency: string;
}) {
  const styles = useAdminStyles();

  function formatMetrics(label: string, metrics?: ForecastTrainingMetrics) {
    if (!metrics) {
      return `${label}: không có dữ liệu`;
    }

    return `${label} — MAE ${formatTrainingNumber(metrics.dailyMAE, currency)} · RMSE ${formatTrainingNumber(metrics.dailyRMSE, currency)} · WAPE ${formatTrainingNumber(metrics.dailyWAPE)}% · 7 ngày ${formatTrainingNumber(metrics.sevenDayTotalWAPE)}%`;
  }

  return (
    <View style={styles.trainingModelCard}>
      <Text style={styles.trainingModelName}>{modelName}</Text>
      <Text style={styles.trainingMetricText}>{formatMetrics("Validation", validation)}</Text>
      <Text style={styles.trainingMetricText}>{formatMetrics("Test", test)}</Text>
    </View>
  );
}

function RagDocumentRow({
  document,
  isProcessing,
  onDelete,
  onMore,
}: {
  document: RagDocument;
  isProcessing: boolean;
  onDelete: () => void;
  onMore: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAdminStyles();

  return (
    <View style={styles.documentListCard}>
      <View style={styles.documentListMain}>
        <View style={styles.documentTopRow}>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>{document.title}</Text>
            <Text style={styles.rowSubtitle}>
              {document.fileName} · v{document.version} · {document.chunkCount} chunks
            </Text>
          </View>
        </View>

        <Text numberOfLines={2} style={styles.documentDescription}>
          {document.description || "Không có mô tả"}
        </Text>
        <View style={styles.documentMetaRow}>
          <Text style={styles.documentMetaText}>{document.ragCategory ?? "General"}</Text>
          <Text style={styles.documentMetaText}>{document.fileType}</Text>
          <Text style={styles.documentMetaText}>{formatDate(document.updatedAt ?? document.createdAt)}</Text>
        </View>
        {document.errorMessage ? <Text style={styles.documentError}>{document.errorMessage}</Text> : null}
      </View>

      <View style={styles.documentActionRail}>
        <Pressable
          accessibilityLabel="Xóa tài liệu"
          style={[styles.documentIconDeleteButton, isProcessing && styles.disabledText]}
          onPress={onDelete}
          disabled={isProcessing}
        >
          <Trash2 color={theme.dangerText} size={18} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          accessibilityLabel="Mở thêm thao tác tài liệu"
          style={styles.documentIconButton}
          onPress={onMore}
          disabled={isProcessing}
        >
          <MoreVertical color={theme.primary} size={18} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

function RagActionMenuModal({
  document,
  isProcessing,
  onClose,
  onDelete,
  onDetail,
  onEdit,
  onReindex,
}: {
  document: RagDocument | null;
  isProcessing: boolean;
  onClose: () => void;
  onDelete: () => void;
  onDetail: () => void;
  onEdit: () => void;
  onReindex: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAdminStyles();
  const statusLabel = document ? getRagDocumentStatusLabel(document) : "";
  const canReindex = statusLabel.toLowerCase() !== "draft";

  return (
    <BottomPopup animationType="fade" transparent visible={Boolean(document)} onRequestClose={onClose}>
      <View style={styles.actionMenuOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <BottomPopupSheet style={styles.actionMenuSheet}>
          <Text numberOfLines={1} style={styles.actionMenuTitle}>
            {document?.title ?? "Tài liệu RAG"}
          </Text>
          <ActionMenuItem
            icon={<Eye color={theme.primary} size={18} strokeWidth={2.4} />}
            label="Xem chi tiết"
            onPress={onDetail}
          />
          <ActionMenuItem
            disabled={!canReindex || isProcessing}
            icon={
              isProcessing ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <RotateCw color={theme.primary} size={18} strokeWidth={2.4} />
              )
            }
            label="Reindex"
            onPress={onReindex}
          />
          <ActionMenuItem
            disabled={isProcessing}
            icon={<Pencil color={theme.primary} size={18} strokeWidth={2.4} />}
            label="Sửa metadata"
            onPress={onEdit}
          />
          <ActionMenuItem
            danger
            disabled={isProcessing}
            icon={<Trash2 color={theme.dangerText} size={18} strokeWidth={2.4} />}
            label="Xóa"
            onPress={onDelete}
          />
        </BottomPopupSheet>
      </View>
    </BottomPopup>
  );
}

function ActionMenuItem({
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  const styles = useAdminStyles();

  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionMenuItem, disabled && styles.disabledText]}
    >
      <View style={styles.actionMenuIcon}>{icon}</View>
      <Text style={[styles.actionMenuLabel, danger && styles.actionMenuDangerLabel]}>{label}</Text>
    </Pressable>
  );
}

function RagDetailModal({
  document,
  isLoading,
  isProcessing,
  onClose,
  onDelete,
  onEdit,
  onReindex,
  visible,
}: {
  document: RagDocument | null;
  isLoading: boolean;
  isProcessing: boolean;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onReindex: () => void;
  visible: boolean;
}) {
  const styles = useAdminStyles();
  const statusLabel = document ? getRagDocumentStatusLabel(document) : "";
  const canReindex = statusLabel.toLowerCase() !== "draft";

  return (
    <BottomPopup animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <BottomPopupSheet style={styles.categoryFormSheet}>
          <View style={styles.formHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.formClose}>Đóng</Text>
            </Pressable>
            <Text style={styles.formTitle}>Chi tiết RAG</Text>
            <View style={styles.headerSpacer} />
          </View>

          {isLoading && !document ? (
            <View style={styles.detailLoadingState}>
              <ActivityIndicator />
            </View>
          ) : document ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <View style={styles.documentCard}>
                <View style={styles.documentTopRow}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{document.title}</Text>
                    <Text style={styles.rowSubtitle}>{document.fileName}</Text>
                  </View>
                  <View style={styles.documentStatusBadge}>
                    <Text style={styles.documentStatusText}>{statusLabel}</Text>
                  </View>
                </View>
                <Text style={styles.documentDescription}>{document.description || "Không có mô tả"}</Text>
                {document.errorMessage ? <Text style={styles.documentError}>{document.errorMessage}</Text> : null}
              </View>

              <View style={styles.infoCard}>
                <InfoRow label="ID" value={String(document.id)} />
                <InfoRow label="S3 Key" value={document.s3Key} />
                <InfoRow label="File type" value={document.fileType} />
                <InfoRow label="RAG category" value={document.ragCategory ?? "General"} />
                <InfoRow label="Version" value={String(document.version)} />
                <InfoRow label="Chunk count" value={String(document.chunkCount)} />
                <InfoRow label="Created by" value={String(document.createdBy)} />
                <InfoRow label="Ngày tạo" value={formatDate(document.createdAt)} />
                <InfoRow label="Cập nhật" value={formatDate(document.updatedAt)} />
              </View>

              <View style={styles.documentActions}>
                <Pressable
                  style={[styles.documentActionButton, (!canReindex || isProcessing) && styles.disabledText]}
                  onPress={onReindex}
                  disabled={!canReindex || isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text style={styles.documentActionText}>Reindex</Text>
                  )}
                </Pressable>
                <Pressable style={styles.documentActionButton} onPress={onEdit} disabled={isProcessing}>
                  <Text style={styles.documentActionText}>Sửa metadata</Text>
                </Pressable>
                <Pressable style={styles.documentDeleteButton} onPress={onDelete} disabled={isProcessing}>
                  <Text style={styles.documentDeleteText}>Xóa</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : null}
        </BottomPopupSheet>
      </View>
    </BottomPopup>
  );
}

function RagUploadModal({
  form,
  isUploading,
  onChange,
  onClose,
  onPickFile,
  onSubmit,
  theme,
  visible,
}: {
  form: RagUploadFormState;
  isUploading: boolean;
  onChange: (form: RagUploadFormState) => void;
  onClose: () => void;
  onPickFile: () => void;
  onSubmit: () => void;
  theme: AppTheme;
  visible: boolean;
}) {
  const styles = useAdminStyles();

  return (
    <BottomPopup animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <BottomPopupSheet style={styles.categoryFormSheet}>
          <View style={styles.formHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.formClose}>Hủy</Text>
            </Pressable>
            <Text style={styles.formTitle}>Upload tài liệu RAG</Text>
            <Pressable onPress={onSubmit} disabled={isUploading} hitSlop={10}>
              <Text style={[styles.formSave, isUploading && styles.disabledText]}>Lưu</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formBody}>
            <Pressable style={styles.filePickerButton} onPress={onPickFile} disabled={isUploading}>
              <Text style={styles.filePickerTitle}>{form.asset ? form.asset.name : "Chọn file tài liệu"}</Text>
              <Text style={styles.filePickerSubtitle}>
                {form.asset ? `${formatFileSize(form.asset.size)} · ${form.fileType}` : ".txt, .docs, .md hoặc .pdf"}
              </Text>
            </Pressable>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Tiêu đề</Text>
              <TextInput
                editable={!isUploading}
                onChangeText={(title) => onChange({ ...form, title })}
                placeholder="Tiết kiệm và lãi suất"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.formInput}
                value={form.title}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Mô tả</Text>
              <TextInput
                editable={!isUploading}
                multiline
                onChangeText={(description) => onChange({ ...form, description })}
                placeholder="File tài liệu kiến thức tài chính"
                placeholderTextColor={theme.inputPlaceholder}
                style={[styles.formInput, styles.multilineInput]}
                value={form.description}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>RAG category</Text>
              <TextInput
                autoCapitalize="none"
                editable={!isUploading}
                onChangeText={(ragCategory) => onChange({ ...form, ragCategory })}
                placeholder="General"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.formInput}
                value={form.ragCategory}
              />
            </View>

            <Pressable
              style={[styles.fullSaveButton, isUploading && styles.disabledText]}
              onPress={onSubmit}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color={theme.textInverse} />
              ) : (
                <Text style={styles.fullSaveButtonText}>Upload và index</Text>
              )}
            </Pressable>
          </ScrollView>
        </BottomPopupSheet>
      </KeyboardAvoidingView>
    </BottomPopup>
  );
}

function RagMetadataModal({
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  theme,
  visible,
}: {
  form: RagMetadataFormState;
  isSaving: boolean;
  onChange: (form: RagMetadataFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  theme: AppTheme;
  visible: boolean;
}) {
  const styles = useAdminStyles();

  return (
    <BottomPopup animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <BottomPopupSheet style={styles.categoryFormSheet}>
          <View style={styles.formHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.formClose}>Hủy</Text>
            </Pressable>
            <Text style={styles.formTitle}>Sửa metadata</Text>
            <Pressable onPress={onSubmit} disabled={isSaving} hitSlop={10}>
              <Text style={[styles.formSave, isSaving && styles.disabledText]}>Lưu</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} keyboardShouldPersistTaps="handled">
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Tiêu đề</Text>
              <TextInput
                editable={!isSaving}
                onChangeText={(title) => onChange({ ...form, title })}
                placeholder="Tiêu đề tài liệu"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.formInput}
                value={form.title}
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Mô tả</Text>
              <TextInput
                editable={!isSaving}
                multiline
                onChangeText={(description) => onChange({ ...form, description })}
                placeholder="Mô tả tài liệu"
                placeholderTextColor={theme.inputPlaceholder}
                style={[styles.formInput, styles.multilineInput]}
                value={form.description}
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>RAG category</Text>
              <TextInput
                autoCapitalize="none"
                editable={!isSaving}
                onChangeText={(ragCategory) => onChange({ ...form, ragCategory })}
                placeholder="General"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.formInput}
                value={form.ragCategory}
              />
            </View>
            <Pressable style={[styles.fullSaveButton, isSaving && styles.disabledText]} onPress={onSubmit}>
              {isSaving ? (
                <ActivityIndicator color={theme.textInverse} />
              ) : (
                <Text style={styles.fullSaveButtonText}>Lưu metadata</Text>
              )}
            </Pressable>
          </ScrollView>
        </BottomPopupSheet>
      </KeyboardAvoidingView>
    </BottomPopup>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  const styles = useAdminStyles();

  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useAdminStyles();

  return (
    <Pressable style={[styles.filterChip, selected && styles.filterChipSelected]} onPress={onPress}>
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useAdminStyles();

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function CategoryIconMark({ icon }: { icon: string | null | undefined }) {
  const theme = useAppTheme();
  const styles = useAdminStyles();
  const iconOption = getCategoryIconOption(icon);

  if (iconOption) {
    const Icon = iconOption.Icon;

    return <Icon color={theme.primary} size={18} strokeWidth={2.4} />;
  }

  return <Text style={styles.categoryIconText}>{icon?.charAt(0).toUpperCase() ?? "C"}</Text>;
}

function CategoryIconPickerContent({
  onSelect,
  selectedIcon,
}: {
  onSelect: (icon: string) => void;
  selectedIcon: string;
}) {
  const theme = useAppTheme();
  const styles = useAdminStyles();

  return (
    <ScrollView contentContainerStyle={styles.iconPickerContent}>
      <Pressable
        style={[styles.iconPickerOption, !selectedIcon && styles.iconPickerOptionSelected]}
        onPress={() => onSelect("")}
      >
        <View style={styles.iconPickerBubble}>
          <Text style={styles.iconSelectPreviewText}>C</Text>
        </View>
        <Text style={styles.iconPickerLabel}>Mặc định</Text>
      </Pressable>

      {categoryIconOptions.map((option) => {
        const Icon = option.Icon;
        const isSelected = selectedIcon === option.key;

        return (
          <Pressable
            key={option.key}
            style={[styles.iconPickerOption, isSelected && styles.iconPickerOptionSelected]}
            onPress={() => onSelect(option.key)}
          >
            <View style={styles.iconPickerBubble}>
              <Icon color={theme.primary} size={20} strokeWidth={2.4} />
            </View>
            <Text numberOfLines={1} style={styles.iconPickerLabel}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CategoryFormModal({
  form,
  iconPickerVisible,
  isSaving,
  onChange,
  onClose,
  onCloseIconPicker,
  onOpenIconPicker,
  onSelectIcon,
  onSubmit,
  theme,
  title,
  visible,
}: {
  form: CategoryFormState;
  iconPickerVisible: boolean;
  isSaving: boolean;
  onChange: (form: CategoryFormState) => void;
  onClose: () => void;
  onCloseIconPicker: () => void;
  onOpenIconPicker: () => void;
  onSelectIcon: (icon: string) => void;
  onSubmit: () => void;
  theme: AppTheme;
  title: string;
  visible: boolean;
}) {
  const styles = useAdminStyles();
  const selectedIconOption = getCategoryIconOption(form.icon);

  return (
    <BottomPopup
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={iconPickerVisible ? onCloseIconPicker : onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={iconPickerVisible ? onCloseIconPicker : onClose} />
        <BottomPopupSheet style={styles.categoryFormSheet}>
          <View style={styles.formHeader}>
            <Pressable onPress={iconPickerVisible ? onCloseIconPicker : onClose} hitSlop={10}>
              <Text style={styles.formClose}>{iconPickerVisible ? "‹ Form" : "Hủy"}</Text>
            </Pressable>
            <Text style={styles.formTitle}>{iconPickerVisible ? "Chọn icon" : title}</Text>
            {iconPickerVisible ? (
              <View style={styles.headerSpacer} />
            ) : (
              <Pressable onPress={onSubmit} disabled={isSaving} hitSlop={10}>
                <Text style={[styles.formSave, isSaving && styles.disabledText]}>Lưu</Text>
              </Pressable>
            )}
          </View>

          {iconPickerVisible ? (
            <CategoryIconPickerContent onSelect={onSelectIcon} selectedIcon={form.icon} />
          ) : (
          <View style={styles.formBody}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Tên category</Text>
              <TextInput
                editable={!isSaving}
                onChangeText={(name) => onChange({ ...form, name })}
                placeholder="Ăn uống"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.formInput}
                value={form.name}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Loại</Text>
              <View style={styles.typeToggleRow}>
                {(["Expense", "Income"] as CategoryType[]).map((type) => {
                  const isSelected = form.type === type;

                  return (
                    <Pressable
                      key={type}
                      style={[styles.typeToggle, isSelected && styles.typeToggleSelected]}
                      onPress={() => onChange({ ...form, type })}
                      disabled={isSaving}
                    >
                      <Text style={[styles.typeToggleText, isSelected && styles.typeToggleTextSelected]}>
                        {getCategoryTypeLabel(type)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Icon</Text>
              <Pressable
                disabled={isSaving}
                onPress={onOpenIconPicker}
                style={[styles.iconSelectButton, isSaving && styles.disabledText]}
              >
                <View style={styles.iconSelectPreview}>
                  {selectedIconOption ? (
                    <selectedIconOption.Icon color={theme.primary} size={18} strokeWidth={2.4} />
                  ) : (
                    <Text style={styles.iconSelectPreviewText}>C</Text>
                  )}
                </View>
                <View style={styles.iconSelectCopy}>
                  <Text style={styles.iconSelectTitle}>{selectedIconOption?.label ?? "Mặc định"}</Text>
                  <Text style={styles.iconSelectSubtitle}>
                    {selectedIconOption ? selectedIconOption.key : "Dùng icon mặc định"}
                  </Text>
                </View>
                <Text style={styles.iconSelectChevron}>›</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.fullSaveButton, isSaving && styles.disabledText]}
              onPress={onSubmit}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={theme.textInverse} />
              ) : (
                <Text style={styles.fullSaveButtonText}>Lưu category</Text>
              )}
            </Pressable>
          </View>
          )}
        </BottomPopupSheet>
      </KeyboardAvoidingView>
    </BottomPopup>
  );
}

function createStyles(theme: AppTheme, isDesktop: boolean) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.screen, flex: 1 },
    content: { alignSelf: "center", width: "100%", maxWidth: isDesktop ? 1320 : undefined, padding: isDesktop ? 32 : 18, paddingBottom: isDesktop ? 48 : 96 },
    welcomeRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
      marginTop: 8,
    },
    eyebrow: { color: theme.textMuted, fontSize: 11, fontWeight: "900" },
    title: { color: theme.text, fontSize: isDesktop ? 32 : 24, fontWeight: "900", marginTop: 4, maxWidth: isDesktop ? 680 : 260 },
    adminAvatar: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    adminAvatarText: { color: theme.text, fontSize: 20, fontWeight: "900" },
    adminActions: { alignItems: "flex-end", gap: 8 },
    logoutButton: {
      alignItems: "center",
      backgroundColor: theme.danger,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 34,
      minWidth: 92,
      paddingHorizontal: 12,
    },
    logoutButtonText: { color: theme.textInverse, fontSize: 13, fontWeight: "900" },
    tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    tile: {
      borderRadius: 8,
      flexBasis: isDesktop ? "22%" : "30%",
      flexGrow: 1,
      minHeight: isDesktop ? 164 : 128,
      minWidth: isDesktop ? 220 : 120,
      padding: isDesktop ? 22 : 14,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 12,
    },
    tileLabel: { color: theme.textInverse, fontSize: 14, fontWeight: "900" },
    tileMetric: { color: theme.textInverse, fontSize: isDesktop ? 42 : 34, fontWeight: "900", marginTop: isDesktop ? 32 : 20 },
    tileNote: { color: theme.textInverse, fontSize: 11, fontWeight: "700", opacity: 0.88 },
    sectionLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "900", marginBottom: 10, marginTop: 22 },
    statsCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      overflow: "hidden",
    },
    loadWarningCard: {
      backgroundColor: theme.warningBackground,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 6,
      marginBottom: 18,
      padding: 14,
    },
    loadWarningText: { color: theme.dangerText, fontSize: 13, fontWeight: "700", lineHeight: 19 },
    statRow: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 58,
      paddingHorizontal: 16,
    },
    statLabel: { color: theme.textMuted, fontSize: 14, fontWeight: "800" },
    statValue: { color: theme.text, fontSize: 18, fontWeight: "900" },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      alignSelf: "center",
      width: "100%",
      maxWidth: isDesktop ? 1320 : undefined,
      paddingBottom: 14,
      paddingHorizontal: isDesktop ? 32 : 18,
      paddingTop: isDesktop ? 28 : 12,
    },
    backText: { color: theme.primary, fontSize: 17, fontWeight: "800" },
    headerTitle: { color: theme.text, fontSize: 20, fontWeight: "900" },
    headerSpacer: { width: 74 },
    headerCount: { color: theme.textMuted, fontSize: 14, fontWeight: "900", minWidth: 74, textAlign: "right" },
    listContent: { alignSelf: "center", width: "100%", maxWidth: isDesktop ? 1320 : undefined, gap: isDesktop ? 12 : 10, padding: isDesktop ? 32 : 18, paddingBottom: isDesktop ? 48 : 96 },
    userFilterCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 12,
    },
    trainingControls: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 14,
      padding: 16,
    },
    trainingActions: { alignItems: "flex-start", gap: 10 },
    trainingFilters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    trainingFilterActions: { alignItems: "flex-start" },
    trainingFilterButton: {
      alignItems: "center",
      backgroundColor: theme.cardAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      minHeight: 42,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    trainingFilterButtonText: { color: theme.text, fontSize: 14, fontWeight: "800" },
    trainingFilterSummary: { color: theme.textMuted, fontSize: 13, fontWeight: "700" },
    trainingFilterSection: { gap: 12, padding: 18 },
    trainingDateButton: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 14,
    },
    trainingDateText: { color: theme.text, fontSize: 16 },
    trainingUserRow: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 72,
      padding: 14,
    },
    trainingCheckbox: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 5,
      borderWidth: 1,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    trainingCheckboxSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    trainingCheckboxMark: { color: theme.textInverse, fontSize: 15, fontWeight: "900" },
    trainingResultPanel: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      gap: 10,
      padding: isDesktop ? 22 : 16,
    },
    trainingResultHeader: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
    trainingResultTitle: { color: theme.text, fontSize: 20, fontWeight: "900" },
    trainingStatusBadge: { alignSelf: "flex-start", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
    trainingStatusSaved: { backgroundColor: theme.goodBackground },
    trainingStatusNotSaved: { backgroundColor: theme.warningBackground },
    trainingStatusText: { color: theme.goodText, fontSize: 12, fontWeight: "900" },
    trainingStatusTextWarning: { color: theme.warning, fontSize: 12, fontWeight: "900" },
    trainingExecutiveGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    trainingExecutiveCard: {
      backgroundColor: theme.cardAlt,
      borderRadius: 9,
      flexBasis: isDesktop ? "30%" : "100%",
      flexGrow: 1,
      gap: 6,
      minWidth: 180,
      padding: 14,
    },
    trainingExecutiveLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "800" },
    trainingExecutiveValue: { color: theme.text, fontSize: 25, fontWeight: "900" },
    trainingContextCard: { backgroundColor: theme.cardAlt, borderRadius: 8, gap: 6, padding: 13 },
    trainingLimitationText: { color: theme.warning, fontSize: 12, fontWeight: "700", lineHeight: 18 },
    trainingDetailsToggle: {
      alignItems: "center",
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 44,
      paddingHorizontal: 12,
    },
    trainingDetailsToggleText: { color: theme.primary, fontSize: 13, fontWeight: "900" },
    trainingDetailsToggleIcon: { color: theme.primary, fontSize: 22, fontWeight: "800" },
    trainingDetailsBody: { gap: 8 },
    trainingResultGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    trainingResultStat: {
      backgroundColor: theme.cardAlt,
      borderRadius: 8,
      flexBasis: isDesktop ? "22%" : "46%",
      flexGrow: 1,
      gap: 4,
      minWidth: 125,
      padding: 11,
    },
    trainingResultStatValue: { color: theme.text, fontSize: 15, fontWeight: "900" },
    trainingResultNote: { color: theme.textMuted, fontSize: 12, fontWeight: "700", lineHeight: 18 },
    trainingSplitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    trainingSplitCard: {
      backgroundColor: theme.cardAlt,
      borderRadius: 8,
      flexBasis: isDesktop ? "30%" : "100%",
      flexGrow: 1,
      gap: 5,
      minWidth: 180,
      padding: 12,
    },
    trainingSplitTitle: { color: theme.text, fontSize: 14, fontWeight: "900" },
    trainingSplitValue: { color: theme.text, fontSize: 13, fontWeight: "800" },
    trainingModelCard: { backgroundColor: theme.cardAlt, borderRadius: 8, gap: 7, padding: 12 },
    trainingModelName: { color: theme.text, fontSize: 14, fontWeight: "900" },
    trainingMetricText: { color: theme.textMuted, fontSize: 12, fontWeight: "700", lineHeight: 19 },
    trainingSaveCheck: { borderRadius: 8, gap: 5, padding: 12 },
    trainingSaveCheckTitle: { color: theme.goodText, fontSize: 14, fontWeight: "900" },
    trainingSaveCheckTitleWarning: { color: theme.warning, fontSize: 14, fontWeight: "900" },
    filterRow: { gap: 8 },
    filterChip: {
      backgroundColor: theme.cardAlt,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    filterChipText: { color: theme.textMuted, fontSize: 12, fontWeight: "900" },
    filterChipTextSelected: { color: theme.textInverse },
    userRow: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      minHeight: 76,
      padding: 12,
    },
    userMiniAvatar: {
      alignItems: "center",
      backgroundColor: theme.avatar,
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      marginRight: 12,
      width: 44,
    },
    userMiniAvatarText: { color: theme.textInverse, fontSize: 18, fontWeight: "900" },
    rowCopy: { flex: 1 },
    rowTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
    rowSubtitle: { color: theme.textMuted, fontSize: 13, fontWeight: "700", marginTop: 3 },
    roleBadge: {
      backgroundColor: theme.cardAlt,
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    roleBadgeAdmin: { backgroundColor: theme.primaryPressed },
    roleBadgeText: { color: theme.textMuted, fontSize: 11, fontWeight: "900" },
    roleBadgeTextAdmin: { color: theme.primary },
    categoryContent: { alignSelf: "center", width: "100%", maxWidth: isDesktop ? 1320 : undefined, gap: 10, padding: isDesktop ? 32 : 18, paddingBottom: isDesktop ? 48 : 96 },
    documentContent: { alignSelf: "center", width: "100%", maxWidth: isDesktop ? 1320 : undefined, gap: 10, padding: isDesktop ? 32 : 18, paddingBottom: isDesktop ? 48 : 96 },
    categoryRow: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      minHeight: 72,
      padding: 12,
    },
    categoryIcon: {
      alignItems: "center",
      backgroundColor: theme.primaryPressed,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      marginRight: 12,
      width: 40,
    },
    categoryIconText: { color: theme.primary, fontSize: 16, fontWeight: "900" },
    defaultTag: { color: theme.primary, fontSize: 12, fontWeight: "900" },
    deleteCategoryButton: {
      backgroundColor: theme.warningBackground,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    deleteCategoryText: { color: theme.dangerText, fontSize: 12, fontWeight: "900" },
    documentCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 14,
    },
    documentListCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 14,
    },
    documentListMain: { flex: 1, gap: 10, minWidth: 0 },
    documentTopRow: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
    documentDescription: { color: theme.textMuted, fontSize: 13, fontWeight: "700", lineHeight: 19 },
    documentMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    documentMetaText: {
      backgroundColor: theme.cardAlt,
      borderRadius: 8,
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "900",
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    documentError: { color: theme.dangerText, fontSize: 12, fontWeight: "800", lineHeight: 18 },
    documentStatusBadge: {
      backgroundColor: theme.cardAlt,
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    documentStatusGood: { backgroundColor: theme.goodBackground },
    documentStatusDanger: { backgroundColor: `${theme.danger}22` },
    documentStatusWarning: { backgroundColor: theme.warningBackground },
    documentStatusText: { color: theme.text, fontSize: 11, fontWeight: "900" },
    documentActionRail: { alignItems: "center", gap: 8 },
    documentIconButton: {
      alignItems: "center",
      backgroundColor: theme.primaryPressed,
      borderRadius: 8,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    documentIconDeleteButton: {
      alignItems: "center",
      backgroundColor: theme.warningBackground,
      borderRadius: 8,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    actionMenuOverlay: { flex: 1, justifyContent: "flex-end" },
    actionMenuSheet: {
      backgroundColor: theme.sheet,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      gap: 4,
      padding: 16,
      paddingBottom: 26,
    },
    actionMenuTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "900",
      marginBottom: 8,
    },
    actionMenuItem: {
      alignItems: "center",
      borderRadius: 8,
      flexDirection: "row",
      gap: 12,
      minHeight: 48,
      paddingHorizontal: 10,
    },
    actionMenuIcon: {
      alignItems: "center",
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    actionMenuLabel: { color: theme.text, fontSize: 15, fontWeight: "800" },
    actionMenuDangerLabel: { color: theme.dangerText },
    documentActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    documentActionButton: {
      backgroundColor: theme.primaryPressed,
      borderRadius: 8,
      minHeight: 34,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    documentActionText: { color: theme.primary, fontSize: 12, fontWeight: "900" },
    documentDeleteButton: {
      backgroundColor: theme.warningBackground,
      borderRadius: 8,
      minHeight: 34,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    documentDeleteText: { color: theme.dangerText, fontSize: 12, fontWeight: "900" },
    emptyDocumentCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      padding: 20,
    },
    emptyDocumentTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
    emptyDocumentText: { color: theme.textMuted, fontSize: 13, fontWeight: "700", lineHeight: 20 },
    addButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    addButtonText: { color: theme.textInverse, fontSize: 24, fontWeight: "800", lineHeight: 27 },
    detailContent: { gap: 14, padding: 18, paddingBottom: 96 },
    detailLoadingState: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 180,
      padding: 24,
    },
    userDetailCard: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      padding: 22,
    },
    userAvatar: {
      alignItems: "center",
      backgroundColor: theme.avatar,
      borderRadius: 35,
      height: 70,
      justifyContent: "center",
      marginBottom: 12,
      width: 70,
    },
    userAvatarText: { color: theme.textInverse, fontSize: 30, fontWeight: "900" },
    userDetailName: { color: theme.text, fontSize: 21, fontWeight: "900" },
    userDetailEmail: { color: theme.textMuted, fontSize: 14, fontWeight: "700", marginTop: 5 },
    infoCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      overflow: "hidden",
    },
    userControlCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      padding: 16,
    },
    infoRow: {
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 4,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    infoLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "900" },
    infoValue: { color: theme.text, fontSize: 15, fontWeight: "800" },
    modalOverlay: { flex: 1, justifyContent: "flex-end" },
    modalBackdrop: {
      backgroundColor: theme.overlay,
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    categoryFormSheet: {
      backgroundColor: theme.sheet,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      paddingBottom: 24,
    },
    formHeader: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 60,
      paddingHorizontal: 18,
    },
    formClose: { color: theme.textMuted, fontSize: 15, fontWeight: "900" },
    formTitle: { color: theme.text, fontSize: 17, fontWeight: "900" },
    formSave: { color: theme.primary, fontSize: 15, fontWeight: "900" },
    disabledText: { opacity: 0.55 },
    paginationRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 6,
    },
    paginationButton: {
      backgroundColor: theme.primaryPressed,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    paginationButtonText: { color: theme.primary, fontSize: 13, fontWeight: "900" },
    paginationText: { color: theme.textMuted, fontSize: 13, fontWeight: "900" },
    formBody: { gap: 16, padding: 18 },
    formField: { gap: 8 },
    formLabel: { color: theme.text, fontSize: 13, fontWeight: "900" },
    formInput: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      fontSize: 16,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    iconSelectButton: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 58,
      paddingHorizontal: 12,
    },
    iconSelectPreview: {
      alignItems: "center",
      backgroundColor: theme.primaryPressed,
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    iconSelectPreviewText: { color: theme.primary, fontSize: 15, fontWeight: "900" },
    iconSelectCopy: { flex: 1 },
    iconSelectTitle: { color: theme.text, fontSize: 14, fontWeight: "900" },
    iconSelectSubtitle: { color: theme.textMuted, fontSize: 11, fontWeight: "700", marginTop: 3 },
    iconSelectChevron: { color: theme.textMuted, fontSize: 24, fontWeight: "800" },
    iconPickerContent: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      padding: 18,
      paddingBottom: 26,
    },
    iconPickerOption: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 7,
      minHeight: 86,
      padding: 10,
      width: "30%",
    },
    iconPickerOptionSelected: { backgroundColor: theme.primaryPressed, borderColor: theme.primary },
    iconPickerBubble: {
      alignItems: "center",
      backgroundColor: theme.primaryPressed,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    iconPickerLabel: { color: theme.text, fontSize: 11, fontWeight: "800", textAlign: "center" },
    multilineInput: { minHeight: 92, textAlignVertical: "top" },
    filePickerButton: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderStyle: "dashed",
      borderWidth: 1,
      gap: 4,
      padding: 16,
    },
    filePickerTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
    filePickerSubtitle: { color: theme.textMuted, fontSize: 12, fontWeight: "700" },
    typeToggleRow: { flexDirection: "row", gap: 10 },
    typeToggle: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      minHeight: 46,
      justifyContent: "center",
    },
    typeToggleSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    typeToggleText: { color: theme.text, fontSize: 14, fontWeight: "900" },
    typeToggleTextSelected: { color: theme.textInverse },
    fullSaveButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 50,
    },
    fullSaveButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: "900" },
    loadingCard: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 26,
    },
    loadingText: { color: theme.textMuted, fontSize: 14, fontWeight: "700" },
    deniedCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      margin: 18,
      padding: 20,
    },
    deniedTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
    deniedText: { color: theme.textMuted, fontSize: 14, fontWeight: "700", lineHeight: 21, marginTop: 8 },
  });
}
