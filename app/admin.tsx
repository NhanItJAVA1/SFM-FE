import * as DocumentPicker from "expo-document-picker";
import { router, useFocusEffect } from "expo-router";
import { CheckCircle2, Eye, MoreVertical, Pencil, RotateCw, Trash2 } from "lucide-react-native";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { adminApi } from "@/api/adminApi";
import type { AuthUser } from "@/api/authApi";
import { authApi } from "@/api/authApi";
import { type Category, type CategoryType } from "@/api/categoriesApi";
import { ragDocumentsApi, type RagDocument } from "@/api/ragDocumentsApi";
import { transactionsApi, type Transaction } from "@/api/transactionsApi";
import { usersApi } from "@/api/usersApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
import { useAppTheme } from "@/hooks/use-app-theme";
import { getAuthRefreshToken, getAuthUser } from "@/stores/authSession";
import { clearAuthSession } from "@/stores/persistedAuthSession";
import type { AppTheme } from "@/theme/appTheme";
import { isAdminUser } from "@/utils/authRole";

type AdminView = "dashboard" | "users" | "categories" | "documents";
type CategoryFormState = {
  icon: string;
  name: string;
  type: CategoryType;
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
  icon: "other",
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

function useAdminStyles() {
  const theme = useAppTheme();

  return useMemo(() => createStyles(theme), [theme]);
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

function getCategoryTypeLabel(type: Category["type"]) {
  return type === "Income" ? "Thu nhập" : "Chi tiêu";
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
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ragDocuments, setRagDocuments] = useState<RagDocument[]>([]);
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);
  const [selectedRagDocument, setSelectedRagDocument] = useState<RagDocument | null>(null);
  const [actionMenuRagDocument, setActionMenuRagDocument] = useState<RagDocument | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingRagDocument, setEditingRagDocument] = useState<RagDocument | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [ragUploadForm, setRagUploadForm] = useState<RagUploadFormState>(emptyRagUploadForm);
  const [ragMetadataForm, setRagMetadataForm] = useState<RagMetadataFormState>(emptyRagMetadataForm);
  const [isCategoryFormVisible, setIsCategoryFormVisible] = useState(false);
  const [isRagDetailVisible, setIsRagDetailVisible] = useState(false);
  const [isRagUploadVisible, setIsRagUploadVisible] = useState(false);
  const [isRagMetadataVisible, setIsRagMetadataVisible] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isLoadingRagDetail, setIsLoadingRagDetail] = useState(false);
  const [isUploadingRagDocument, setIsUploadingRagDocument] = useState(false);
  const [isSavingRagMetadata, setIsSavingRagMetadata] = useState(false);
  const [processingDocumentId, setProcessingDocumentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const defaultCategories = categories;

  const loadAdminData = useCallback(async ({ refresh = false, silent = false } = {}) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else if (!silent) {
        setIsLoading(true);
      }

      const [usersResponse, categoriesResponse, transactionsResponse, ragDocumentsResponse] = await Promise.all([
        usersApi.list(),
        adminApi.listDefaultCategories(),
        transactionsApi.list({ filter: "All" }),
        ragDocumentsApi.list(),
      ]);

      setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);
      setCategories(Array.isArray(categoriesResponse.data) ? categoriesResponse.data : []);
      setTransactions(Array.isArray(transactionsResponse.data) ? transactionsResponse.data : []);
      setRagDocuments(Array.isArray(ragDocumentsResponse.data) ? ragDocumentsResponse.data : []);
    } catch (error) {
      if (silent) {
        console.warn("Không tải được admin dashboard", error);
      } else {
        Alert.alert("Không tải được dữ liệu admin", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdminUser(currentUser)) {
        loadAdminData({
          silent: users.length > 0 || categories.length > 0 || transactions.length > 0 || ragDocuments.length > 0,
        });
      }
    }, [categories.length, currentUser, loadAdminData, ragDocuments.length, transactions.length, users.length]),
  );

  function openUserDetail(user: AuthUser) {
    setSelectedUser(user);
  }

  function openAddDefaultCategory() {
    setEditingCategory(null);
    setCategoryForm(emptyCategoryForm);
    setIsCategoryFormVisible(true);
  }

  function openEditDefaultCategory(category: Category) {
    setEditingCategory(category);
    setCategoryForm({
      icon: category.icon ?? "",
      name: category.name,
      type: category.type,
    });
    setIsCategoryFormVisible(true);
  }

  function closeCategoryForm() {
    if (isSavingCategory) {
      return;
    }

    setIsCategoryFormVisible(false);
    setEditingCategory(null);
    setCategoryForm(emptyCategoryForm);
  }

  async function saveDefaultCategory() {
    const name = categoryForm.name.trim();
    const icon = categoryForm.icon.trim() || null;

    if (!name) {
      Alert.alert("Thiếu tên danh mục", "Vui lòng nhập tên category mặc định.");
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
      Alert.alert("Không lưu được category", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsSavingCategory(false);
    }
  }

  function requestDeleteDefaultCategory(category: Category) {
    Alert.alert("Xóa category mặc định", `Bạn có chắc muốn xóa "${category.name}" không?`, [
      { style: "cancel", text: "Hủy" },
      {
        onPress: () => void deleteDefaultCategory(category),
        style: "destructive",
        text: "Xóa",
      },
    ]);
  }

  async function deleteDefaultCategory(category: Category) {
    try {
      await adminApi.deleteDefaultCategory(category.id);
      setCategories((current) => (current ?? []).filter((item) => item.id !== category.id));
    } catch (error) {
      Alert.alert("Không xóa được category", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
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
      Alert.alert("Định dạng chưa hỗ trợ", "Hiện chỉ hỗ trợ .txt, .docs, .md và .pdf.");
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

    if (!asset) {
      Alert.alert("Chưa chọn file", "Vui lòng chọn tài liệu cần upload.");
      return;
    }

    if (!title) {
      Alert.alert("Thiếu tiêu đề", "Vui lòng nhập tiêu đề tài liệu.");
      return;
    }

    if (!isSupportedRagFileType(fileType)) {
      Alert.alert("Định dạng chưa hỗ trợ", "Hiện chỉ hỗ trợ .txt, .docs, .md và .pdf.");
      return;
    }

    try {
      setIsUploadingRagDocument(true);
      const uploadUrlResponse = await ragDocumentsApi.createUploadUrl({
        description: description || null,
        fileName: ragUploadForm.fileName || asset.name,
        fileType,
        ragCategory: ragCategory || null,
        title,
      });

      await ragDocumentsApi.uploadFileToPresignedUrl(uploadUrlResponse.data.uploadUrl, asset.uri, asset.file ?? null);
      await ragDocumentsApi.confirm(uploadUrlResponse.data.documentId);
      setIsRagUploadVisible(false);
      setRagUploadForm(emptyRagUploadForm);
      await loadAdminData({ refresh: true });
      Alert.alert("Upload thành công", "Tài liệu đã được upload và gửi yêu cầu indexing.");
    } catch (error) {
      Alert.alert("Upload tài liệu thất bại", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
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

  async function saveRagMetadata() {
    if (!editingRagDocument) {
      return;
    }

    const title = ragMetadataForm.title.trim();
    const description = ragMetadataForm.description.trim();
    const ragCategory = ragMetadataForm.ragCategory.trim() || "General";

    if (!title) {
      Alert.alert("Thiếu tiêu đề", "Vui lòng nhập tiêu đề tài liệu.");
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
      Alert.alert("Đã lưu metadata", "Thông tin tài liệu đã được cập nhật.");
    } catch (error) {
      Alert.alert("Không lưu được metadata", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsSavingRagMetadata(false);
    }
  }

  function requestDeleteRagDocument(document: RagDocument) {
    setActionMenuRagDocument(null);
    Alert.alert("Xóa tài liệu RAG", `Bạn muốn xóa "${document.title}"?`, [
      { style: "cancel", text: "Hủy" },
      {
        onPress: () => void deleteRagDocument(document),
        style: "destructive",
        text: "Xóa",
      },
    ]);
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
      Alert.alert("Đã xóa tài liệu", "Tài liệu RAG đã được xóa.");
    } catch (error) {
      Alert.alert("Không xóa được tài liệu", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
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
      Alert.alert("Không tải được chi tiết tài liệu", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setIsLoadingRagDetail(false);
    }
  }

  async function confirmRagDocument(document: RagDocument) {
    try {
      setProcessingDocumentId(document.id);
      await ragDocumentsApi.confirm(document.id);
      const response = await ragDocumentsApi.get(document.id);

      setRagDocuments((current) =>
        (current ?? []).map((item) => (item.id === document.id ? response.data : item)),
      );
      setSelectedRagDocument((current) => (current?.id === document.id ? response.data : current));
      Alert.alert("Đã xác nhận tài liệu", "Yêu cầu confirm/indexing đã hoàn tất.");
    } catch (error) {
      Alert.alert("Không xác nhận được tài liệu", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setProcessingDocumentId(null);
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
      Alert.alert("Đã chạy reindex", "Yêu cầu indexing lại đã hoàn tất.");
    } catch (error) {
      Alert.alert("Không chạy lại indexing", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    } finally {
      setProcessingDocumentId(null);
    }
  }

  function confirmLogout() {
    Alert.alert("Đăng xuất", "Bạn muốn đăng xuất khỏi trang Admin?", [
      { style: "cancel", text: "Hủy" },
      { onPress: () => void handleLogout(), style: "destructive", text: "Đăng xuất" },
    ]);
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
              <InfoRow label="Role" value={selectedUser.role} />
              <InfoRow label="Ngày tạo" value={formatDate(selectedUser.createdAt)} />
              <InfoRow label="Cập nhật" value={formatDate(selectedUser.updatedAt)} />
              <InfoRow label="Avatar" value={selectedUser.avatarUrl ? "Có" : "Không"} />
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
            <Text style={styles.headerCount}>{users.length}</Text>
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
            {(users ?? []).map((user) => (
              <Pressable key={user.id} style={styles.userRow} onPress={() => openUserDetail(user)}>
                <View style={styles.userMiniAvatar}>
                  <Text style={styles.userMiniAvatarText}>
                    {(user.displayName ?? user.username ?? "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{user.displayName ?? user.username}</Text>
                  <Text style={styles.rowSubtitle}>{user.email}</Text>
                </View>
                <View style={[styles.roleBadge, isAdminUser(user) && styles.roleBadgeAdmin]}>
                  <Text style={[styles.roleBadgeText, isAdminUser(user) && styles.roleBadgeTextAdmin]}>
                    {user.role}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
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
                  <Text style={styles.categoryIconText}>{category.icon?.charAt(0).toUpperCase() ?? "C"}</Text>
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
            isSaving={isSavingCategory}
            onChange={setCategoryForm}
            onClose={closeCategoryForm}
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
                  onConfirm={() => confirmRagDocument(document)}
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
                const document = actionMenuRagDocument;

                setActionMenuRagDocument(null);
                openEditRagMetadata(document);
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
            onConfirm={() => {
              if (selectedRagDocument) {
                void confirmRagDocument(selectedRagDocument);
              }
            }}
            onDelete={() => {
              if (selectedRagDocument) {
                requestDeleteRagDocument(selectedRagDocument);
              }
            }}
            onEdit={() => {
              if (selectedRagDocument) {
                openEditRagMetadata(selectedRagDocument);
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
              </View>

              <Text style={styles.sectionLabel}>Thống kê hệ thống</Text>
              <View style={styles.statsCard}>
                <StatRow label="Tổng user" value={String(users.length)} />
                <StatRow label="Tổng giao dịch" value={String(transactions.length)} />
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

function RagDocumentRow({
  document,
  isProcessing,
  onConfirm,
  onDelete,
  onMore,
}: {
  document: RagDocument;
  isProcessing: boolean;
  onConfirm: () => void;
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
          accessibilityLabel="Confirm tài liệu"
          style={styles.documentIconButton}
          onPress={onConfirm}
          disabled={isProcessing}
        >
          <CheckCircle2 color={theme.primary} size={18} strokeWidth={2.4} />
        </Pressable>
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
    <Modal animationType="fade" transparent visible={Boolean(document)} onRequestClose={onClose}>
      <View style={styles.actionMenuOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.actionMenuSheet}>
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
        </View>
      </View>
    </Modal>
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
  onConfirm,
  onDelete,
  onEdit,
  onReindex,
  visible,
}: {
  document: RagDocument | null;
  isLoading: boolean;
  isProcessing: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onReindex: () => void;
  visible: boolean;
}) {
  const styles = useAdminStyles();
  const statusLabel = document ? getRagDocumentStatusLabel(document) : "";
  const canReindex = statusLabel.toLowerCase() !== "draft";

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.categoryFormSheet}>
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
                <Pressable style={styles.documentActionButton} onPress={onConfirm} disabled={isProcessing}>
                  <Text style={styles.documentActionText}>Confirm</Text>
                </Pressable>
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
        </View>
      </View>
    </Modal>
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
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.categoryFormSheet}>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.categoryFormSheet}>
          <View style={styles.formHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.formClose}>Hủy</Text>
            </Pressable>
            <Text style={styles.formTitle}>Sửa metadata</Text>
            <Pressable onPress={onSubmit} disabled={isSaving} hitSlop={10}>
              <Text style={[styles.formSave, isSaving && styles.disabledText]}>Lưu</Text>
            </Pressable>
          </View>

          <View style={styles.formBody}>
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useAdminStyles();

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function CategoryFormModal({
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  theme,
  title,
  visible,
}: {
  form: CategoryFormState;
  isSaving: boolean;
  onChange: (form: CategoryFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  theme: AppTheme;
  title: string;
  visible: boolean;
}) {
  const styles = useAdminStyles();

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.categoryFormSheet}>
          <View style={styles.formHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.formClose}>Hủy</Text>
            </Pressable>
            <Text style={styles.formTitle}>{title}</Text>
            <Pressable onPress={onSubmit} disabled={isSaving} hitSlop={10}>
              <Text style={[styles.formSave, isSaving && styles.disabledText]}>Lưu</Text>
            </Pressable>
          </View>

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
              <TextInput
                autoCapitalize="none"
                editable={!isSaving}
                onChangeText={(icon) => onChange({ ...form, icon })}
                placeholder="food"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.formInput}
                value={form.icon}
              />
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.screen, flex: 1 },
    content: { padding: 18, paddingBottom: 96 },
    welcomeRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
      marginTop: 8,
    },
    eyebrow: { color: theme.textMuted, fontSize: 11, fontWeight: "900" },
    title: { color: theme.text, fontSize: 24, fontWeight: "900", marginTop: 4, maxWidth: 260 },
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
      flexBasis: "30%",
      flexGrow: 1,
      minHeight: 128,
      minWidth: 120,
      padding: 14,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 12,
    },
    tileLabel: { color: theme.textInverse, fontSize: 14, fontWeight: "900" },
    tileMetric: { color: theme.textInverse, fontSize: 34, fontWeight: "900", marginTop: 20 },
    tileNote: { color: theme.textInverse, fontSize: 11, fontWeight: "700", opacity: 0.88 },
    sectionLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "900", marginBottom: 10, marginTop: 22 },
    statsCard: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      overflow: "hidden",
    },
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
      paddingBottom: 14,
      paddingHorizontal: 18,
      paddingTop: 12,
    },
    backText: { color: theme.primary, fontSize: 17, fontWeight: "800" },
    headerTitle: { color: theme.text, fontSize: 20, fontWeight: "900" },
    headerSpacer: { width: 74 },
    headerCount: { color: theme.textMuted, fontSize: 14, fontWeight: "900", minWidth: 74, textAlign: "right" },
    listContent: { gap: 10, padding: 18, paddingBottom: 96 },
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
    categoryContent: { gap: 10, padding: 18, paddingBottom: 96 },
    documentContent: { gap: 10, padding: 18, paddingBottom: 96 },
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
    formBody: { gap: 16, padding: 18 },
    formField: { gap: 8 },
    formLabel: { color: theme.text, fontSize: 13, fontWeight: "900" },
    formInput: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      fontSize: 16,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
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
