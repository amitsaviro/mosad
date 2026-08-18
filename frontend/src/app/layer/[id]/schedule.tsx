import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { addRating, createActivity } from '@/api/activities';
import {
  createCalendarActivity,
  deleteCalendarActivity,
  listCalendarActivities,
  updateCalendarActivity,
} from '@/api/calendarActivities';
import { ApiError } from '@/api/client';
import { listHolidays } from '@/api/holidays';
import { createKeyDate, deleteKeyDate, listKeyDates } from '@/api/keyDates';
import { getLayer, listLayers } from '@/api/layers';
import { useAuth } from '@/auth/AuthContext';
import { ActivityDetailModal } from '@/components/activity-detail-modal';
import { Badge, SHARED_COLOR } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Checkbox } from '@/components/checkbox';
import { ConfirmButton } from '@/components/confirm-button';
import { IconButton } from '@/components/icon-button';
import { MonthCalendar } from '@/components/month-calendar';
import { SessionReportModal } from '@/components/session-report-modal';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ActivityType, CalendarActivity, DayOfWeek, Holiday, KeyDate, Layer } from '@/types';
import {
  addDaysUtc,
  buildItemsByDate,
  formatIsoDate,
  fromIsraeliDate,
  parseIsoDate,
  startOfWeekIso,
  toIsraeliDate,
  toIsraeliShortDate,
  todayIso,
} from '@/utils/calendar';

function toApiTime(text: string): string | null {
  const match = text.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const [, hours, minutes] = match;
  return `${hours.padStart(2, '0')}:${minutes}:00`;
}

function displayTime(apiTime: string): string {
  return apiTime.slice(0, 5);
}

function hasStartTime(entry: CalendarActivity): entry is CalendarActivity & { start_time: string } {
  return entry.start_time !== null;
}

// Groups entries that share the exact same start_time -- these were
// intentionally created together as one composite block (e.g. an
// opener followed by a main activity, both "at 16:00").
function groupByStartTime<T extends { start_time: string }>(entries: T[]): T[][] {
  const groups: T[][] = [];
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'institution_admin';
  const [layer, setLayer] = useState<Layer | null>(null);
  const [otherLayers, setOtherLayers] = useState<Layer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewActivityId, setViewActivityId] = useState<string | null>(null);
  const [sessionReportContext, setSessionReportContext] = useState<{
    activityName: string;
    date: string;
  } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Add-to-weekly-grid form -- "day" picks which weekday column of the
  // currently-viewed week (weekOffset) the new entry lands on.
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

  // Sharing an already-pinned activity with more layers after the fact
  // -- pins the same activity_id+date+start_time onto each newly
  // picked layer, alongside the existing one(s).
  const [shareTargetEntry, setShareTargetEntry] = useState<CalendarActivity | null>(null);
  const [shareTargetLayerIds, setShareTargetLayerIds] = useState<string[]>([]);
  const [isSharingTarget, setIsSharingTarget] = useState(false);

  // Sharing at weekly-grid add time (mirrors the "add to date" form's
  // own share picker below).
  const [weeklyShareLayerIds, setWeeklyShareLayerIds] = useState<string[]>([]);

  // Admin-only: institution-wide key dates (shown in every layer's
  // calendar automatically) -- managed from within a layer's schedule
  // rather than a separate cross-layer page.
  const [keyDateName, setKeyDateName] = useState('');
  const [keyDateText, setKeyDateText] = useState('');
  const [keyDateNote, setKeyDateNote] = useState('');
  const [isSavingKeyDate, setIsSavingKeyDate] = useState(false);

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, fetchedLayers, fetchedHolidays, fetchedKeyDates, fetchedCalActivities] =
        await Promise.all([
          getLayer(id),
          listLayers(),
          listHolidays(),
          listKeyDates(),
          listCalendarActivities(),
        ]);
      setLayer(fetchedLayer);
      setOtherLayers(fetchedLayers.filter((l) => l.can_manage && l.id !== id));
      setHolidays(fetchedHolidays);
      setKeyDates(fetchedKeyDates);
      setAllCalendarActivities(fetchedCalActivities);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הלוח נכשל');
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

  // Real calendar dates for the currently-viewed week -- the weekly
  // grid is just these dated entries grouped by weekday column, so
  // paging to a week with nothing pinned to it shows empty instead of
  // a recurring template repeating forever.
  const weekDates = useMemo(() => {
    const start = parseIsoDate(startOfWeekIso(weekOffset));
    const map = {} as Record<DayOfWeek, string>;
    DAYS_OF_WEEK.forEach((d, i) => {
      map[d] = formatIsoDate(addDaysUtc(start, i));
    });
    return map;
  }, [weekOffset]);

  const weeklyEntriesByDay: Record<DayOfWeek, (CalendarActivity & { start_time: string })[]> = {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };
  const timedEntries = myCalendarActivities.filter(hasStartTime);
  DAYS_OF_WEEK.forEach((d) => {
    weeklyEntriesByDay[d] = timedEntries
      .filter((a) => a.date === weekDates[d])
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  });

  function sharingSiblings(entry: CalendarActivity): CalendarActivity[] {
    return allCalendarActivities.filter(
      (a) => a.activity_id === entry.activity_id && a.date === entry.date && a.id !== entry.id
    );
  }

  function sharedLayerNames(entry: CalendarActivity): string[] {
    const siblings = sharingSiblings(entry);
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
    setWeeklyShareLayerIds([]);
  }

  function toggleWeeklyShareLayer(layerId: string) {
    setWeeklyShareLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((l) => l !== layerId) : [...prev, layerId]
    );
  }

  function handlePickFromRepository() {
    const apiTime = toApiTime(timeText);
    if (!apiTime) {
      setError('יש להזין שעה בפורמט תקין, למשל 16:00');
      return;
    }
    setError(null);
    const shareParam = weeklyShareLayerIds.length ? `&pickShareLayerIds=${weeklyShareLayerIds.join(',')}` : '';
    router.push(`/activities?pickForLayerId=${id}&pickCalendarDate=${weekDates[day]}&pickTime=${apiTime}${shareParam}`);
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
    const layerIds = [id, ...weeklyShareLayerIds];
    try {
      const created = await createActivity({
        name: newName.trim(),
        description: newDescription.trim(),
        activity_type: newType,
      });
      const failures: string[] = [];
      for (const layerId of layerIds) {
        try {
          await createCalendarActivity(layerId, {
            activity_id: created.id,
            date: weekDates[day],
            start_time: apiTime,
            duration_minutes: durationText.trim() ? Number(durationText.trim()) : undefined,
            notes: notes.trim() || undefined,
          });
        } catch {
          failures.push(layerId);
        }
      }
      resetForm();
      await loadData();
      if (failures.length > 0) {
        setError(`השיבוץ נכשל עבור ${failures.length} מהשכבות שנבחרו`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'השיבוץ נכשל');
    } finally {
      setIsSaving(false);
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

  function openSharePicker(entry: CalendarActivity) {
    setShareTargetEntry(entry);
    setShareTargetLayerIds([]);
  }

  function toggleShareTargetLayer(layerId: string) {
    setShareTargetLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((l) => l !== layerId) : [...prev, layerId]
    );
  }

  // Pins the SAME activity onto more layers, alongside an
  // already-existing entry -- turns a regular, single-layer activity
  // into a shared one after the fact, instead of only being able to
  // choose sharing at the moment it's first added.
  async function handleConfirmShare() {
    if (!shareTargetEntry || shareTargetLayerIds.length === 0) return;
    setError(null);
    setIsSharingTarget(true);
    const failures: string[] = [];
    for (const layerId of shareTargetLayerIds) {
      try {
        await createCalendarActivity(layerId, {
          activity_id: shareTargetEntry.activity_id,
          date: shareTargetEntry.date,
          start_time: shareTargetEntry.start_time ?? undefined,
          notes: shareTargetEntry.notes ?? undefined,
        });
      } catch {
        failures.push(layerId);
      }
    }
    setShareTargetEntry(null);
    setShareTargetLayerIds([]);
    setIsSharingTarget(false);
    await loadData();
    if (failures.length > 0) {
      setError(`השיתוף נכשל עבור ${failures.length} מהשכבות שנבחרו`);
    }
  }

  async function handleAddKeyDate() {
    const isoDate = fromIsraeliDate(keyDateText);
    if (!keyDateName.trim() || !isoDate) {
      setError('יש למלא שם ותאריך בפורמט תקין, למשל 14/12/2026');
      return;
    }
    setError(null);
    setIsSavingKeyDate(true);
    try {
      await createKeyDate(keyDateName.trim(), isoDate, keyDateNote.trim() || undefined);
      setKeyDateName('');
      setKeyDateText('');
      setKeyDateNote('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    } finally {
      setIsSavingKeyDate(false);
    }
  }

  async function handleDeleteKeyDate(keyDateId: string) {
    try {
      await deleteKeyDate(keyDateId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
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

  const selectedItems = selectedDate ? (itemsByDate[selectedDate] ?? []) : [];
  const selectedWeekdayLabel = selectedDate
    ? DAY_OF_WEEK_LABELS[DAYS_OF_WEEK[parseIsoDate(selectedDate).getUTCDay()]]
    : null;

  // Prefer popping back to wherever the user actually came from (so
  // repeated visits here don't keep pushing new "layer" entries onto
  // the stack and turn "back" into a loop) -- only push a fresh
  // navigation if there's nowhere to pop back to (e.g. a direct link).
  function handleBackToLayer() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push(`/layer/${id}`);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            הלוח{layer ? ` — ${layer.name}` : ''}
          </ThemedText>
          <View style={styles.headerActions}>
            <Button
              label="חזרה לשכבה"
              variant="ghost"
              size="small"
              fullWidth={false}
              onPress={handleBackToLayer}
            />
          </View>
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        <View style={styles.weekNavRow}>
          <ThemedText type="subtitle" style={styles.rtlText}>
            לוח שבועי · {toIsraeliShortDate(weekDates.sunday)}–{toIsraeliShortDate(weekDates.saturday)}
          </ThemedText>
          <View style={styles.weekNavButtons}>
            <Button
              label="→ שבוע קודם"
              variant="ghost"
              size="small"
              fullWidth={false}
              onPress={() => setWeekOffset((w) => w - 1)}
            />
            {weekOffset !== 0 && (
              <Button
                label="השבוע הנוכחי"
                variant="secondary"
                size="small"
                fullWidth={false}
                onPress={() => setWeekOffset(0)}
              />
            )}
            <Button
              label="שבוע הבא ←"
              variant="ghost"
              size="small"
              fullWidth={false}
              onPress={() => setWeekOffset((w) => w + 1)}
            />
          </View>
        </View>

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
                  label={`${DAY_OF_WEEK_LABELS[d]} ${toIsraeliShortDate(weekDates[d])}`}
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
                      variant={weeklyShareLayerIds.includes(l.id) ? 'primary' : 'ghost'}
                      onPress={() => toggleWeeklyShareLayer(l.id)}
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
              יום {DAY_OF_WEEK_LABELS[d]} {toIsraeliShortDate(weekDates[d])}
            </ThemedText>
            {weeklyEntriesByDay[d].length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                אין פעילויות משובצות
              </ThemedText>
            ) : (
              <View style={styles.list}>
                {groupByStartTime(weeklyEntriesByDay[d]).map((block) => (
                  <View
                    key={block[0].id}
                    style={[styles.blockCard, block.length > 1 && { borderColor: theme.border }]}
                  >
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {displayTime(block[0].start_time)}
                      {block.length > 1 ? ` — בלוק של ${block.length} פעילויות` : ''}
                    </ThemedText>
                    {block.map((entry) => {
                      const entryShared = sharedLayerNames(entry);
                      return (
                      <Card key={entry.id} style={styles.entryCard}>
                        <View style={styles.entryHeaderRow}>
                          <Badge label={ACTIVITY_TYPE_LABELS[entry.activity_type]} tone="primary" />
                          {entryShared.length > 0 && <Badge label="🔗 משותפת" tone="shared" />}
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
                                <Checkbox
                                  key={item}
                                  checked={checked}
                                  label={item}
                                  disabled={!entry.can_manage}
                                  onToggle={() => handleToggleCalendarEquipment(entry, item)}
                                />
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
                            <Button
                              label="📋 נוכחות והערות"
                              variant="secondary"
                              size="small"
                              fullWidth={false}
                              onPress={() =>
                                setSessionReportContext({ activityName: entry.activity_name, date: entry.date })
                              }
                            />
                          )}
                          {entry.can_manage && otherLayers.length > 0 && (
                            <Button
                              label="🔗 שתף עם שכבות נוספות"
                              variant="secondary"
                              size="small"
                              fullWidth={false}
                              onPress={() => openSharePicker(entry)}
                            />
                          )}
                          {entry.can_manage && (
                            <ConfirmButton
                              label="הסר מהלוח"
                              onConfirm={() => handleDeleteCalendarActivity(entry.id)}
                            />
                          )}
                        </View>
                      </Card>
                      );
                    })}
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
                      <View style={styles.dateRow}>
                        <ThemedText type="smallBold" style={styles.rtlText}>
                          📌 {k.name}
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
                const shared = sharedLayerNames(a);
                return (
                  <View key={`a-${a.id}`} style={styles.detailBlock}>
                    <View style={styles.dateRow}>
                      <Badge label={ACTIVITY_TYPE_LABELS[a.activity_type]} tone="primary" />
                      {shared.length > 0 && <Badge label="🔗 משותפת" tone="shared" />}
                      <ThemedText type="smallBold" style={styles.rtlText}>
                        {a.activity_name}
                        {a.start_time ? ` · ${displayTime(a.start_time)}` : ''}
                      </ThemedText>
                    </View>
                    {shared.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        🔗 משותפת עם: {shared.join(', ')}
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
                            <Checkbox
                              key={item}
                              checked={checked}
                              label={item}
                              disabled={!a.can_manage}
                              onToggle={() => handleToggleCalendarEquipment(a, item)}
                            />
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
                        <Button
                          label="📋 נוכחות והערות"
                          variant="secondary"
                          size="small"
                          fullWidth={false}
                          onPress={() =>
                            setSessionReportContext({ activityName: a.activity_name, date: a.date })
                          }
                        />
                      )}
                      {a.can_manage && otherLayers.length > 0 && (
                        <Button
                          label="🔗 שתף עם שכבות נוספות"
                          variant="secondary"
                          size="small"
                          fullWidth={false}
                          onPress={() => openSharePicker(a)}
                        />
                      )}
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

        {isAdmin && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הוספת תאריך מרכזי למוסד
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              משותף לכל המוסד ומופיע בלוח השנה של כל השכבות (למשל אסיפת הורים או יום גיבוש כללי).
            </ThemedText>
            <TextField label="שם (למשל: אסיפת הורים)" value={keyDateName} onChangeText={setKeyDateName} />
            <TextField
              label="תאריך (יום/חודש/שנה)"
              placeholder="14/12/2026"
              value={keyDateText}
              onChangeText={setKeyDateText}
            />
            <TextField label="הערה (אופציונלי)" value={keyDateNote} onChangeText={setKeyDateNote} />
            <Button label="הוסף" onPress={handleAddKeyDate} loading={isSavingKeyDate} />
          </Card>
        )}

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
            <ThemedText type="small" themeColor="textSecondary">
              חג
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
            <ThemedText type="small" themeColor="textSecondary">
              תאריך מרכזי
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.danger }]} />
            <ThemedText type="small" themeColor="textSecondary">
              פעילות שכבתית
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: SHARED_COLOR }]} />
            <ThemedText type="small" themeColor="textSecondary">
              פעילות משותפת
            </ThemedText>
          </View>
        </View>

        <MonthCalendar
          itemsByDate={itemsByDate}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          isItemShared={(item) => item.kind === 'activity' && sharedLayerNames(item.activity).length > 0}
        />
      </ScrollView>
      <ActivityDetailModal activityId={viewActivityId} onClose={() => setViewActivityId(null)} />
      <SessionReportModal
        layerId={sessionReportContext ? id : null}
        activityName={sessionReportContext?.activityName ?? ''}
        initialDate={sessionReportContext?.date ?? todayIso()}
        onClose={() => setSessionReportContext(null)}
      />
      <Modal visible={!!shareTargetEntry} transparent animationType="fade" onRequestClose={() => setShareTargetEntry(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShareTargetEntry(null)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.headerRow}>
              <IconButton glyph="✕" accessibilityLabel="סגור" onPress={() => setShareTargetEntry(null)} />
              <ThemedText type="subtitle" style={styles.rtlText} numberOfLines={2}>
                שיתוף — {shareTargetEntry?.activity_name}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              בחרו שכבות נוספות שיקבלו את אותה הפעילות לאותו תאריך{shareTargetEntry?.start_time ? ' ושעה' : ''}.
            </ThemedText>
            <View style={styles.chipRow}>
              {shareTargetEntry &&
                otherLayers
                  .filter((l) => !sharingSiblings(shareTargetEntry).some((s) => s.layer_id === l.id))
                  .map((l) => (
                    <Button
                      key={l.id}
                      label={l.name}
                      size="small"
                      fullWidth={false}
                      variant={shareTargetLayerIds.includes(l.id) ? 'primary' : 'ghost'}
                      onPress={() => toggleShareTargetLayer(l.id)}
                    />
                  ))}
            </View>
            <Button
              label="שתף"
              onPress={handleConfirmShare}
              loading={isSharingTarget}
              disabled={shareTargetLayerIds.length === 0}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
  weekNavRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  weekNavButtons: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
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
  legendRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.one,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
