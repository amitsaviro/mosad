import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { createKeyDate, deleteKeyDate, listKeyDates } from '@/api/keyDates';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { KeyDate } from '@/types';

const MONTH_LABELS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

function groupByMonth(dates: KeyDate[]): { month: string; items: KeyDate[] }[] {
  const groups = new Map<string, KeyDate[]>();
  for (const d of dates) {
    const [year, month] = d.date.split('-');
    const label = `${MONTH_LABELS[Number(month) - 1]} ${year}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(d);
  }
  return Array.from(groups.entries()).map(([month, items]) => ({ month, items }));
}

export default function YearOverviewScreen() {
  const { user } = useAuth();
  const [keyDates, setKeyDates] = useState<KeyDate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = user?.role === 'institution_admin';

  async function loadData() {
    setError(null);
    try {
      setKeyDates(await listKeyDates());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת התאריכים נכשלה');
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAdd() {
    if (!name.trim() || !date.trim()) {
      setError('יש למלא שם ותאריך');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await createKeyDate(name.trim(), date.trim(), note.trim() || undefined);
      setName('');
      setDate('');
      setNote('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteKeyDate(id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  const groups = groupByMonth(keyDates);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            תצוגת שנה
          </ThemedText>
          <View style={styles.headerActions}>
            <Link href="/">
              <ThemedText type="linkPrimary">← לדף הבית</ThemedText>
            </Link>
          </View>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
          תאריכים מרכזיים (חגים, טיולים, אירועים) המשותפים לכל השכבות במוסד. הלוח השבועי של כל שכבה
          חוזר על עצמו כל שבוע — התאריכים כאן עוזרים לתכנן מסביב לחריגים כמו חגים.
        </ThemedText>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {isAdmin && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הוספת תאריך
            </ThemedText>
            <TextField label="שם (למשל: חנוכה)" value={name} onChangeText={setName} />
            <TextField label="תאריך (YYYY-MM-DD)" placeholder="2026-12-14" value={date} onChangeText={setDate} />
            <TextField label="הערה (אופציונלי)" value={note} onChangeText={setNote} />
            <Button label="הוסף" onPress={handleAdd} loading={isSaving} />
          </Card>
        )}

        {groups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            אין עדיין תאריכים מרכזיים במוסד.
          </ThemedText>
        ) : (
          groups.map((group) => (
            <View key={group.month} style={styles.monthBlock}>
              <ThemedText type="subtitle" style={styles.rtlText}>
                {group.month}
              </ThemedText>
              <View style={styles.list}>
                {group.items.map((item) => (
                  <Card key={item.id} style={styles.dateCard}>
                    <View style={styles.dateRow}>
                      <ThemedText type="smallBold" style={styles.rtlText}>
                        {item.date} — {item.name}
                      </ThemedText>
                      {isAdmin && <ConfirmButton label="הסר" onConfirm={() => handleDelete(item.id)} />}
                    </View>
                    {item.note && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        {item.note}
                      </ThemedText>
                    )}
                  </Card>
                ))}
              </View>
            </View>
          ))
        )}
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
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    gap: Spacing.two,
  },
  monthBlock: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  dateCard: {
    gap: Spacing.one,
  },
  dateRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
