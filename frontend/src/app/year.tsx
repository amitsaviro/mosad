import { Link, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { listHolidays } from '@/api/holidays';
import { createKeyDate, deleteKeyDate, listKeyDates } from '@/api/keyDates';
import { listLayers } from '@/api/layers';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { MonthCalendar } from '@/components/month-calendar';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Holiday, KeyDate, Layer } from '@/types';
import { buildItemsByDate, fromIsraeliDate, parseIsoDate, toIsraeliDate, todayIso } from '@/utils/calendar';

export default function YearOverviewScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [keyDates, setKeyDates] = useState<KeyDate[]>([]);
  const [myLayers, setMyLayers] = useState<Layer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [dateText, setDateText] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso());

  const isAdmin = user?.role === 'institution_admin';

  async function loadData() {
    setError(null);
    try {
      const [fetchedHolidays, fetchedKeyDates, fetchedLayers] = await Promise.all([
        listHolidays(),
        listKeyDates(),
        listLayers(),
      ]);
      setHolidays(fetchedHolidays);
      setKeyDates(fetchedKeyDates);
      setMyLayers(fetchedLayers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת לוח השנה נכשלה');
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const itemsByDate = useMemo(() => buildItemsByDate(holidays, keyDates, []), [holidays, keyDates]);

  async function handleAddKeyDate() {
    const isoDate = fromIsraeliDate(dateText);
    if (!name.trim() || !isoDate) {
      setError('יש למלא שם ותאריך בפורמט תקין, למשל 14/12/2026');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await createKeyDate(name.trim(), isoDate, note.trim() || undefined);
      setName('');
      setDateText('');
      setNote('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteKeyDate(id: string) {
    try {
      await deleteKeyDate(id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  const selectedItems = selectedDate ? (itemsByDate[selectedDate] ?? []) : [];
  const selectedWeekdayLabel = selectedDate
    ? DAY_OF_WEEK_LABELS[DAYS_OF_WEEK[parseIsoDate(selectedDate).getUTCDay()]]
    : null;

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
          חגים ומועדים ישראליים מחושבים אוטומטית מהלוח העברי — אין צורך לעדכן אותם. תאריכים מרכזיים
          משותפים לכל המוסד (למשל אסיפת הורים או יום גיבוש כללי). כדי לשבץ פעילות מהמאגר לתאריך קבוע
          עבור שכבה מסוימת, היכנסו ללוח השנה של אותה שכבה.
        </ThemedText>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {myLayers.length > 0 && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              לוחות שנה לפי שכבה
            </ThemedText>
            <View style={styles.chipRow}>
              {myLayers.map((l) => (
                <Button
                  key={l.id}
                  label={l.name}
                  size="small"
                  fullWidth={false}
                  variant="ghost"
                  onPress={() => router.push(`/layer/${l.id}/calendar`)}
                />
              ))}
            </View>
          </Card>
        )}

        <Card style={styles.card}>
          <ThemedText type="subtitle" style={styles.rtlText}>
            {selectedDate ? toIsraeliDate(selectedDate) : 'לא נבחר יום'}
            {selectedWeekdayLabel ? ` — יום ${selectedWeekdayLabel}` : ''}
          </ThemedText>
          {selectedItems.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              אין כלום ביום הזה.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {selectedItems.map((item, index) => {
                if (item.kind === 'holiday') {
                  const h = item.holiday;
                  const rangeLabel =
                    h.start_date === h.end_date
                      ? toIsraeliDate(h.start_date)
                      : `${toIsraeliDate(h.start_date)} – ${toIsraeliDate(h.end_date)}`;
                  return (
                    <ThemedText key={`h-${index}`} type="smallBold" style={styles.rtlText}>
                      🕎 {h.name} ({rangeLabel})
                    </ThemedText>
                  );
                }
                if (item.kind !== 'keyDate') return null;
                const k = item.keyDate;
                return (
                  <View key={`k-${k.id}`} style={styles.detailBlock}>
                    <View style={styles.dateRow}>
                      <ThemedText type="smallBold" style={styles.rtlText}>
                        {k.name}
                      </ThemedText>
                      {isAdmin && <ConfirmButton label="הסר" onConfirm={() => handleDeleteKeyDate(k.id)} />}
                    </View>
                    {k.note && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        {k.note}
                      </ThemedText>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {isAdmin && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הוספת תאריך מרכזי
            </ThemedText>
            <TextField label="שם (למשל: אסיפת הורים)" value={name} onChangeText={setName} />
            <TextField
              label="תאריך (יום/חודש/שנה)"
              placeholder="14/12/2026"
              value={dateText}
              onChangeText={setDateText}
            />
            <TextField label="הערה (אופציונלי)" value={note} onChangeText={setNote} />
            <Button label="הוסף" onPress={handleAddKeyDate} loading={isSaving} />
          </Card>
        )}

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: theme.primary }]} />
            <ThemedText type="small" themeColor="textSecondary">
              חג
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
            <ThemedText type="small" themeColor="textSecondary">
              תאריך מרכזי
            </ThemedText>
          </View>
        </View>

        <MonthCalendar itemsByDate={itemsByDate} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
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
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
  detailBlock: {
    gap: Spacing.one,
  },
  dateRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  legendRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.four,
  },
  legendItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
