import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createActivity } from '@/api/activities';
import { ApiError } from '@/api/client';
import { getLayer } from '@/api/layers';
import {
  createScheduleEntry,
  deleteScheduleEntry,
  listSchedule,
  updateScheduleEntry,
} from '@/api/schedule';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ActivityType, DayOfWeek, Layer, ScheduledActivity } from '@/types';

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
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState<DayOfWeek>('sunday');
  const [timeText, setTimeText] = useState('');
  const [durationText, setDurationText] = useState('');
  const [notes, setNotes] = useState('');
  const [activitySource, setActivitySource] = useState<'repository' | 'new'>('repository');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<ActivityType>('main');
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, fetchedEntries] = await Promise.all([getLayer(id), listSchedule(id)]);
      setLayer(fetchedLayer);
      setEntries(fetchedEntries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הלוח נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            לוח שבועי{layer ? ` — ${layer.name}` : ''}
          </ThemedText>
          <View style={styles.headerActions}>
            <Link href="/year">
              <ThemedText type="linkPrimary">תצוגת שנה ←</ThemedText>
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

        {layer?.can_manage && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הוספה ללוח
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
                        {entry.can_manage && (
                          <ConfirmButton label="הסר מהלוח" onConfirm={() => handleDelete(entry.id)} />
                        )}
                      </Card>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
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
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  field: {
    flex: 1,
  },
  selectedActivityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
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
});
