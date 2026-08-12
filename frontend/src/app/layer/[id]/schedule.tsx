import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { addRating, createActivity } from '@/api/activities';
import {
  createCalendarActivity,
  deleteCalendarActivity,
  listCalendarActivities,
  updateCalendarActivity,
} from '@/api/calendarActivities';
import { ApiError } from '@/api/client';
import { listHolidays } from '@/api/holidays';
import { listKeyDates } from '@/api/keyDates';
import { getLayer, listLayers } from '@/api/layers';
import {
  createScheduleEntry,
  deleteScheduleEntry,
  listSchedule,
  updateScheduleEntry,
} from '@/api/schedule';
import { ActivityDetailModal } from '@/components/activity-detail-modal';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { MonthCalendar } from '@/components/month-calendar';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ActivityType, CalendarActivity, DayOfWeek, Holiday, KeyDate, Layer, ScheduledActivity } from '@/types';
import { buildItemsByDate, parseIsoDate, toIsraeliDate, todayIso } from '@/utils/calendar';

function toApiTime(text: string): string | null {
  const match = text.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const [, hours, minutes] = match;
  return `${hours.padStart(2, '0')}:${minutes}:00`;
}

function displayTime(apiTime: string): string {
  return apiTime.slice(0, 5);
}

// Groups entries that share the exact same start_time -- these were
// intentionally created together as one composite block (e.g. an
// opener followed by a main activity, both "at 16:00").
function groupByStartTime(entries: ScheduledActivity[]): ScheduledActivity[][] {
  const groups: ScheduledActivity[][] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last[0].start_time === entry.start_time) {
      last.push(entry);
    } else {
      groups.push([entry]);
    }
  }
  return groups;
}

export default function LayerScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [entries, setEntries] = useState<ScheduledActivity[]>([]);
  const [otherLayers, setOtherLayers] = useState<Layer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewActivityId, setViewActivityId] = useState<string | null>(null);

  // Weekly recurring schedule form.
  const [day, setDay] = useState<DayOfWeek>('sunday');
  const [timeText, setTimeText] = useState('');
  const [durationText, setDurationText] = useState('');
  const [notes, setNotes] = useState('');
  const [activitySource, setActivitySource] = useState<'repository' | 'new'>('repository');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<ActivityType>('main');
  const [isSaving, setIsSaving] = useState(false);

  // Dated year-calendar.
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [keyDates, setKeyDates] = useState<KeyDate[]>([]);
  const [allCalendarActivities, setAllCalendarActivities] = useState<CalendarActivity[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso());
  const [ratingByEntry, setRatingByEntry] = useState<Record<string, number>>({});
  const [ratedEntryIds, setRatedEntryIds] = useState<string[]>([]);

  // Add-to-selected-date form.
  const [calSource, setCalSource] = useState<'repository' | 'new'>('repository');
  const [calShareLayerIds, setCalShareLayerIds] = useState<string[]>([]);
  const [calNewName, setCalNewName] = useState('');
  const [calNewDescription, setCalNewDescription] = useState('');
  const [calNewType, setCalNewType] = useState<ActivityType>('main');
  const [calIsSaving, setCalIsSaving] = useState(false);

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, fetchedEntries, fetchedLayers, fetchedHolidays, fetchedKeyDates, fetchedCalActivities] =
        await Promise.all([
          getLayer(id),
          listSchedule(id),
          listLayers(),
          listHolidays(),
          listKeyDates(),
          listCalendarActivities(),
        ]);
      setLayer(fetchedLayer);
      setEntries(fetchedEntries);
      setOtherLayers(fetchedLayers.filter((l) => l.can_manage && l.id !== id));
      setHolidays(fetchedHolidays);
      setKeyDates(fetchedKeyDates);
      setAllCalendarActivities(fetchedCalActivities);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הלוח נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const myCalendarActivities = useMemo(
    () => allCalendarActivities.filter((a) => a.layer_id === id),
    [allCalendarActivities, id]
  );
  const itemsByDate = useMemo(
    () => buildItemsByDate(holidays, keyDates, myCalendarActivities),
    [holidays, keyDates, myCalendarActivities]
  );

  function sharedLayerNames(entry: CalendarActivity): string[] {
    const siblings = allCalendarActivities.filter(
      (a) => a.activity_id === entry.activity_id && a.date === entry.date && a.id !== entry.id
    );
    if (siblings.length === 0) return [];
    return [entry.layer_name, ...siblings.map((s) => s.layer_name)];
  }

  function resetForm() {
    setTimeText('');
    setDurationText('');
    setNotes('');
    setNewName('');
    setNewDescription('');
    setActivitySource('repository');
  }

  function handlePickFromRepository() {
    const apiTime = toApiTime(timeText);
    if (!apiTime) {
      setError('יש להזין שעה בפורמט תקין, למשל 16:00');
      return;
    }
    setError(null);
    router.push(`/activities?pickForLayerId=${id}&pickDay=${day}&pickTime=${apiTime}`);
  }

  async function handleCreateAndSchedule() {
    const apiTime = toApiTime(timeText);
    if (!apiTime) {
      setError('יש להזין שעה בפורמט תקין, למשל 16:00');
      return;
    }
    if (!newName.trim() || !newDescription.trim()) {
      setError('שם ותיאור הם שדות חובה לפעילות חדשה');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const created = await createActivity({
        name: newName.trim(),
        description: newDescription.trim(),
        activity_type: newType,
      });
      await createScheduleEntry(id, {
        activity_id: created.id,
        day_of_week: day,
        start_time: apiTime,
        duration_minutes: durationText.trim() ? Number(durationText.trim()) : undefined,
        notes: notes.trim() || undefined,
      });
      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'השיבוץ נכשל');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    try {
      await deleteScheduleEntry(entryId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  async function handleToggleEquipment(entry: ScheduledActivity, item: string) {
    const checked = entry.equipment_checked.includes(item);
    const nextChecked = checked
      ? entry.equipment_checked.filter((i) => i !== item)
      : [...entry.equipment_checked, item];
    try {
      await updateScheduleEntry(entry.id, { equipment_checked: nextChecked });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
    }
  }

  function toggleCalShareLayer(layerId: string) {
    setCalShareLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((l) => l !== layerId) : [...prev, layerId]
    );
  }

  function resetCalForm() {
    setCalSource('repository');
    setCalShareLayerIds([]);
    setCalNewName('');
    setCalNewDescription('');
  }

  function handlePickFromRepositoryForDate() {
    if (!selectedDate) return;
    setError(null);
    const shareParam = calShareLayerIds.length ? `&pickShareLayerIds=${calShareLayerIds.join(',')}` : '';
    router.push(`/activities?pickForLayerId=${id}&pickCalendarDate=${selectedDate}${shareParam}`);
  }

  async function handleCreateAndPinToDate() {
    if (!selectedDate) return;
    if (!calNewName.trim() || !calNewDescription.trim()) {
      setError('שם ותיאור הם שדות חובה לפעילות חדשה');
      return;
    }
    setError(null);
    setCalIsSaving(true);
    const layerIds = [id, ...calShareLayerIds];
    try {
      const created = await createActivity({
        name: calNewName.trim(),
        description: calNewDescription.trim(),
        activity_type: calNewType,
      });
      const failures: string[] = [];
      for (const layerId of layerIds) {
        try {
          await createCalendarActivity(layerId, { activity_id: created.id, date: selectedDate });
        } catch {
          failures.push(layerId);
        }
      }
      resetCalForm();
      await loadData();
      if (failures.length > 0) {
        setError(`השיבוץ נכשל עבור ${failures.length} מהשכבות שנבחרו`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'יצירת הפעילות נכשלה');
    } finally {
      setCalIsSaving(false);
    }
  }

  async function handleDeleteCalendarActivity(entryId: string) {
    try {
      await deleteCalendarActivity(entryId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההסרה נכשלה');
    }
  }

  async function handleToggleCalendarEquipment(entry: CalendarActivity, item: string) {
    const checked = entry.equipment_checked.includes(item);
    const nextChecked = checked
      ? entry.equipment_checked.filter((i) => i !== item)
      : [...entry.equipment_checked, item];
    try {
      await updateCalendarActivity(entry.id, { equipment_checked: nextChecked });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
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

  const entriesByDay: Record<DayOfWeek, ScheduledActivity[]> = {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };
  entries.forEach((e) => entriesByDay[e.day_of_week].push(e));

  const selectedItems = selectedDate ? (itemsByDate[selectedDate] ?? []) : [];
  const selectedWeekdayLabel = selectedDate
    ? DAY_OF_WEEK_LABELS[DAYS_OF_WEEK[parseIsoDate(selectedDate).getUTCDay()]]
    : null;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            הלוח{layer ? ` — ${layer.name}` : ''}
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

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        <ThemedText type="subtitle" style={styles.rtlText}>
          לוח שבועי
        </ThemedText>

        {layer?.can_manage && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הוספה ללוח השבועי
            </ThemedText>

            <ThemedText type="smallBold" style={styles.rtlText}>
              יום
            </ThemedText>
            <View style={styles.chipRow}>
              {DAYS_OF_WEEK.map((d) => (
                <Button
                  key={d}
                  label={DAY_OF_WEEK_LABELS[d]}
                  size="small"
                  fullWidth={false}
                  variant={day === d ? 'primary' : 'ghost'}
                  onPress={() => setDay(d)}
                />
              ))}
            </View>

            <TextField
              label="שעה (למשל 16:00) — אותה שעה לכמה פעילויות יוצרת בלוק אחד, למשל פתיחה + מרכזית"
              placeholder="16:00"
              value={timeText}
              onChangeText={setTimeText}
            />

            <ThemedText type="smallBold" style={styles.rtlText}>
              פעילות
            </ThemedText>
            <View style={styles.chipRow}>
              <Button
                label="מהמאגר"
                size="small"
                fullWidth={false}
                variant={activitySource === 'repository' ? 'primary' : 'ghost'}
                onPress={() => setActivitySource('repository')}
              />
              <Button
                label="פעילות חדשה"
                size="small"
                fullWidth={false}
                variant={activitySource === 'new' ? 'primary' : 'ghost'}
                onPress={() => setActivitySource('new')}
              />
            </View>

            {activitySource === 'repository' ? (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  קובעים יום ושעה למעלה, ואז עוברים למאגר לבחור פעילות — היא תתווסף אוטומטית ליום
                  ולשעה שנבחרו
                </ThemedText>
                <Button label="בחר מהמאגר ←" onPress={handlePickFromRepository} variant="secondary" />
              </>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  הפעילות תישמר גם במאגר הארצי, כדי שגם מדריכים אחרים יוכלו להשתמש בה
                </ThemedText>
                <TextField label="שם הפעילות" value={newName} onChangeText={setNewName} />
                <TextField
                  label="תיאור"
                  value={newDescription}
                  onChangeText={setNewDescription}
                  multiline
                  style={styles.multiline}
                />
                <View style={styles.chipRow}>
                  {ACTIVITY_TYPES.map((t) => (
                    <Button
                      key={t}
                      label={ACTIVITY_TYPE_LABELS[t]}
                      size="small"
                      fullWidth={false}
                      variant={newType === t ? 'primary' : 'ghost'}
                      onPress={() => setNewType(t)}
                    />
                  ))}
                </View>
                <TextField
                  label="משך בדקות (אופציונלי)"
                  value={durationText}
                  onChangeText={setDurationText}
                  keyboardType="numeric"
                />
                <TextField label="הערות (אופציונלי)" value={notes} onChangeText={setNotes} />
                <Button label="הוסף ללוח" onPress={handleCreateAndSchedule} loading={isSaving} />
              </>
            )}
          </Card>
        )}

        {DAYS_OF_WEEK.map((d) => (
          <View key={d} style={styles.dayBlock}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              יום {DAY_OF_WEEK_LABELS[d]}
            </ThemedText>
            {entriesByDay[d].length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                אין פעילויות משובצות
              </ThemedText>
            ) : (
              <View style={styles.list}>
                {groupByStartTime(entriesByDay[d]).map((block) => (
                  <View
                    key={block[0].id}
                    style={[styles.blockCard, block.length > 1 && { borderColor: theme.border }]}
                  >
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {displayTime(block[0].start_time)}
                      {block.length > 1 ? ` — בלוק של ${block.length} פעילויות` : ''}
                    </ThemedText>
                    {block.map((entry) => (
                      <Card key={entry.id} style={styles.entryCard}>
                        <View style={styles.entryHeaderRow}>
                          <Badge label={ACTIVITY_TYPE_LABELS[entry.activity_type]} tone="primary" />
                          <ThemedText type="smallBold" style={styles.rtlText}>
                            {entry.activity_name}
                          </ThemedText>
                        </View>
                        {entry.duration_minutes != null && (
                          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                            {entry.duration_minutes} דקות
                          </ThemedText>
                        )}
                        {entry.notes && (
                          <ThemedText type="small" style={styles.rtlText}>
                            {entry.notes}
                          </ThemedText>
                        )}
                        {entry.equipment.length > 0 && (
                          <View style={styles.list}>
                            <ThemedText type="smallBold" style={styles.rtlText}>
                              ציוד
                            </ThemedText>
                            {entry.equipment.map((item) => {
                              const checked = entry.equipment_checked.includes(item);
                              return (
                                <ThemedText
                                  key={item}
                                  type="small"
                                  style={styles.rtlText}
                                  onPress={
                                    entry.can_manage ? () => handleToggleEquipment(entry, item) : undefined
                                  }
                                >
                                  {checked ? '☑' : '☐'} {item}
                                </ThemedText>
                              );
                            })}
                          </View>
                        )}
                        <View style={styles.entryActionsRow}>
                          <Button
                            label="👁 פרטים מלאים"
                            variant="secondary"
                            size="small"
                            fullWidth={false}
                            onPress={() => setViewActivityId(entry.activity_id)}
                          />
                          {entry.can_manage && (
                            <ConfirmButton label="הסר מהלוח" onConfirm={() => handleDelete(entry.id)} />
                          )}
                        </View>
                      </Card>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <ThemedText type="subtitle" style={styles.rtlText}>
          לוח שנה
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
          חגים ותאריכים מרכזיים משותפים לכל המוסד מוצגים כאן גם כן, לצד הפעילויות שהשכבה הזו שיבצה
          לתאריך קבוע. לחצו על יום כדי לראות מה יש בו ולהוסיף אליו פעילות.
        </ThemedText>

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
                const shared = sharedLayerNames(a);
                return (
                  <View key={`a-${a.id}`} style={styles.detailBlock}>
                    <View style={styles.dateRow}>
                      <Badge label={ACTIVITY_TYPE_LABELS[a.activity_type]} tone="primary" />
                      <ThemedText type="smallBold" style={styles.rtlText}>
                        {a.activity_name}
                      </ThemedText>
                    </View>
                    {shared.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        🔗 פעילות משותפת: {shared.join(', ')}
                      </ThemedText>
                    )}
                    {a.notes && (
                      <ThemedText type="small" style={styles.rtlText}>
                        {a.notes}
                      </ThemedText>
                    )}
                    {a.equipment.length > 0 && (
                      <View style={styles.list}>
                        <ThemedText type="smallBold" style={styles.rtlText}>
                          ציוד
                        </ThemedText>
                        {a.equipment.map((item) => {
                          const checked = a.equipment_checked.includes(item);
                          return (
                            <ThemedText
                              key={item}
                              type="small"
                              style={styles.rtlText}
                              onPress={a.can_manage ? () => handleToggleCalendarEquipment(a, item) : undefined}
                            >
                              {checked ? '☑' : '☐'} {item}
                            </ThemedText>
                          );
                        })}
                      </View>
                    )}
                    <View style={styles.activityActionsRow}>
                      <Button
                        label="👁 פרטים מלאים"
                        variant="secondary"
                        size="small"
                        fullWidth={false}
                        onPress={() => setViewActivityId(a.activity_id)}
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

          {layer?.can_manage && selectedDate && (
            <View style={[styles.addToDateBox, { borderTopColor: theme.border }]}>
              <ThemedText type="subtitle" style={styles.rtlText}>
                הוספת פעילות ליום {toIsraeliDate(selectedDate)}
              </ThemedText>

              {otherLayers.length > 0 && (
                <>
                  <ThemedText type="smallBold" style={styles.rtlText}>
                    גם עבור שכבות נוספות (משותפת)
                  </ThemedText>
                  <View style={styles.chipRow}>
                    {otherLayers.map((l) => (
                      <Button
                        key={l.id}
                        label={l.name}
                        size="small"
                        fullWidth={false}
                        variant={calShareLayerIds.includes(l.id) ? 'primary' : 'ghost'}
                        onPress={() => toggleCalShareLayer(l.id)}
                      />
                    ))}
                  </View>
                </>
              )}

              <ThemedText type="smallBold" style={styles.rtlText}>
                פעילות
              </ThemedText>
              <View style={styles.chipRow}>
                <Button
                  label="מהמאגר"
                  size="small"
                  fullWidth={false}
                  variant={calSource === 'repository' ? 'primary' : 'ghost'}
                  onPress={() => setCalSource('repository')}
                />
                <Button
                  label="פעילות חדשה"
                  size="small"
                  fullWidth={false}
                  variant={calSource === 'new' ? 'primary' : 'ghost'}
                  onPress={() => setCalSource('new')}
                />
              </View>

              {calSource === 'repository' ? (
                <Button label="בחר מהמאגר ←" onPress={handlePickFromRepositoryForDate} variant="secondary" />
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                    הפעילות תישמר גם במאגר הארצי, כדי שגם מדריכים אחרים יוכלו להשתמש בה
                  </ThemedText>
                  <TextField label="שם הפעילות" value={calNewName} onChangeText={setCalNewName} />
                  <TextField
                    label="תיאור"
                    value={calNewDescription}
                    onChangeText={setCalNewDescription}
                    multiline
                    style={styles.multiline}
                  />
                  <View style={styles.chipRow}>
                    {ACTIVITY_TYPES.map((t) => (
                      <Button
                        key={t}
                        label={ACTIVITY_TYPE_LABELS[t]}
                        size="small"
                        fullWidth={false}
                        variant={calNewType === t ? 'primary' : 'ghost'}
                        onPress={() => setCalNewType(t)}
                      />
                    ))}
                  </View>
                  <Button label="הוסף ליום" onPress={handleCreateAndPinToDate} loading={calIsSaving} />
                </>
              )}
            </View>
          )}
        </Card>

        <MonthCalendar itemsByDate={itemsByDate} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      </ScrollView>
      <ActivityDetailModal activityId={viewActivityId} onClose={() => setViewActivityId(null)} />
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
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
  dayBlock: {
    gap: Spacing.two,
  },
  blockCard: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  entryCard: {
    gap: Spacing.one,
  },
  entryHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  entryActionsRow: {
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
  addToDateBox: {
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
