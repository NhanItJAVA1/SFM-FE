import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { authApi } from "@/api/authApi";
import { setApiAccessToken } from "@/api/axiosClient";
import { getAuthRefreshToken, getAuthUser, setAuthRefreshToken, setAuthUser } from "@/stores/authSession";

export default function UserScreen() {
  const user = getAuthUser();
  const initial = (user?.displayName ?? user?.username ?? "U").trim().charAt(0).toUpperCase() || "U";
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    try {
      setIsLoggingOut(true);
      const refreshToken = getAuthRefreshToken();
      await authApi.logout(refreshToken ? { refreshToken } : undefined);
    } catch {
      // Local logout still proceeds when the server cannot clear the token.
    } finally {
      setApiAccessToken(null);
      setAuthUser(null);
      setAuthRefreshToken(null);
      setIsLoggingOut(false);
      router.replace("/auth/login");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Users</Text>
        <Text style={styles.support}>Hỗ trợ ?</Text>
      </View>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{user?.displayName ?? user?.username ?? "Người dùng"}</Text>
        <Text style={styles.email}>{user?.email ?? "Chưa có email"}</Text>
      </View>
      <Pressable style={styles.accountLink} onPress={() => router.push("/account")}>
        <View style={styles.accountIcon}>
          <Text style={styles.accountIconText}>▣</Text>
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountTitle}>Account</Text>
          <Text style={styles.accountSubtitle}>Quản lý các tài khoản tài chính</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable
        style={[styles.logoutButton, isLoggingOut && styles.disabled]}
        onPress={handleLogout}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.logoutText}>Đăng xuất</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f7f8fa", flex: 1 },
  content: { padding: 20, paddingBottom: 96 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    marginTop: 18,
  },
  title: { color: "#171a21", fontSize: 26, fontWeight: "800" },
  support: { color: "#737984", fontSize: 14 },
  profileCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e5e8ed",
    borderRadius: 14,
    borderWidth: 1,
    padding: 28,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#2fa9df",
    borderRadius: 42,
    height: 84,
    justifyContent: "center",
    marginBottom: 14,
    width: 84,
  },
  avatarText: { color: "#fff", fontSize: 40, fontWeight: "700" },
  name: { color: "#171a21", fontSize: 21, fontWeight: "700" },
  email: { color: "#737984", fontSize: 14, marginTop: 6 },
  accountLink: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e5e8ed",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 16,
    minHeight: 78,
    paddingHorizontal: 16,
  },
  accountIcon: {
    alignItems: "center",
    backgroundColor: "#e5f7eb",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginRight: 12,
    width: 40,
  },
  accountIconText: { color: "#27ad4a", fontSize: 20 },
  accountCopy: { flex: 1 },
  accountTitle: { color: "#252a33", fontSize: 17, fontWeight: "700" },
  accountSubtitle: { color: "#737984", fontSize: 12, marginTop: 4 },
  chevron: { color: "#737984", fontSize: 30 },
  logoutButton: {
    alignItems: "center",
    backgroundColor: "#d83b3b",
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 50,
  },
  logoutText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.7 },
});
