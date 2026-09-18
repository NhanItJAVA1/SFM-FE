import * as Google from "expo-auth-session/providers/google";
import { Link, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { authApi } from "@/api/authApi";
import { getAuthAccessToken } from "@/stores/authSession";
import { saveAuthSession } from "@/stores/persistedAuthSession";

WebBrowser.maybeCompleteAuthSession();

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const googleClientIdForPlatform = Platform.select({
  ios: googleIosClientId,
  android: googleAndroidClientId,
  default: googleWebClientId,
});

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useIdTokenAuthRequest({
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
    selectAccount: true,
  });

  useEffect(() => {
    if (getAuthAccessToken()) {
      router.replace("/(tabs)/home");
    }
  }, []);

  useEffect(() => {
    async function loginWithGoogleToken(token: string) {
      try {
        const response = await authApi.externalLogin({
          provider: "Google",
          token,
        });
        await saveAuthSession(response.data);
        router.replace("/(tabs)/home");
      } catch (error) {
        Alert.alert("Google sign in failed", error instanceof Error ? error.message : "Unable to sign in with Google.");
      } finally {
        setIsGoogleSubmitting(false);
      }
    }

    if (googleResponse?.type !== "success") {
      return;
    }

    const token = googleResponse.params.id_token ?? googleResponse.params.access_token;

    if (!token) {
      Alert.alert("Google sign in failed", "Google did not return a token.");
      setTimeout(() => setIsGoogleSubmitting(false), 0);
      return;
    }

    loginWithGoogleToken(token);
  }, [googleResponse]);

  async function handleLogin() {
    try {
      setIsSubmitting(true);
      const response = await authApi.login({ username: username.trim(), password });
      await saveAuthSession(response.data);
      router.replace("/(tabs)/home");
    } catch (error) {
      Alert.alert("Sign in failed", error instanceof Error ? error.message : "Unable to connect to the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    if (!googleClientIdForPlatform) {
      Alert.alert("Google sign in failed", `Missing Google client id for ${Platform.OS}. Check your .env file.`);
      return;
    }

    try {
      setIsGoogleSubmitting(true);
      const result = await promptGoogleSignIn();

      if (result.type !== "success") {
        setIsGoogleSubmitting(false);
        return;
      }
    } catch (error) {
      Alert.alert("Google sign in failed", error instanceof Error ? error.message : "Unable to sign in with Google.");
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to continue to SFM.</Text>
      <TextInput
        placeholder="Username"
        autoCapitalize="none"
        style={styles.input}
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />
      <Pressable
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={isSubmitting}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
      <Pressable
        style={[styles.googleButton, (!googleRequest || isGoogleSubmitting) && styles.buttonDisabled]}
        onPress={handleGoogleLogin}
        disabled={!googleRequest || isGoogleSubmitting}
      >
        {isGoogleSubmitting ? (
          <ActivityIndicator color="#1f2328" />
        ) : (
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        )}
      </Pressable>
      <Link href="/auth/register" style={styles.link}>
        Create a user profile
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 14 },
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { color: "#68707d", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#d4d9e1", borderRadius: 10, padding: 14 },
  button: { backgroundColor: "#1f6feb", borderRadius: 10, padding: 15, alignItems: "center" },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "700" },
  googleButton: {
    borderWidth: 1,
    borderColor: "#d4d9e1",
    borderRadius: 10,
    padding: 15,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  googleButtonText: { color: "#1f2328", fontWeight: "700" },
  link: { color: "#1f6feb", textAlign: "center", marginTop: 8 },
});
