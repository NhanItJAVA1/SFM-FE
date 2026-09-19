import { CameraCapturedPicture, CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { TransactionDraft, transactionsApi } from "@/api/transactionsApi";
import { TransactionDraftReview } from "@/components/transaction-draft-review";
import { useAppTheme } from "@/hooks/use-app-theme";
import type { AppTheme } from "@/theme/appTheme";

const loadingGif = require("../../assets/loading.gif");

type BillPhoto = Pick<CameraCapturedPicture, "uri">;

export default function ScanBillScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<BillPhoto | null>(null);
  const [draft, setDraft] = useState<TransactionDraft | null>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function handleTakePicture() {
    if (!cameraRef.current || isTakingPicture) {
      return;
    }

    try {
      setIsTakingPicture(true);
      const nextPhoto = await cameraRef.current.takePictureAsync({
        quality: 0.55,
        imageType: "jpg",
      });

      setPhoto(nextPhoto);
    } catch (error) {
      Alert.alert("Không chụp được ảnh", error instanceof Error ? error.message : "Vui lòng thử lại.");
    } finally {
      setIsTakingPicture(false);
    }
  }

  async function handlePickImage() {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert("Cần quyền thư viện ảnh", "Vui lòng cho phép SFM truy cập ảnh để tải hóa đơn lên.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 0.8,
      });

      if (!result.canceled) {
        setPhoto({ uri: result.assets[0].uri });
      }
    } catch (error) {
      Alert.alert("Không chọn được ảnh", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  }

  async function handleUploadPhoto() {
    if (!photo || isUploading) {
      return;
    }

    try {
      setIsUploading(true);
      const response = await transactionsApi.scanBill(photo.uri);
      setDraft(response.data);
    } catch (error) {
      Alert.alert("Gửi hóa đơn thất bại", error instanceof Error ? error.message : "Vui lòng thử lại.");
    } finally {
      setIsUploading(false);
    }
  }

  if (!permission) {
    return <View style={styles.screen} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <Text style={styles.permissionTitle}>Cần quyền camera</Text>
        <Text style={styles.permissionText}>SFM cần camera để chụp hóa đơn và gửi về hệ thống.</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Cho phép camera</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Quay lại</Text>
        </Pressable>
      </View>
    );
  }

  if (draft) {
    return (
      <TransactionDraftReview
        draft={draft}
        imageUri={photo?.uri}
        onRetake={() => {
          setDraft(null);
          setPhoto(null);
        }}
      />
    );
  }

  if (photo) {
    return (
      <View style={styles.screen}>
        <Image source={{ uri: photo.uri }} style={styles.previewImage} />
        <View style={styles.previewOverlay}>
          <View style={styles.topBar}>
            <Pressable onPress={() => setPhoto(null)} hitSlop={12}>
              <Text style={styles.topAction}>Chụp lại</Text>
            </Pressable>
            <Text style={styles.topTitle}>Xem lại hóa đơn</Text>
            <View style={styles.topSpacer} />
          </View>

          <Pressable
            style={[styles.uploadButton, isUploading && styles.buttonDisabled]}
            onPress={handleUploadPhoto}
            disabled={isUploading}
          >
            <Text style={styles.uploadButtonText}>{isUploading ? "Đang phân tích..." : "Gửi về BE"}</Text>
          </Pressable>
        </View>
        <ScanBillLoadingOverlay visible={isUploading} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="picture" />
      <View style={styles.cameraOverlay}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.topAction}>Đóng</Text>
          </Pressable>
          <Text style={styles.topTitle}>Quét hóa đơn</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.scanFrame}>
          <View style={styles.cornerTopLeft} />
          <View style={styles.cornerTopRight} />
          <View style={styles.cornerBottomLeft} />
          <View style={styles.cornerBottomRight} />
        </View>

        <Pressable style={styles.galleryButton} onPress={handlePickImage} hitSlop={12}>
          <Text style={styles.galleryButtonIcon}>🖼️</Text>
        </Pressable>

        <Text style={styles.hint}>Đặt hóa đơn trong khung và chụp rõ nội dung</Text>

        <Pressable
          style={[styles.shutterButton, isTakingPicture && styles.buttonDisabled]}
          onPress={handleTakePicture}
          disabled={isTakingPicture}
        >
          <View style={styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

function ScanBillLoadingOverlay({ visible }: { visible: boolean }) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.loadingOverlay}>
      <Image source={loadingGif} style={styles.loadingImage} resizeMode="contain" />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  screen: { backgroundColor: theme.screen, flex: 1 },
  camera: { flex: 1 },
  cameraOverlay: {
    bottom: 0,
    justifyContent: "space-between",
    left: 0,
    padding: 24,
    paddingBottom: 36,
    position: "absolute",
    right: 0,
    top: 0,
  },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingTop: 26 },
  topAction: { color: theme.primary, fontSize: 17, fontWeight: "800" },
  topTitle: { color: theme.textInverse, fontSize: 20, fontWeight: "800" },
  topSpacer: { width: 58 },
  scanFrame: { alignSelf: "center", height: 390, marginTop: 48, position: "relative", width: "88%" },
  galleryButton: {
    alignItems: "center",
    backgroundColor: theme.overlayStrong,
    borderColor: "rgba(255,255,255,0.52)",
    borderRadius: 23,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    marginBottom: 10,
    marginRight: 4,
    marginTop: -14,
    position: "relative",
    alignSelf: "flex-end",
    width: 46,
  },
  galleryButtonIcon: { fontSize: 22 },
  cornerTopLeft: {
    borderColor: theme.primary,
    borderLeftWidth: 5,
    borderTopWidth: 5,
    height: 54,
    left: 0,
    position: "absolute",
    top: 0,
    width: 54,
  },
  cornerTopRight: {
    borderColor: theme.primary,
    borderRightWidth: 5,
    borderTopWidth: 5,
    height: 54,
    position: "absolute",
    right: 0,
    top: 0,
    width: 54,
  },
  cornerBottomLeft: {
    borderBottomWidth: 5,
    borderColor: theme.primary,
    borderLeftWidth: 5,
    bottom: 0,
    height: 54,
    left: 0,
    position: "absolute",
    width: 54,
  },
  cornerBottomRight: {
    borderBottomWidth: 5,
    borderColor: theme.primary,
    borderRightWidth: 5,
    bottom: 0,
    height: 54,
    position: "absolute",
    right: 0,
    width: 54,
  },
  hint: { color: theme.textInverse, fontSize: 15, fontWeight: "700", lineHeight: 22, marginHorizontal: 18, textAlign: "center" },
  shutterButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.24)",
    borderColor: theme.textInverse,
    borderRadius: 42,
    borderWidth: 4,
    height: 84,
    justifyContent: "center",
    width: 84,
  },
  shutterInner: { backgroundColor: theme.textInverse, borderRadius: 30, height: 60, width: 60 },
  permissionScreen: {
    alignItems: "center",
    backgroundColor: theme.screen,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  permissionTitle: { color: theme.text, fontSize: 28, fontWeight: "800", marginBottom: 10 },
  permissionText: { color: theme.textMuted, fontSize: 16, lineHeight: 23, marginBottom: 24, textAlign: "center" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.primary,
    borderRadius: 8,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 20,
    width: "100%",
  },
  primaryButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: "800" },
  secondaryButton: { alignItems: "center", minHeight: 48, justifyContent: "center", marginTop: 10, width: "100%" },
  secondaryButtonText: { color: theme.textSubtle, fontSize: 16, fontWeight: "700" },
  previewImage: { height: "100%", width: "100%" },
  previewOverlay: {
    bottom: 0,
    justifyContent: "space-between",
    left: 0,
    padding: 24,
    paddingBottom: 36,
    position: "absolute",
    right: 0,
    top: 0,
  },
  uploadButton: {
    alignItems: "center",
    backgroundColor: theme.primary,
    borderRadius: 8,
    minHeight: 54,
    justifyContent: "center",
  },
  uploadButtonText: { color: theme.textInverse, fontSize: 17, fontWeight: "800" },
  buttonDisabled: { opacity: 0.65 },
  loadingOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 24,
    position: "absolute",
    right: 0,
    top: 0,
  },
  loadingImage: { height: 132, width: 132 },
  });
}
