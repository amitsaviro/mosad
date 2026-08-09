import { Link, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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

// Short weekday header, Sunday-first to match this app's RTL week
// convention everywhere else (DAYS_OF_WEEK).
const WEEKDAY_SHORT_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

type YearItem =
  | { kind: 'holiday'; holiday: Holiday }
  | { kind: 'keyDate'; keyDate: KeyDate }
  | { kind: 'activity'; activity: CalendarActivity };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// All date math below works in UTC-epoch terms (not the browser's local
// timezone) so that iterating "the next day" of an ISO date string never
// drifts across a DST boundary or a UTC offset -- an "YYYY-MM-DD" string
// has no timezone of its own, so pretending it's UTC and staying in UTC
// the whole way through is the only way to keep it stable.
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function buildItemsByDate(
  holidays: Holiday[],
  keyDates: KeyDate[],
  calendarActivities: CalendarActivity[]
): Record<string, YearItem[]> {
  const map: Record<string, YearItem[]> = {};
  function push(iso: string, item: YearItem) {
    (map[iso] ??= []).push(item);
  }
  for (const h of holidays) {
    let cur = parseIsoDate(h.start_date);
    const end = parseIsoDate(h.end_date);
    while (cur.getTime() <= end.getTime()) {
      push(formatIsoDate(cur), { kind: 'holiday', holiday: h });
      cur = addDaysUtc(cur, 1);
    }
  }
  for (const k of keyDates) push(k.date, { kind: 'keyDate', keyDate: k });
  for (const a of calendarActivities) push(a.date, { kind: 'activity', activity: a });
  return map;
}

function isValidIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text.trim());
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export default function YearOverviewScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();
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

  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso());

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

  const itemsByDate = useMemo(
    () => buildItemsByDate(holidays, keyDates, calendarActivities),
    [holidays, keyDates, calendarActivities]
  );

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

  const now = new Date();
  const months: { year: number; month0: number }[] = [];
  for (let y = now.getFullYear(); y <= now.getFullYear() + 1; y++) {
    for (let m = 0; m < 12; m++) months.push({ year: y, month0: m });
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
          חגים ומועדים ישראליים מחושבים אוטומטית מהלוח העברי — אין צורך לעדכן אותם. בנוסף אפשר להוסיף
          תאריכים מרכזיים משלכם ולשבץ פעילויות אמיתיות מהמאגר לתאריך קבוע עבור שכבה מסוימת. לחצו על יום
          בלוח כדי לראות מה קורה בו.
        </ThemedText>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        <Card style={styles.card}>
          <ThemedText type="subtitle" style={styles.rtlText}>
            {selectedDate ?? 'לא נבחר יום'}
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
                    h.start_date === h.end_date ? h.start_date : `${h.start_date} – ${h.end_date}`;
                  return (
                    <View key={`h-${index}`} style={styles.detailRow}>
                      <Badge label="חג" tone="primary" />
                      <ThemedText type="smallBold" style={styles.rtlText}>
                        {h.name} ({rangeLabel})
                      </ThemedText>
                    </View>
                  );
                }

                if (item.kind === 'keyDate') {
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
                }

                const a = item.activity;
                const alreadyRated = ratedEntryIds.includes(a.id);
                return (
                  <View key={`a-${a.id}`} style={styles.detailBlock}>
                    <View style={styles.dateRow}>
                      <Badge label={ACTIVITY_TYPE_LABELS[a.activity_type]} tone="primary" />
                      <ThemedText type="smallBold" style={styles.rtlText}>
                        {a.activity_name}
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
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: theme.danger }]} />
            <ThemedText type="small" themeColor="textSecondary">
              פעילות משובצת
            </ThemedText>
          </View>
        </View>

        {months.map(({ year, month0 }) => {
          const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
          const firstWeekday = new Date(Date.UTC(year, month0, 1)).getUTCDay();
          const cells: (number | null)[] = [
            ...Array(firstWeekday).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];

          return (
            <View key={`${year}-${month0}`} style={styles.monthBlock}>
              <ThemedText type="subtitle" style={styles.rtlText}>
                {MONTH_LABELS[month0]} {year}
              </ThemedText>
              <View style={styles.weekdayRow}>
                {WEEKDAY_SHORT_LABELS.map((label, i) => (
                  <View key={i} style={styles.dayCellWrap}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                      {label}
                    </ThemedText>
                  </View>
                ))}
              </View>
              <View style={styles.gridRow}>
                {cells.map((day, idx) => {
                  if (day === null) {
                    return <View key={`empty-${idx}`} style={styles.dayCellWrap} />;
                  }
                  const iso = `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
                  const dayItems = itemsByDate[iso] ?? [];
                  const isSelected = selectedDate === iso;
                  const isToday = iso === todayIso();
                  return (
                    <View key={iso} style={styles.dayCellWrap}>
                      <Pressable
                        onPress={() => setSelectedDate(iso)}
                        style={[
                          styles.dayCell,
                          { borderColor: theme.border },
                          isToday && { borderColor: theme.primary },
                          isSelected && { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <ThemedText type="small" style={styles.centerText}>
                          {day}
                        </ThemedText>
                        {dayItems.length > 0 && (
                          <View style={styles.dotRow}>
                            {dayItems.slice(0, 3).map((it, i) => (
                              <View
                                key={i}
                                style={[
                                  styles.dot,
                                  {
                                    backgroundColor:
                                      it.kind === 'holiday'
                                        ? theme.primary
                                        : it.kind === 'keyDate'
                                          ? theme.success
                                          : theme.danger,
                                  },
                                ]}
                              />
                            ))}
                          </View>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
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
  centerText: {
    textAlign: 'center',
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
  detailRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
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
  activityActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  ratingBox: {
    gap: Spacing.one,
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
  monthBlock: {
    gap: Spacing.two,
  },
  weekdayRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
  },
  gridRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
  },
  dayCellWrap: {
    width: '14.2857%',
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayCell: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 56,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
