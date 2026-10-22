import { BottomPopup, BottomPopupSheet } from "@/components/bottom-popup";
import * as DocumentPicker from "expo-document-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ArrowUpRight,
  BookOpen,
  FolderOpen,
  SlidersHorizontal,
  Users,
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
import { type ComponentType, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  adminApi,
  type AdminUser,
  type AdminUserRole,
  type AdminUserStatus,
} from "@/api/adminApi";
import { authApi } from "@/api/authApi";
import { type Category, type CategoryType } from "@/api/categoriesApi";
import { RAG_DOCUMENT_UPLOAD_CONTENT_TYPE, ragDocumentsApi, type RagDocument } from "@/api/ragDocumentsApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { adminStyleSheet, useAdminFonts, useAdminTheme, type AdminTheme } from "@/components/admin/admin-design";
import { AdminShell, type AdminView } from "@/components/admin/admin-shell";
import { ForecastTrainingWorkspace } from "@/components/admin/forecast-training-workspace";
import { ForecastTrainingResult } from "@/components/admin/forecast-training-result";
import { SystemMonitoringWorkspace } from "@/components/admin/system-monitoring-workspace";
import { getAuthRefreshToken, getAuthUser } from "@/stores/authSession";
import { clearAuthSession } from "@/stores/persistedAuthSession";
import { isAdminUser } from "@/utils/authRole";

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
  const theme = useAdminTheme();
  const { width } = useWindowDimensions();

  return createStyles(theme, width >= 1100);
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
  const theme = useAdminTheme();
  const styles = useAdminStyles();
  const [fontsLoaded, fontError] = useAdminFonts();
  const currentUser = getAuthUser();
  const { view: routeView } = useLocalSearchParams<{ view?: string }>();
  const view: AdminView = routeView === "users" || routeView === "categories" || routeView === "documents" || routeView === "training" || routeView === "monitoring" ? routeView : "dashboard";
  const [hasOpenedTraining, setHasOpenedTraining] = useState(view === "training");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ragDocuments, setRagDocuments] = useState<RagDocument[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<AdminUserRole | "All">("All");
  const [userStatusFilter, setUserStatusFilter] = useState<AdminUserStatus | "All">("All");
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
  const hasRequestedAdminDataRef = useRef(false);
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
          silent: hasRequestedAdminDataRef.current,
        });
        hasRequestedAdminDataRef.current = true;
      }
    }, [currentUser, loadAdminData]),
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

  function navigateAdmin(nextView: AdminView) {
    setSelectedUser(null);
    if (nextView === "training") setHasOpenedTraining(true);
    if (nextView !== view) {
      setUserSearch("");
      setUserRoleFilter("All");
      setUserStatusFilter("All");
      setUserPage(1);
    }
    router.setParams({ view: nextView });
  }

  if (!fontsLoaded && !fontError) {
    return <View style={[styles.screen, styles.detailLoadingState]}><ActivityIndicator color={theme.primary} /></View>;
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

  function renderContent() {
    if (view === "monitoring") return <SystemMonitoringWorkspace />;
    if (selectedUser) {
      return (
        <FocusedScreenTransition style={styles.screen} triggerKey="admin-user-detail" variant="fade">
          <View style={styles.screen}>
            <View style={styles.header}>
              <Pressable onPress={() => setSelectedUser(null)} hitSlop={12}>
                <Text style={styles.backText}>‹ Danh sách</Text>
              </Pressable>
              <Text style={styles.headerTitle}>Thông tin người dùng</Text>
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
          </View>
        </FocusedScreenTransition>
      );
    }

    if (view === "users") {
      return (
        <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="fade">
          <View style={styles.screen}>
            <View style={styles.header}>
              <Pressable onPress={() => navigateAdmin("dashboard")} hitSlop={12}>
                <Text style={styles.backText}>‹ Admin</Text>
              </Pressable>
              <Text style={styles.headerTitle}>Người dùng</Text>
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
                  placeholder="Tìm theo tên hoặc email…"
                  placeholderTextColor={theme.inputPlaceholder}
                  style={styles.formInput}
                  value={userSearch}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {(["All", ...userRoleOptions] as (AdminUserRole | "All")[]).map((role) => (
                    <FilterChip
                      key={role}
                      label={role === "All" ? "Tất cả vai trò" : role === "Admin" ? "Quản trị viên" : "Người dùng"}
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
              <View style={styles.userTable}>
                <View style={styles.tableHeading}><Text style={styles.tableHeadingText}>NGƯỜI DÙNG</Text><Text style={styles.tableHeadingText}>{userTotalCount} tài khoản</Text></View>
                {(users ?? []).map(user => <AdminUserRow key={user.id} user={user} onPress={() => openUserDetail(user)} />)}
              </View>
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
          </View>
        </FocusedScreenTransition>
      );
    }

    if (view === "training") {
      return null;
    }

    if (view === "categories") {
      return (
        <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="fade">
          <View style={styles.screen}>
            <View style={styles.header}>
              <Pressable onPress={() => navigateAdmin("dashboard")} hitSlop={12}>
                <Text style={styles.backText}>‹ Admin</Text>
              </Pressable>
              <Text style={styles.headerTitle}>Danh mục mặc định</Text>
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
          </View>
        </FocusedScreenTransition>
      );
    }

    if (view === "documents") {
      return (
        <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="fade">
          <View style={styles.screen}>
            <View style={styles.header}>
              <Pressable onPress={() => navigateAdmin("dashboard")} hitSlop={12}>
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
          </View>
        </FocusedScreenTransition>
      );
    }

    return (
      <FocusedScreenTransition style={styles.screen} triggerKey={view} variant="fade">
        <View style={styles.screen}>
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
              <View style={styles.welcomeCopy}>
                <Text style={styles.eyebrow}>KHÔNG GIAN QUẢN TRỊ</Text>
                <Text style={styles.title}>Tổng quan hệ thống</Text>
                <Text style={styles.pageDescription}>Quản lý người dùng, dữ liệu và tri thức trong một không gian.</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => loadAdminData({ refresh: true })} disabled={isRefreshing} style={({ hovered }) => [styles.refreshButton, hovered && styles.hoverSurface]}>
                {isRefreshing ? <ActivityIndicator size="small" color={theme.textMuted} /> : <RotateCw size={14} color={theme.textMuted} />}<Text style={styles.refreshText}>Làm mới</Text>
              </Pressable>
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
                  <AdminTile Icon={Users} label="Người dùng" metric={userTotalCount} note="Tài khoản trong hệ thống" onPress={() => navigateAdmin("users")} />
                  <AdminTile Icon={FolderOpen} label="Danh mục" metric={defaultCategories.length} note="Danh mục mặc định" onPress={() => navigateAdmin("categories")} />
                  <AdminTile Icon={BookOpen} label="Tài liệu tri thức" metric={ragDocuments.length} note="Nguồn dữ liệu cho trợ lý AI" onPress={() => navigateAdmin("documents")} />
                </View>

                <View style={styles.overviewGrid}>
                  <View style={styles.overviewMain}>
                    <View style={styles.panelHeading}><View><Text style={styles.panelTitle}>Người dùng</Text><Text style={styles.panelSubtitle}>Tài khoản trong danh sách hiện tại</Text></View><Pressable accessibilityRole="button" onPress={() => navigateAdmin("users")} style={styles.inlineLink}><Text style={styles.inlineLinkText}>Xem tất cả</Text><ArrowUpRight size={14} color={theme.primary} /></Pressable></View>
                    {users.length === 0 ? <Text style={styles.panelEmpty}>Chưa có người dùng để hiển thị.</Text> : users.slice(0, 5).map(user => <AdminUserRow key={user.id} user={user} onPress={() => openUserDetail(user)} compact />)}
                  </View>
                  <View style={styles.overviewAside}>
                    <View style={styles.panelHeading}><View><Text style={styles.panelTitle}>Kho tri thức</Text><Text style={styles.panelSubtitle}>Trạng thái xử lý tài liệu</Text></View><BookOpen size={18} color={theme.textMuted} /></View>
                    <View style={styles.knowledgeStats}>
                      <StatRow label="Đã lập chỉ mục" value={String(ragDocuments.filter(doc => doc.status === "Indexed").length)} />
                      <StatRow label="Đang xử lý" value={String(ragDocuments.filter(doc => doc.status === "Processing").length)} />
                      <StatRow label="Bản nháp" value={String(ragDocuments.filter(doc => doc.status === "Draft").length)} />
                      <StatRow label="Cần kiểm tra" value={String(ragDocuments.filter(doc => doc.status === "Failed").length)} />
                    </View>
                    <Pressable accessibilityRole="button" style={styles.panelFooter} onPress={() => navigateAdmin("documents")}><Text style={styles.inlineLinkText}>Quản lý tài liệu</Text><ArrowUpRight size={14} color={theme.primary} /></Pressable>
                  </View>
                </View>
                <Pressable accessibilityRole="button" onPress={() => navigateAdmin("training")} style={({ hovered }) => [styles.trainingEntry, hovered && styles.hoverSurface]}>
                  <View style={styles.trainingEntryIcon}><SlidersHorizontal size={20} color={theme.primary} /></View><View style={styles.rowCopy}><Text style={styles.panelTitle}>Mô hình dự báo</Text><Text style={styles.panelSubtitle}>Chọn dữ liệu người dùng và quản lý quá trình huấn luyện.</Text></View><ArrowUpRight size={18} color={theme.textMuted} />
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </FocusedScreenTransition>
    );
  }

  return (
    <AdminShell view={view} onNavigate={navigateAdmin} name={currentUser?.displayName ?? currentUser?.username ?? "Admin"} onLogout={confirmLogout} isLoggingOut={isLoggingOut}>
      <View style={[styles.screen, view === "training" && styles.hidden]}>{renderContent()}</View>
      {hasOpenedTraining ? <View style={[styles.screen, view !== "training" && styles.hidden]}><ForecastTrainingWorkspace active={view === "training"} renderResult={result => <ForecastTrainingResult result={result} />} /></View> : null}
    </AdminShell>
  );
}

function AdminTile({ Icon, label, metric, note, onPress }: {
  Icon: CategoryIconComponent; label: string; metric: number; note: string; onPress: () => void;
}) {
  const styles = useAdminStyles();
  const theme = useAdminTheme();
  return (
    <Pressable accessibilityRole="button" style={({ hovered, pressed }) => [styles.tile, (hovered || pressed) && styles.tileHovered]} onPress={onPress}>
      <View style={styles.tileTop}><Text style={styles.tileLabel}>{label}</Text><Icon size={18} strokeWidth={1.6} color={theme.textMuted} /></View>
      <Text style={styles.tileMetric}>{new Intl.NumberFormat("vi-VN").format(metric)}</Text>
      <View style={styles.tileTop}><Text style={styles.tileNote}>{note}</Text><ArrowUpRight size={14} color={theme.textMuted} /></View>
    </Pressable>
  );
}

function AdminUserRow({ user, onPress, compact = false }: { user: AdminUser; onPress: () => void; compact?: boolean }) {
  const styles = useAdminStyles();
  const theme = useAdminTheme();
  const desktop = useWindowDimensions().width >= 1100;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ hovered, pressed }) => [styles.userRow, compact && styles.compactUserRow, (hovered || pressed) && styles.hoverSurface]}>
    <View style={styles.userMiniAvatar}><Text style={styles.userMiniAvatarText}>{(user.displayName || user.username || "U").charAt(0).toUpperCase()}</Text></View>
    <View style={styles.rowCopy}><Text numberOfLines={1} style={styles.rowTitle}>{user.displayName || user.username}</Text><Text numberOfLines={1} style={styles.rowSubtitle}>{user.email}</Text></View>
    {!compact && desktop ? <View style={styles.userStatusColumn}><View style={styles.statusLine}><View style={[styles.statusDot, { backgroundColor: user.status === "Active" ? theme.primary : theme.textMuted }]} /><Text style={styles.rowSubtitle}>{getUserStatusLabel(user.status)}</Text></View><Text style={styles.rowSubtitle}>{formatDate(user.createdAt)}</Text></View> : null}
    {!compact && !desktop ? <Text style={styles.mobileStatus}>{getUserStatusLabel(user.status)}</Text> : null}
    <View style={[styles.roleBadge, user.role === "Admin" && styles.roleBadgeAdmin]}><Text style={[styles.roleBadgeText, user.role === "Admin" && styles.roleBadgeTextAdmin]}>{user.role === "Admin" ? "Quản trị" : "Thành viên"}</Text></View>
    {desktop && !compact ? <ArrowUpRight size={15} color={theme.textMuted} /> : null}
  </Pressable>;
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
  const theme = useAdminTheme();
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
  const theme = useAdminTheme();
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
  theme: AdminTheme;
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
  theme: AdminTheme;
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
  const theme = useAdminTheme();
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
  const theme = useAdminTheme();
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
  theme: AdminTheme;
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

function createStyles(theme: AdminTheme, isDesktop: boolean) {
  return adminStyleSheet({
    screen: { backgroundColor: theme.screen, flex: 1 },
    hidden: { display: "none" },
    content: { alignSelf: "center", width: "100%", maxWidth: 1360, padding: isDesktop ? 36 : 18, paddingBottom: 48 },
    welcomeRow: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between", marginBottom: 28, marginTop: 4 },
    welcomeCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: theme.textMuted, fontSize: 10, fontWeight: "500", letterSpacing: 1.4, marginBottom: 9 },
    title: { color: theme.text, fontSize: isDesktop ? 27 : 23, fontWeight: "600", letterSpacing: -0.8, lineHeight: isDesktop ? 36 : 31 },
    pageDescription: { color: theme.textMuted, fontSize: 13, lineHeight: 21, marginTop: 7 },
    refreshButton: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 7 },
    refreshText: { color: theme.textMuted, fontSize: 12, fontWeight: "500" },
    hoverSurface: { backgroundColor: theme.cardAlt },
    tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 26 },
    tile: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 10, flexBasis: isDesktop ? "29%" : "100%", flexGrow: 1, minWidth: 0, padding: 22 },
    tileHovered: { borderColor: theme.primary },
    tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    tileLabel: { color: theme.textMuted, fontSize: 13, fontWeight: "500" },
    tileMetric: { color: theme.text, fontSize: 34, fontWeight: "600", letterSpacing: -1, lineHeight: 44, marginTop: 15, marginBottom: 12, fontVariant: ["tabular-nums"] },
    tileNote: { color: theme.textMuted, fontSize: 11, lineHeight: 17 },
    sectionLabel: { color: theme.text, fontSize: 13, fontWeight: "500", marginBottom: 10, marginTop: 16 },
    statsCard: { backgroundColor: theme.card, borderColor: theme.border, borderRadius: 10, borderWidth: 1, overflow: "hidden" },
    overviewGrid: { flexDirection: isDesktop ? "row" : "column", alignItems: "stretch", gap: 20 },
    overviewMain: { flex: isDesktop ? 1.65 : undefined, minWidth: 0, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 10, overflow: "hidden" },
    overviewAside: { flex: isDesktop ? 1 : undefined, minWidth: 0, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 10, overflow: "hidden" },
    panelHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: 20, borderBottomColor: theme.border, borderBottomWidth: 1 },
    panelTitle: { color: theme.text, fontSize: 14, fontWeight: "600", lineHeight: 21 },
    panelSubtitle: { color: theme.textMuted, fontSize: 12, lineHeight: 19, marginTop: 3 },
    inlineLink: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5 },
    inlineLinkText: { color: theme.primary, fontSize: 11, fontWeight: "500" },
    panelEmpty: { color: theme.textMuted, fontSize: 13, padding: 24 },
    knowledgeStats: { paddingHorizontal: 4, paddingVertical: 7 },
    panelFooter: { borderTopColor: theme.border, borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18 },
    trainingEntry: { flexDirection: "row", alignItems: "center", gap: 15, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 10, marginTop: 22, padding: 20 },
    trainingEntryIcon: { backgroundColor: theme.primaryPressed, width: 42, height: 42, borderRadius: 9, alignItems: "center", justifyContent: "center" },
    userTable: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, overflow: "hidden", backgroundColor: theme.card },
    tableHeading: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 13, backgroundColor: theme.cardAlt, borderBottomWidth: 1, borderBottomColor: theme.border },
    tableHeadingText: { color: theme.textMuted, fontSize: 10, fontWeight: "500", letterSpacing: 0.6 },
    compactUserRow: { minHeight: 68, paddingHorizontal: 20 },
    userStatusColumn: { width: 190, gap: 3 },
    statusLine: { flexDirection: "row", alignItems: "center", gap: 6 },
    statusDot: { width: 6, height: 6, borderRadius: 3, marginTop: 3 },
    mobileStatus: { color: theme.textMuted, fontSize: 10, maxWidth: 62, lineHeight: 16 },
    loadWarningCard: {
      backgroundColor: theme.warningBackground,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 6,
      marginBottom: 18,
      padding: 14,
    },
    loadWarningText: { color: theme.dangerText, fontSize: 13, fontWeight: "400", lineHeight: 19 },
    statRow: {
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 43,
      paddingHorizontal: 16,
    },
    statLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "400" },
    statValue: { color: theme.text, fontSize: 14, fontWeight: "500", fontVariant: ["tabular-nums"] },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      alignSelf: "center",
      width: "100%",
      maxWidth: 1360,
      paddingBottom: 14,
      paddingHorizontal: isDesktop ? 36 : 18,
      paddingTop: isDesktop ? 28 : 12,
    },
    backText: { color: theme.textMuted, fontSize: 12, fontWeight: "500" },
    headerTitle: { color: theme.text, fontSize: isDesktop ? 23 : 17, fontWeight: "600", flex: 1, textAlign: "center", letterSpacing: -0.4 },
    headerSpacer: { width: 74 },
    headerCount: { color: theme.textMuted, fontSize: 14, fontWeight: "600", minWidth: 74, textAlign: "right" },
    listContent: { alignSelf: "center", width: "100%", maxWidth: 1360, gap: 16, padding: isDesktop ? 36 : 18, paddingBottom: isDesktop ? 48 : 96 },
    userFilterCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 12,
    },
    filterRow: { gap: 8 },
    filterChip: {
      backgroundColor: theme.cardAlt,
      borderColor: theme.border,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipSelected: { backgroundColor: theme.primaryPressed, borderColor: theme.primary },
    filterChipText: { color: theme.textMuted, fontSize: 12, fontWeight: "600" },
    filterChipTextSelected: { color: theme.primary },
    userRow: { alignItems: "center", backgroundColor: theme.card, borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 14, minHeight: 80, padding: 18 },
    userMiniAvatar: { alignItems: "center", backgroundColor: theme.cardAlt, borderRadius: 9, height: 36, justifyContent: "center", width: 36 },
    userMiniAvatarText: { color: theme.textMuted, fontSize: 13, fontWeight: "500" },
    rowCopy: { flex: 1, minWidth: 0 },
    rowTitle: { color: theme.text, fontSize: 13, fontWeight: "500", lineHeight: 20 },
    rowSubtitle: { color: theme.textMuted, fontSize: 12, fontWeight: "400", marginTop: 3, lineHeight: 18 },
    roleBadge: {
      backgroundColor: theme.cardAlt,
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    roleBadgeAdmin: { backgroundColor: theme.primaryPressed },
    roleBadgeText: { color: theme.textMuted, fontSize: 11, fontWeight: "600" },
    roleBadgeTextAdmin: { color: theme.primary },
    categoryContent: { alignSelf: "center", width: "100%", maxWidth: 1360, gap: 10, padding: isDesktop ? 36 : 18, paddingBottom: isDesktop ? 48 : 96 },
    documentContent: { alignSelf: "center", width: "100%", maxWidth: 1360, gap: 10, padding: isDesktop ? 36 : 18, paddingBottom: isDesktop ? 48 : 96 },
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
    categoryIconText: { color: theme.primary, fontSize: 16, fontWeight: "600" },
    defaultTag: { color: theme.primary, fontSize: 12, fontWeight: "600" },
    deleteCategoryButton: {
      backgroundColor: theme.warningBackground,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    deleteCategoryText: { color: theme.dangerText, fontSize: 12, fontWeight: "600" },
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
    documentDescription: { color: theme.textMuted, fontSize: 13, fontWeight: "400", lineHeight: 19 },
    documentMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    documentMetaText: {
      backgroundColor: theme.cardAlt,
      borderRadius: 8,
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "600",
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    documentError: { color: theme.dangerText, fontSize: 12, fontWeight: "500", lineHeight: 18 },
    documentStatusBadge: {
      backgroundColor: theme.cardAlt,
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    documentStatusGood: { backgroundColor: theme.goodBackground },
    documentStatusDanger: { backgroundColor: `${theme.danger}22` },
    documentStatusWarning: { backgroundColor: theme.warningBackground },
    documentStatusText: { color: theme.text, fontSize: 11, fontWeight: "600" },
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
      fontWeight: "600",
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
    actionMenuLabel: { color: theme.text, fontSize: 15, fontWeight: "500" },
    actionMenuDangerLabel: { color: theme.dangerText },
    documentActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    documentActionButton: {
      backgroundColor: theme.primaryPressed,
      borderRadius: 8,
      minHeight: 34,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    documentActionText: { color: theme.primary, fontSize: 12, fontWeight: "600" },
    documentDeleteButton: {
      backgroundColor: theme.warningBackground,
      borderRadius: 8,
      minHeight: 34,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    documentDeleteText: { color: theme.dangerText, fontSize: 12, fontWeight: "600" },
    emptyDocumentCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      padding: 20,
    },
    emptyDocumentTitle: { color: theme.text, fontSize: 18, fontWeight: "600" },
    emptyDocumentText: { color: theme.textMuted, fontSize: 13, fontWeight: "400", lineHeight: 20 },
    addButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    addButtonText: { color: theme.textInverse, fontSize: 24, fontWeight: "500", lineHeight: 27 },
    detailContent: { alignSelf: "center", width: "100%", maxWidth: 900, gap: 18, padding: isDesktop ? 36 : 18, paddingBottom: 48 },
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
      backgroundColor: theme.primaryPressed,
      borderRadius: 35,
      height: 70,
      justifyContent: "center",
      marginBottom: 12,
      width: 70,
    },
    userAvatarText: { color: theme.primary, fontSize: 30, fontWeight: "600" },
    userDetailName: { color: theme.text, fontSize: 21, fontWeight: "600" },
    userDetailEmail: { color: theme.textMuted, fontSize: 14, fontWeight: "400", marginTop: 5 },
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
    infoLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "600" },
    infoValue: { color: theme.text, fontSize: 15, fontWeight: "500" },
    modalOverlay: { flex: 1, justifyContent: isDesktop ? "center" : "flex-end" },
    modalBackdrop: {
      backgroundColor: theme.overlay,
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    categoryFormSheet: {
      alignSelf: "center",
      width: "100%",
      maxWidth: isDesktop ? 580 : undefined,
      maxHeight: "90%",
      backgroundColor: theme.sheet,
      borderRadius: isDesktop ? 12 : 0,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      overflow: "hidden",
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
    formClose: { color: theme.textMuted, fontSize: 15, fontWeight: "600" },
    formTitle: { color: theme.text, fontSize: 17, fontWeight: "600" },
    formSave: { color: theme.primary, fontSize: 15, fontWeight: "600" },
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
    paginationButtonText: { color: theme.primary, fontSize: 13, fontWeight: "600" },
    paginationText: { color: theme.textMuted, fontSize: 13, fontWeight: "600" },
    formBody: { gap: 16, padding: 18 },
    formField: { gap: 8 },
    formLabel: { color: theme.text, fontSize: 13, fontWeight: "600" },
    formInput: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      fontSize: 14,
      paddingHorizontal: 13,
      paddingVertical: 11,
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
    iconSelectPreviewText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
    iconSelectCopy: { flex: 1 },
    iconSelectTitle: { color: theme.text, fontSize: 14, fontWeight: "600" },
    iconSelectSubtitle: { color: theme.textMuted, fontSize: 11, fontWeight: "400", marginTop: 3 },
    iconSelectChevron: { color: theme.textMuted, fontSize: 24, fontWeight: "500" },
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
    iconPickerLabel: { color: theme.text, fontSize: 11, fontWeight: "500", textAlign: "center" },
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
    filePickerTitle: { color: theme.text, fontSize: 15, fontWeight: "600" },
    filePickerSubtitle: { color: theme.textMuted, fontSize: 12, fontWeight: "400" },
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
    typeToggleText: { color: theme.text, fontSize: 14, fontWeight: "600" },
    typeToggleTextSelected: { color: theme.textInverse },
    fullSaveButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 50,
    },
    fullSaveButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: "600" },
    loadingCard: {
      alignItems: "center",
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 26,
    },
    loadingText: { color: theme.textMuted, fontSize: 14, fontWeight: "400" },
    deniedCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      margin: 18,
      padding: 20,
    },
    deniedTitle: { color: theme.text, fontSize: 18, fontWeight: "600" },
    deniedText: { color: theme.textMuted, fontSize: 14, fontWeight: "400", lineHeight: 21, marginTop: 8 },
  });
}
