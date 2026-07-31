import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await register(email.trim(), password, fullName.trim());
      // Redirect handled by _layout.tsx once `user` becomes non-null.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההרשמה נכשלה');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.rtlText}>
        הרשמה
      </ThemedText>

      <TextInput style={styles.input} placeholder="שם מלא" value={fullName} onChangeText={setFullName} />
      <TextInput
        style={styles.input}
        placeholder="אימייל"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="סיסמה (לפחות 8 תווים)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && (
        <ThemedText style={[styles.error, styles.rtlText]}>{error}</ThemedText>
      )}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>הרשמה</ThemedText>
        )}
      </Pressable>

      <Link href="/login" style={styles.link}>
        <ThemedText type="link" style={styles.rtlText}>
          כבר יש לך חשבון? התחברות
        </ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: Spacing.three,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  button: {
    backgroundColor: '#3c87f7',
    borderRadius: 8,
    padding: Spacing.three,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#d33',
  },
  link: {
    alignSelf: 'center',
    marginTop: Spacing.two,
  },
});
