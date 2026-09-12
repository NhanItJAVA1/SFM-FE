import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { authApi } from '@/api/authApi';
import { setApiAccessToken } from '@/api/axiosClient';
import { setAuthUser } from '@/stores/authSession';

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister() {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    try {
      setIsSubmitting(true);
      await authApi.register({ username: trimmedUsername, email: trimmedEmail, password });
      const response = await authApi.login({ username: trimmedUsername, password });
      setApiAccessToken(response.data.accessToken);
      setAuthUser(response.data.user);
      router.replace('/(tabs)/home');
    } catch (error) {
      Alert.alert('Register failed', error instanceof Error ? error.message : 'Unable to connect to the server.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>Set up your SFM account.</Text>
      <TextInput
        placeholder="Username"
        autoCapitalize="none"
        style={styles.input}
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
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
        onPress={handleRegister}
        disabled={isSubmitting}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register</Text>}
      </Pressable>
      <Link href="/auth/login" style={styles.link}>Already have an account?</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { color: '#68707d', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#d4d9e1', borderRadius: 10, padding: 14 },
  button: { backgroundColor: '#1f6feb', borderRadius: 10, padding: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { color: '#1f6feb', textAlign: 'center', marginTop: 8 },
});
