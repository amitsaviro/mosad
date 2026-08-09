import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { addRating } from '@/api/activities';
import { deleteCalendarActivity, listCalendarActivities } from '@/api/calendarActivities';
import { ApiError } from '@/api/client';
import { listHolidays } from '@/api/holidays';
import { listKeyDates } from '@/api/keyDates';
import { getLayer } from '@/api/layers';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { MonthCalendar } from '@/components/month-calendar';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { CalendarActivity, Holiday, KeyDate, Layer } from '@/types';
import {
  buildItemsByDate,
  fromIsraeliDate,
  parseIsoDate,
  toIsraeliDate,
  todayIso,
} from '@/utils/calendar';

export default function LayerCalendarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [keyDates, setKeyDates] = useState<KeyDate[]>([]);
  const [calendarActivities, setCalendarActivities] = useState<CalendarActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [dateText, setDateText] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);

  const [ratingByEntry, setRatingByEntry] = useState<Record<string, number>>({});
  const [ratedEntryIds, setRatedEntryIds] = useState<string[]>([]);

  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso());

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, fetchedHolidays, fetchedKeyDates, fetchedActivities] = await Promise.all([
        getLayer(id),
        listHolidays(),
        listKeyDates(),
        listCalendarActivities(),
      ]);
      setLayer(fetchedLayer);
      setHolidays(fetchedHolidays);
      setKeyDates(fetchedKeyDates);
      setCalendarActivities(fetchedActivities.filter((a) => a.layer_id === id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת לוח השנה נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const itemsByDate = useMemo(
    () => buildItemsByDate(holidays, keyDates, calendarActivities),
    [holidays, keyDates, calendarActivities]
  );

  function handlePickFromRepository() {
    const isoDate = fromIsraeliDate(dateText);
    if (!isoDate) {
      setDateError('יש להזין תאריך בפורמט תקין, למשל 05/09/2026');
      return;
    }
    setDateError(null);
    router.push(`/activities?pickForLayerId=${id}&pickCalendarDate=${isoDate}`);
  }

  async function handleDeleteCalendarActivity(entryId: string) {
    try {
      await deleteCalendarActivity(entryId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההסרה נכשלה');
    }
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

  const selectedItems = selectedDate ? (itemsByDate[selectedDate] ?? []) : [];
  const selectedWeekdayLabel = selectedDate
    ? DAY_OF_WEEK_LABELS[DAYS_OF_WEEK[parseIsoDate(selectedDate).getUTCDay()]]
    : null;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            לוח שנה{layer ? ` — ${layer.name}` : ''}
          </ThemedText>
          <View style={styles.headerActions}>
            <Link href="/year">
              <ThemedText type="linkPrimary">תצוגת שנה כללית ←</ThemedText>
            </Link>
            <Button
              label="חזרה לשכבה"
              variant="ghost"
              size="small"
              fullWidth={false}
              onPress={() => router.push(`/layer/${id}`)}
            />
          </View>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
          חגים ומועדים ומרכזיים משותפים לכל המוסד מוצגים כאן גם כן, לצד הפעילויות שהשכבה הזו שיבצה
          לתאריך קבוע.
        </ThemedText>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

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

                if (item.kind === 'keyDate') {
                  const k = item.keyDate;
                  return (
                    <View key={`k-${k.id}`} style={styles.detailBlock}>
                      <ThemedText type="smallBold" style={styles.rtlText}>
                        📌 {k.name}
                      </ThemedText>
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

        {layer?.can_manage && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              שיבוץ פעילות מהמאגר לתאריך
            </ThemedText>
            <TextField
              label="תאריך (יום/חודש/שנה)"
              placeholder="05/09/2026"
              value={dateText}
              onChangeText={setDateText}
            />
            {dateError && <ThemedText themeColor="danger" style={styles.rtlText}>{dateError}</ThemedText>}
            <Button label="בחר מהמאגר ←" onPress={handlePickFromRepository} variant="secondary" />
          </Card>
        )}

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
