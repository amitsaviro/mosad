import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ApiError } from '@/api/client';
import { deleteSelf, updateSelf } from '@/api/users';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const { user, refreshUser, logout } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = user?.role === 'institution_admin';

  async function handleSave() {
    setError(null);
    setMessage(null);
    setIsSaving(true);
    try {
      const changes: { full_name?: string; email?: string } = {};
      if (fullName.trim() && fullName.trim() !== user?.full_name) changes.full_name = fullName.trim();
      if (email.trim() && email.trim() !== user?.email) changes.email = email.trim();
      if (Object.keys(changes).length > 0) {
        await updateSelf(changes);
        await refreshUser();
        setMessage('הפרטים עודכנו בהצלחה');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAccount() {
    setError(null);
    try {
      await deleteSelf();
      await logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'מחיקת החשבון נכשלה');
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type="title" style={styles.rtlText}>
          הגדרות חשבון
        </ThemedText>

        <Card style={styles.card}>
          <TextField label="שם מלא" value={fullName} onChangeText={setFullName} />
          <TextField
            label="אימייל"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}
          {message && <ThemedText themeColor="success" style={styles.rtlText}>{message}</ThemedText>}
          <Button label="שמור שינויים" onPress={handleSave} loading={isSaving} />
        </Card>

        <Card style={styles.card}>
          <ThemedText type="subtitle" style={styles.rtlText}>
            מחיקת חשבון
          </ThemedText>
          {isAdmin ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              כמנהל מוסד לא ניתן למחוק את החשבון כרגע (אין עדיין אפשרות להעביר בעלות על המוסד).
            </ThemedText>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                פעולה זו תמחק את החשבון שלך לצמיתות ואינה ניתנת לביטול.
              </ThemedText>
              <ConfirmButton label="מחק את החשבון שלי" onConfirm={handleDeleteAccount} />
            </>
          )}
        </Card>

        <Button label="חזרה" onPress={() => router.back()} variant="ghost" />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: 480,
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
});
