import * as Google from "expo-auth-session/providers/google";
import { Link, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { authApi } from "@/api/authApi";
import { FocusedScreenTransition } from "@/components/screen-transition";
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
const sfmLogo = require("../../assets/expo.icon/Assets/Glossy SFM Growth Analytics Logo.png");

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    if (typeof atob !== "function") {
      return null;
    }

    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
    const decodedPayload = atob(paddedPayload);

    return JSON.parse(decodedPayload) as { aud?: string; email?: string; exp?: number; iss?: string };
  } catch {
    return null;
  }
}

function LoginBackground() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="loginGradient" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#1236B8" stopOpacity="0.5" />
          <Stop offset="0.42" stopColor="#000A54" stopOpacity="1" />
          <Stop offset="1" stopColor="#07126F" stopOpacity="0.85" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="#000A54" />
      <Rect width="100%" height="100%" fill="url(#loginGradient)" />
    </Svg>
  );
}

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M23.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.5c-.3 1.4-1.1 2.7-2.3 3.5v2.9h3.7c2.2-2 3.6-4.9 3.6-8.4z"
        fill="#4285F4"
      />
      <Path
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.1-4.2 1.1-3.1 0-5.7-2.1-6.7-4.9H1.4v3C3.3 21.3 7.3 24 12 24z"
        fill="#34A853"
      />
      <Path
        d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4v-3H1.4C.5 8.2 0 10.1 0 12s.5 3.8 1.4 5.4l3.9-3z"
        fill="#FBBC05"
      />
      <Path
        d="M12 4.7c1.7 0 3.3.6 4.5 1.8l3.3-3.3C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.6l3.9 3C6.3 6.8 8.9 4.7 12 4.7z"
        fill="#EA4335"
      />
    </Svg>
  );
}

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

    const idToken = googleResponse.params.id_token;
    const tokenPayload = idToken ? decodeJwtPayload(idToken) : null;
    console.log("Google token debug:", {
      hasIdToken: Boolean(idToken),
      hasAccessToken: Boolean(googleResponse.params.access_token),
      tokenParts: idToken ? idToken.split(".").length : 0,
      aud: tokenPayload?.aud,
      iss: tokenPayload?.iss,
      exp: tokenPayload?.exp,
    });

    if (!idToken) {
      Alert.alert("Google sign in failed", "Google did not return an ID token.");
      setTimeout(() => setIsGoogleSubmitting(false), 0);
      return;
    }

    loginWithGoogleToken(idToken);
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
    <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", default: undefined })} style={styles.screen}>
      <LoginBackground />
      <FocusedScreenTransition style={styles.container}>
        <Pressable aria-label="Dismiss keyboard" onPress={Keyboard.dismiss} style={styles.dismissSpacer} />

        <View style={styles.form}>
          <Pressable aria-label="Dismiss keyboard" onPress={Keyboard.dismiss}>
            <Image source={sfmLogo} style={styles.logo} resizeMode="contain" />
          </Pressable>
          <TextInput
            placeholder="Username"
            placeholderTextColor="#7b8494"
            autoCapitalize="none"
            selectionColor="#1f6feb"
            style={styles.input}
            value={username}
            onChangeText={setUsername}
          />
          <Pressable aria-label="Dismiss keyboard" onPress={Keyboard.dismiss} style={styles.inputDismissArea} />
          <TextInput
            placeholder="Password"
            placeholderTextColor="#7b8494"
            secureTextEntry
            selectionColor="#1f6feb"
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
          <View style={styles.secondaryActions}>
            <Pressable
              style={[styles.googleButton, (!googleRequest || isGoogleSubmitting) && styles.buttonDisabled]}
              onPress={handleGoogleLogin}
              disabled={!googleRequest || isGoogleSubmitting}
            >
              {isGoogleSubmitting ? (
                <ActivityIndicator color="#1f2328" />
              ) : (
                <View style={styles.googleButtonContent}>
                  <GoogleLogo />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </View>
              )}
            </Pressable>
            <Link href="/auth/register" asChild>
              <Pressable style={styles.signupButton}>
                <Text style={styles.signupButtonText}>Sign up</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        <Pressable aria-label="Dismiss keyboard" onPress={Keyboard.dismiss} style={styles.dismissSpacer} />
        <Pressable
          onPress={() => Alert.alert("Forgot password", "Password recovery is not available yet.")}
          style={styles.forgotPasswordButton}
        >
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </Pressable>
      </FocusedScreenTransition>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#000A54", flex: 1 },
  container: { flex: 1, padding: 24 },
  dismissSpacer: { flex: 1 },
  form: { gap: 14 },
  logo: { alignSelf: "center", height: 200, marginBottom: 28, marginTop: 10, width: "96%" },
  subtitle: { color: "rgba(255, 255, 255, 0.78)", marginBottom: 12, textAlign: "center" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d4d9e1", borderRadius: 10, color: "#111827", padding: 14 },
  inputDismissArea: { height: 14, marginVertical: -14 },
  button: { backgroundColor: "#1f6feb", borderRadius: 10, padding: 15, alignItems: "center" },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondaryActions: { flexDirection: "row", gap: 10 },
  googleButton: {
    flex: 1,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d4d9e1",
    borderRadius: 10,
    padding: 15,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  googleButtonContent: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" },
  googleButtonText: { color: "#1f2328", fontWeight: "700" },
  signupButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#1f6feb",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 92,
    paddingHorizontal: 14,
  },
  signupButtonText: { color: "#1f6feb", fontWeight: "700" },
  forgotPasswordButton: { alignItems: "center", paddingVertical: 6 },
  forgotPasswordText: { color: "rgba(255, 255, 255, 0.8)", fontWeight: "600" },
});
