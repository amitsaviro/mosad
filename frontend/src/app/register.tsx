import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterScreen() {
  const { register } = useAuth();
  const theme = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;

  async function handleSubmit() {
    if (!isPasswordValid) return;
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
          {password.length > 0 && (
            <View style={styles.passwordHintRow}>
              <ThemedText style={{ color: isPasswordValid ? theme.success : theme.danger }}>
                {isPasswordValid ? '✓' : '✗'}
              </ThemedText>
              <ThemedText
                type="small"
                style={[styles.rtlText, { color: isPasswordValid ? theme.success : theme.danger }]}
              >
                {isPasswordValid ? 'הסיסמה עומדת בדרישת האורך' : `נדרשים לפחות ${MIN_PASSWORD_LENGTH} תווים`}
              </ThemedText>
            </View>
          )}

          {error && (
            <ThemedText themeColor="danger" style={styles.rtlText}>
              {error}
            </ThemedText>
          )}

          <Button
            label="הרשמה"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={password.length > 0 && !isPasswordValid}
          />
        </Card>

        <Link href="/login" style={styles.link}>
          <ThemedText type="linkPrimary">כבר יש לך חשבון? התחברות</ThemedText>
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
  passwordHintRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: -Spacing.two,
  },
  link: {
    alignSelf: 'center',
  },
});
