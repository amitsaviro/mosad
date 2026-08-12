import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  getParticipantAttendanceSummary,
  listAttendanceForDate,
  markAttendance,
} from '@/api/attendance';
import { ApiError } from '@/api/client';
import { getLayer } from '@/api/layers';
import { listParticipants } from '@/api/participants';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { Layer, Participant, ParticipantAttendanceSummary } from '@/types';
import { addDaysUtc, fromIsraeliDate, parseIsoDate, toIsraeliDate, todayIso } from '@/utils/calendar';

export default function LayerAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ParticipantAttendanceSummary>>({});
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [dateText, setDateText] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);

  const activeParticipants = useMemo(() => participants.filter((p) => p.is_active), [participants]);

  async function loadRoster() {
    setError(null);
    try {
      const [fetchedLayer, fetchedParticipants] = await Promise.all([getLayer(id), listParticipants(id)]);
      setLayer(fetchedLayer);
      setParticipants(fetchedParticipants);

      const active = fetchedParticipants.filter((p) => p.is_active);
      const summaryEntries = await Promise.all(
        active.map(async (p) => [p.id, await getParticipantAttendanceSummary(p.id)] as const)
      );
      setSummaries(Object.fromEntries(summaryEntries));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת השכבה נכשלה');
    }
  }

  async function loadMarksForDate(date: string, participantList: Participant[]) {
    try {
      const existing = await listAttendanceForDate(id, date);
      const existingByParticipant = new Map(existing.map((r) => [r.participant_id, r.present]));
      const nextMarks: Record<string, boolean> = {};
      for (const p of participantList.filter((p) => p.is_active)) {
        nextMarks[p.id] = existingByParticipant.get(p.id) ?? true;
      }
      setMarks(nextMarks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הנוכחות נכשלה');
    }
  }

  useEffect(() => {
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (participants.length === 0) return;
    setSavedMessage(null);
    loadMarksForDate(selectedDate, participants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, participants.length]);

  function goPrevDay() {
    setSelectedDate((d) => {
      const iso = parseIsoDate(d);
      return addDaysUtc(iso, -1).toISOString().slice(0, 10);
    });
  }

  function goNextDay() {
    setSelectedDate((d) => {
      const iso = parseIsoDate(d);
      return addDaysUtc(iso, 1).toISOString().slice(0, 10);
    });
  }

  function goToday() {
    setSelectedDate(todayIso());
  }

  function jumpToTypedDate() {
    const iso = fromIsraeliDate(dateText);
    if (!iso) {
      setDateError('יש להזין תאריך בפורמט תקין, למשל 14/12/2026');
      return;
    }
    setDateError(null);
    setDateText('');
    setSelectedDate(iso);
  }

  async function handleSave() {
    setError(null);
    setSavedMessage(null);
    setIsSaving(true);
    try {
      await markAttendance(
        id,
        selectedDate,
        activeParticipants.map((p) => ({ participant_id: p.id, present: marks[p.id] ?? true }))
      );
      setSavedMessage('הנוכחות נשמרה בהצלחה');
      const summaryEntries = await Promise.all(
        activeParticipants.map(async (p) => [p.id, await getParticipantAttendanceSummary(p.id)] as const)
      );
      setSummaries(Object.fromEntries(summaryEntries));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שמירת הנוכחות נכשלה');
    } finally {
      setIsSaving(false);
    }
  }

  const weekdayLabel = DAY_OF_WEEK_LABELS[DAYS_OF_WEEK[parseIsoDate(selectedDate).getUTCDay()]];

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            נוכחות{layer ? ` — ${layer.name}` : ''}
          </ThemedText>
          <Button
            label="חזרה לשכבה"
            variant="ghost"
            size="small"
            fullWidth={false}
            onPress={() => router.push(`/layer/${id}`)}
          />
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
          כולם מסומנים כ"נכח" כברירת מחדל — פשוט מסמנים מי נעדר ושומרים.
        </ThemedText>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}
        {savedMessage && <ThemedText themeColor="success" style={styles.rtlText}>{savedMessage}</ThemedText>}

        <Card style={styles.dateCard}>
          <View style={styles.datePagerRow}>
            <Button label="→ יום קודם" variant="ghost" size="small" fullWidth={false} onPress={goPrevDay} />
            <View style={styles.dateLabelBlock}>
              <ThemedText type="subtitle" style={styles.rtlText}>
                {toIsraeliDate(selectedDate)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                יום {weekdayLabel}
              </ThemedText>
            </View>
            <Button label="יום הבא ←" variant="ghost" size="small" fullWidth={false} onPress={goNextDay} />
          </View>
          <View style={styles.jumpRow}>
            <Button label="היום" variant="secondary" size="small" fullWidth={false} onPress={goToday} />
            <View style={styles.jumpField}>
              <TextField
                label="קפיצה לתאריך אחר (יום/חודש/שנה)"
                placeholder="14/12/2026"
                value={dateText}
                onChangeText={setDateText}
              />
            </View>
            <Button label="עבור" variant="secondary" size="small" fullWidth={false} onPress={jumpToTypedDate} />
          </View>
          {dateError && <ThemedText themeColor="danger" style={styles.rtlText}>{dateError}</ThemedText>}
        </Card>

        {activeParticipants.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            אין חניכים פעילים בשכבה הזו.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {activeParticipants.map((p) => {
              const isPresent = marks[p.id] ?? true;
              const summary = summaries[p.id];
              return (
                <Card key={p.id} style={styles.participantRow}>
                  <View style={styles.participantInfo}>
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {p.full_name}
                    </ThemedText>
                    {summary && summary.rate !== null && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        {summary.rate}% נוכחות ({summary.present_count}/{summary.total_sessions})
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.toggleRow}>
                    <Button
                      label="✓ נכח"
                      size="small"
                      fullWidth={false}
                      variant={isPresent ? 'primary' : 'ghost'}
                      onPress={() => setMarks((prev) => ({ ...prev, [p.id]: true }))}
                    />
                    <Button
                      label="✗ נעדר"
                      size="small"
                      fullWidth={false}
                      variant={!isPresent ? 'danger' : 'ghost'}
                      onPress={() => setMarks((prev) => ({ ...prev, [p.id]: false }))}
                    />
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {activeParticipants.length > 0 && (
          <Button label="שמור נוכחות" onPress={handleSave} loading={isSaving} />
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
    maxWidth: 640,
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
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dateCard: {
    gap: Spacing.two,
  },
  datePagerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateLabelBlock: {
    alignItems: 'center',
  },
  jumpRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  jumpField: {
    flex: 1,
    gap: Spacing.one,
  },
  list: {
    gap: Spacing.two,
  },
  participantRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  participantInfo: {
    gap: 2,
  },
  toggleRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
  },
});
