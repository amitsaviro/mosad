import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { addRating } from '@/api/activities';
import { deleteCalendarActivity, listCalendarActivities } from '@/api/calendarActivities';
import { ApiError } from '@/api/client';
import { listHolidays } from '@/api/holidays';
import { createKeyDate, deleteKeyDate, listKeyDates } from '@/api/keyDates';
import { listLayers } from '@/api/layers';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { Spacing } from '@/constants/theme';
import { CalendarActivity, Holiday, KeyDate, Layer } from '@/types';

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

type YearItem =
  | { kind: 'holiday'; sortDate: string; holiday: Holiday }
  | { kind: 'keyDate'; sortDate: string; keyDate: KeyDate }
  | { kind: 'activity'; sortDate: string; activity: CalendarActivity };

function monthLabelOf(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
}

function groupByMonth(items: YearItem[]): { month: string; items: YearItem[] }[] {
  const sorted = [...items].sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  const groups = new Map<string, YearItem[]>();
  for (const item of sorted) {
    const label = monthLabelOf(item.sortDate);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return Array.from(groups.entries()).map(([month, groupItems]) => ({ month, items: groupItems }));
}

function isValidIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text.trim());
}

export default function YearOverviewScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [keyDates, setKeyDates] = useState<KeyDate[]>([]);
  const [calendarActivities, setCalendarActivities] = useState<CalendarActivity[]>([]);
  const [myLayers, setMyLayers] = useState<Layer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [calLayerId, setCalLayerId] = useState<string | null>(null);
  const [calDateText, setCalDateText] = useState('');
  const [calError, setCalError] = useState<string | null>(null);

  const [ratingByEntry, setRatingByEntry] = useState<Record<string, number>>({});
  const [ratedEntryIds, setRatedEntryIds] = useState<string[]>([]);

  const isAdmin = user?.role === 'institution_admin';

  async function loadData() {
    setError(null);
    try {
      const [fetchedHolidays, fetchedKeyDates, fetchedActivities, fetchedLayers] = await Promise.all([
        listHolidays(),
        listKeyDates(),
        listCalendarActivities(),
        listLayers(),
      ]);
      setHolidays(fetchedHolidays);
      setKeyDates(fetchedKeyDates);
      setCalendarActivities(fetchedActivities);
      setMyLayers(fetchedLayers.filter((l) => l.can_manage));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת לוח השנה נכשלה');
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAddKeyDate() {
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

  async function handleDeleteKeyDate(id: string) {
    try {
      await deleteKeyDate(id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  async function handleDeleteCalendarActivity(id: string) {
    try {
      await deleteCalendarActivity(id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההסרה נכשלה');
    }
  }

  function handlePickFromRepository() {
    if (!calLayerId) {
      setCalError('יש לבחור שכבה');
      return;
    }
    if (!isValidIsoDate(calDateText)) {
      setCalError('יש להזין תאריך בפורמט תקין, למשל 2026-09-05');
      return;
    }
    setCalError(null);
    router.push(`/activities?pickForLayerId=${calLayerId}&pickCalendarDate=${calDateText.trim()}`);
  }

  async function handleSubmitRating(entry: CalendarActivity) {
    const rating = ratingByEntry[entry.id];
    if (!rating) {
      setError('יש לבחור דירוג בכוכבים');
      return;
    }
    try {
      await addRating(entry.activity_id, entry.layer_id, rating);
      setRatedEntryIds((prev) => [...prev, entry.id]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הדירוג נכשל');
    }
  }

  const items: YearItem[] = [
    ...holidays.map((h): YearItem => ({ kind: 'holiday', sortDate: h.start_date, holiday: h })),
    ...keyDates.map((k): YearItem => ({ kind: 'keyDate', sortDate: k.date, keyDate: k })),
    ...calendarActivities.map((a): YearItem => ({ kind: 'activity', sortDate: a.date, activity: a })),
  ];
  const groups = groupByMonth(items);

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
          חגים ומועדים ישראליים מחושבים אוטומטית מהלוח העברי — אין צורך לעדכן אותם. בנוסף אפשר להוסיף
          תאריכים מרכזיים משלכם ולשבץ פעילויות אמיתיות מהמאגר לתאריך קבוע עבור שכבה מסוימת.
        </ThemedText>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {isAdmin && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הוספת תאריך מרכזי
            </ThemedText>
            <TextField label="שם (למשל: אסיפת הורים)" value={name} onChangeText={setName} />
            <TextField label="תאריך (YYYY-MM-DD)" placeholder="2026-12-14" value={date} onChangeText={setDate} />
            <TextField label="הערה (אופציונלי)" value={note} onChangeText={setNote} />
            <Button label="הוסף" onPress={handleAddKeyDate} loading={isSaving} />
          </Card>
        )}

        {myLayers.length > 0 && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              שיבוץ פעילות מהמאגר לתאריך
            </ThemedText>
            <ThemedText type="smallBold" style={styles.rtlText}>
              לאיזו שכבה?
            </ThemedText>
            <View style={styles.chipRow}>
              {myLayers.map((l) => (
                <Button
                  key={l.id}
                  label={l.name}
                  size="small"
                  fullWidth={false}
                  variant={calLayerId === l.id ? 'primary' : 'ghost'}
                  onPress={() => setCalLayerId(l.id)}
                />
              ))}
            </View>
            <TextField
              label="תאריך (YYYY-MM-DD)"
              placeholder="2026-09-05"
              value={calDateText}
              onChangeText={setCalDateText}
            />
            {calError && <ThemedText themeColor="danger" style={styles.rtlText}>{calError}</ThemedText>}
            <Button label="בחר מהמאגר ←" onPress={handlePickFromRepository} variant="secondary" />
          </Card>
        )}

        {groups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            אין עדיין תאריכים או פעילויות בלוח השנה.
          </ThemedText>
        ) : (
          groups.map((group) => (
            <View key={group.month} style={styles.monthBlock}>
              <ThemedText type="subtitle" style={styles.rtlText}>
                {group.month}
              </ThemedText>
              <View style={styles.list}>
                {group.items.map((item) => {
                  if (item.kind === 'holiday') {
                    const h = item.holiday;
                    const dateLabel = h.start_date === h.end_date ? h.start_date : `${h.start_date} – ${h.end_date}`;
                    return (
                      <Card key={`holiday-${h.name}-${h.start_date}`} style={styles.dateCard}>
                        <View style={styles.dateRow}>
                          <Badge label="חג" tone="primary" />
                          <ThemedText type="smallBold" style={styles.rtlText}>
                            {dateLabel} — {h.name}
                          </ThemedText>
                        </View>
                      </Card>
                    );
                  }

                  if (item.kind === 'keyDate') {
                    const k = item.keyDate;
                    return (
                      <Card key={`key-${k.id}`} style={styles.dateCard}>
                        <View style={styles.dateRow}>
                          <ThemedText type="smallBold" style={styles.rtlText}>
                            {k.date} — {k.name}
                          </ThemedText>
                          {isAdmin && <ConfirmButton label="הסר" onConfirm={() => handleDeleteKeyDate(k.id)} />}
                        </View>
                        {k.note && (
                          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                            {k.note}
                          </ThemedText>
                        )}
                      </Card>
                    );
                  }

                  const a = item.activity;
                  const alreadyRated = ratedEntryIds.includes(a.id);
                  return (
                    <Card key={`activity-${a.id}`} style={styles.dateCard}>
                      <View style={styles.dateRow}>
                        <Badge label={ACTIVITY_TYPE_LABELS[a.activity_type]} tone="primary" />
                        <ThemedText type="smallBold" style={styles.rtlText}>
                          {a.date} — {a.activity_name}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        שכבה: {a.layer_name}
                      </ThemedText>
                      {a.notes && (
                        <ThemedText type="small" style={styles.rtlText}>
                          {a.notes}
                        </ThemedText>
                      )}
                      <View style={styles.activityActionsRow}>
                        <Button
                          label="פרטים מלאים ←"
                          variant="secondary"
                          size="small"
                          fullWidth={false}
                          onPress={() => router.push(`/activities/${a.activity_id}`)}
                        />
                        {a.can_manage && (
                          <ConfirmButton label="הסר" onConfirm={() => handleDeleteCalendarActivity(a.id)} />
                        )}
                      </View>

                      {!a.is_past && (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                          מתוכנן — ניתן לדרג לאחר שהתאריך יעבור
                        </ThemedText>
                      )}

                      {a.is_past && a.can_manage && !alreadyRated && (
                        <View style={styles.ratingBox}>
                          <ThemedText type="smallBold" style={styles.rtlText}>
                            איך זה עבר? דרגו בכוכבים
                          </ThemedText>
                          <View style={styles.chipRow}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Button
                                key={n}
                                label={`${n} ⭐`}
                                size="small"
                                fullWidth={false}
                                variant={ratingByEntry[a.id] === n ? 'primary' : 'ghost'}
                                onPress={() => setRatingByEntry((prev) => ({ ...prev, [a.id]: n }))}
                              />
                            ))}
                          </View>
                          <Button label="שלח דירוג" size="small" onPress={() => handleSubmitRating(a)} />
                        </View>
                      )}

                      {a.is_past && alreadyRated && (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                          דורג, תודה!
                        </ThemedText>
                      )}
                    </Card>
                  );
                })}
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
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
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
  activityActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  ratingBox: {
    gap: Spacing.one,
  },
});
