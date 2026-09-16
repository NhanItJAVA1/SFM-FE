import { CameraCapturedPicture, CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { transactionsApi } from '@/api/transactionsApi';

export default function ScanBillScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<CameraCapturedPicture | null>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function handleTakePicture() {
    if (!cameraRef.current || isTakingPicture) {
      return;
    }

    try {
      setIsTakingPicture(true);
      const nextPhoto = await cameraRef.current.takePictureAsync({
        quality: 0.78,
        imageType: 'jpg',
      });

      setPhoto(nextPhoto);
    } catch (error) {
      Alert.alert('Không chụp được ảnh', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setIsTakingPicture(false);
    }
  }

  async function handleUploadPhoto() {
    if (!photo || isUploading) {
      return;
    }

    try {
      setIsUploading(true);
      await transactionsApi.scanBill(photo.uri);
      Alert.alert('Đã gửi hóa đơn', 'Ảnh hóa đơn đã được gửi về hệ thống.', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      Alert.alert('Gửi hóa đơn thất bại', error instanceof Error ? error.message : 'Vui lòng thử lại.');
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
            {isUploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.uploadButtonText}>Gửi về BE</Text>}
          </Pressable>
        </View>
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

const styles = StyleSheet.create({
  screen: { backgroundColor: '#020204', flex: 1 },
  camera: { flex: 1 },
  cameraOverlay: {
    bottom: 0,
    justifyContent: 'space-between',
    left: 0,
    padding: 24,
    paddingBottom: 36,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 26 },
  topAction: { color: '#31c452', fontSize: 17, fontWeight: '800' },
  topTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  topSpacer: { width: 58 },
  scanFrame: { alignSelf: 'center', height: 390, marginTop: 48, position: 'relative', width: '88%' },
  cornerTopLeft: { borderColor: '#31c452', borderLeftWidth: 5, borderTopWidth: 5, height: 54, left: 0, position: 'absolute', top: 0, width: 54 },
  cornerTopRight: { borderColor: '#31c452', borderRightWidth: 5, borderTopWidth: 5, height: 54, position: 'absolute', right: 0, top: 0, width: 54 },
  cornerBottomLeft: { borderBottomWidth: 5, borderColor: '#31c452', borderLeftWidth: 5, bottom: 0, height: 54, left: 0, position: 'absolute', width: 54 },
  cornerBottomRight: { borderBottomWidth: 5, borderColor: '#31c452', borderRightWidth: 5, bottom: 0, height: 54, position: 'absolute', right: 0, width: 54 },
  hint: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 22, marginHorizontal: 18, textAlign: 'center' },
  shutterButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: '#fff',
    borderRadius: 42,
    borderWidth: 4,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  shutterInner: { backgroundColor: '#fff', borderRadius: 30, height: 60, width: 60 },
  permissionScreen: { alignItems: 'center', backgroundColor: '#020204', flex: 1, justifyContent: 'center', padding: 24 },
  permissionTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 10 },
  permissionText: { color: '#a5a8b0', fontSize: 16, lineHeight: 23, marginBottom: 24, textAlign: 'center' },
  primaryButton: { alignItems: 'center', backgroundColor: '#31c452', borderRadius: 8, minHeight: 50, justifyContent: 'center', paddingHorizontal: 20, width: '100%' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center', marginTop: 10, width: '100%' },
  secondaryButtonText: { color: '#8f939d', fontSize: 16, fontWeight: '700' },
  previewImage: { height: '100%', width: '100%' },
  previewOverlay: {
    bottom: 0,
    justifyContent: 'space-between',
    left: 0,
    padding: 24,
    paddingBottom: 36,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  uploadButton: { alignItems: 'center', backgroundColor: '#31c452', borderRadius: 8, minHeight: 54, justifyContent: 'center' },
  uploadButtonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  buttonDisabled: { opacity: 0.65 },
});
