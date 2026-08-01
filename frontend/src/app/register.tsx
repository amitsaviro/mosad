import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      <ThemedView style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText type="title" style={styles.rtlText}>
            הרשמה
          </ThemedText>

          <Card style={styles.card}>
            <TextField label="שם מלא" placeholder="ישראל ישראלי" value={fullName} onChangeText={setFullName} />
            <TextField
              label="אימייל"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label="סיסמה"
              placeholder="לפחות 8 תווים"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {error && (
              <ThemedText themeColor="danger" style={styles.rtlText}>
                {error}
              </ThemedText>
            )}

            <Button label="הרשמה" onPress={handleSubmit} loading={isSubmitting} />
          </Card>

          <Link href="/login" style={styles.link}>
            <ThemedText type="linkPrimary">כבר יש לך חשבון? התחברות</ThemedText>
          </Link>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    gap: Spacing.three,
  },
  link: {
    alignSelf: 'center',
  },
});
