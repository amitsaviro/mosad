import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      // No manual navigation needed here — _layout.tsx watches `user`
      // and redirects away from /login as soon as it's set.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההתחברות נכשלה');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText type="title" style={styles.rtlText}>
          התחברות
        </ThemedText>

        <Card style={styles.card}>
          <TextField
            label="אימייל"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="אימייל"
          />
          <TextField
            label="סיסמה"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="סיסמה"
          />

          {error && (
            <ThemedText themeColor="danger" style={styles.rtlText}>
              {error}
            </ThemedText>
          )}

          <Button label="התחבר" onPress={handleSubmit} loading={isSubmitting} />
        </Card>

        <Link href="/register" style={styles.link}>
          <ThemedText type="linkPrimary">אין לך חשבון? הרשמה</ThemedText>
        </Link>
      </ScrollView>
    </ThemedView>
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
