// AI scheduling agent: set the layer's recurring weekly meeting days
// and a free-text description of the group's "character", then let
// the agent (LangGraph + Claude on the backend, with a ratings-based
// heuristic fallback) propose a draft schedule to review before
// anything actually lands on the real calendar.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createCalendarActivity } from '@/api/calendarActivities';
import { ApiError } from '@/api/client';
import { generateAiSchedule, getLayer, getScheduleProfile, setScheduleProfile } from '@/api/layers';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Checkbox } from '@/components/checkbox';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { AiScheduleSuggestion, DayOfWeek, Layer } from '@/types';
import { addDaysUtc, formatIsoDate, fromIsraeliDate, todayIso, toIsraeliDate } from '@/utils/calendar';

export default function AiScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [meetingDays, setMeetingDays] = useState<DayOfWeek[]>([]);
  const [groupCharacter, setGroupCharacter] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSavedMessage, setProfileSavedMessage] = useState<string | null>(null);

  const [startDateText, setStartDateText] = useState('');
  const [endDateText, setEndDateText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<AiScheduleSuggestion[]>([]);
  const [skippedHolidays, setSkippedHolidays] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [attemptsUsed, setAttemptsUsed] = useState(1);
  const [validationNotes, setValidationNotes] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  // Activities the counselor explicitly unchecked in a previous draft
  // this session -- carried into the next "generate" call so
  // regenerating doesn't just propose the same rejected activity again.
  const [rejectedActivityIds, setRejectedActivityIds] = useState<Set<string>>(new Set());

  function suggestionKey(s: AiScheduleSuggestion): string {
    return `${s.date}__${s.activity_type}`;
  }

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, profile] = await Promise.all([getLayer(id), getScheduleProfile(id)]);
      setLayer(fetchedLayer);
      setMeetingDays(profile.meeting_days);
      setGroupCharacter(profile.group_character ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הנתונים נכשלה');
    }
  }

  useEffect(() => {
    const today = todayIso();
    setStartDateText(toIsraeliDate(today));
    setEndDateText(toIsraeliDate(formatIsoDate(addDaysUtc(new Date(today), 28))));
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggleMeetingDay(day: DayOfWeek) {
    setMeetingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    setProfileSavedMessage(null);
  }

  function handleGroupCharacterChange(text: string) {
    setGroupCharacter(text);
    setProfileSavedMessage(null);
  }

  async function handleSaveProfile() {
    setError(null);
    setProfileSavedMessage(null);
    setIsSavingProfile(true);
    try {
      await setScheduleProfile(id, meetingDays, groupCharacter.trim() || null);
      setProfileSavedMessage('✓ הפרופיל נשמר');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שמירת הפרופיל נכשלה');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleGenerate() {
    const startIso = fromIsraeliDate(startDateText);
    const endIso = fromIsraeliDate(endDateText);
    if (!startIso || !endIso) {
      setError('תאריכים לא תקינים, למשל 14/12/2026');
      return;
    }
    if (meetingDays.length === 0) {
      setError('יש להגדיר ולשמור לפחות יום מפגש אחד קודם');
      return;
    }
    setError(null);
    setCommitMessage(null);
    setIsGenerating(true);
    // Whatever's still in the current draft but was left unchecked
    // counts as an implicit rejection -- fold it in before asking for
    // a fresh draft, so regenerating doesn't just re-propose it.
    const newlyRejected = suggestions.filter((s) => !selectedKeys.has(suggestionKey(s))).map((s) => s.activity_id);
    const nextRejected = new Set([...rejectedActivityIds, ...newlyRejected]);
    setRejectedActivityIds(nextRejected);
    try {
      const response = await generateAiSchedule(id, startIso, endIso, Array.from(nextRejected));
      setSuggestions(response.suggestions);
      setSkippedHolidays(response.skipped_holiday_dates);
      setWarning(response.warning);
      setAttemptsUsed(response.attempts_used);
      setValidationNotes(response.validation_notes);
      setSelectedKeys(new Set(response.suggestions.map(suggestionKey)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'בניית ההצעה נכשלה');
    } finally {
      setIsGenerating(false);
    }
  }

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleCommit() {
    const chosen = suggestions.filter((s) => selectedKeys.has(suggestionKey(s)));
    if (chosen.length === 0) return;
    setError(null);
    setCommitMessage(null);
    setIsCommitting(true);
    let succeeded = 0;
    for (const s of chosen) {
      try {
        await createCalendarActivity(id, { activity_id: s.activity_id, date: s.date });
        succeeded += 1;
      } catch {
        // Keep going -- report the partial result below rather than
        // losing everything else that DID get added.
      }
    }
    setSuggestions((prev) => prev.filter((s) => !selectedKeys.has(suggestionKey(s))));
    setSelectedKeys(new Set());
    setIsCommitting(false);
    setCommitMessage(
      succeeded === chosen.length
        ? `${succeeded} פעילויות נוספו ללוח 🎉`
        : `${succeeded} מתוך ${chosen.length} פעילויות נוספו ללוח`
    );
  }

  const skippedLabel = useMemo(
    () => skippedHolidays.map((d) => toIsraeliDate(d)).join(', '),
    [skippedHolidays]
  );

  // Suggestions arrive already sorted by (date, slot order) from the
  // backend -- grouping consecutive same-date entries turns a flat
  // list of up to 3-per-date items into one card per meeting date.
  const suggestionsByDate = useMemo(() => {
    const groups: { date: string; dayOfWeek: AiScheduleSuggestion['day_of_week']; items: AiScheduleSuggestion[] }[] =
      [];
    for (const s of suggestions) {
      const last = groups[groups.length - 1];
      if (last && last.date === s.date) {
        last.items.push(s);
      } else {
        groups.push({ date: s.date, dayOfWeek: s.day_of_week, items: [s] });
      }
    }
    return groups;
  }, [suggestions]);

  function handleClearRejected() {
    setRejectedActivityIds(new Set());
  }

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
            🤖 לו״ז חכם{layer ? ` — ${layer.name}` : ''}
          </ThemedText>
          <Button label="חזרה לשכבה" variant="ghost" size="small" fullWidth={false} onPress={handleBackToLayer} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
          מגדירים פעם אחת מתי השכבה נפגשת ומה האופי שלה, ואז סוכן ה-AI מציע לו״ז טיוטה על סמך הדירוגים והחגים —
          ואתם בוחרים מה באמת נכנס ללוח.
        </ThemedText>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        <Card style={styles.card}>
          <ThemedText type="subtitle" style={styles.rtlText}>
            פרופיל תזמון
          </ThemedText>
          <ThemedText type="smallBold" style={styles.rtlText}>
            ימי מפגש קבועים
          </ThemedText>
          <View style={styles.chipRow}>
            {DAYS_OF_WEEK.map((d) => (
              <Button
                key={d}
                label={DAY_OF_WEEK_LABELS[d]}
                size="small"
                fullWidth={false}
                variant={meetingDays.includes(d) ? 'primary' : 'ghost'}
                onPress={() => toggleMeetingDay(d)}
              />
            ))}
          </View>
          <TextField
            label='אופי הקבוצה (אופציונלי) — למשל: "שכבה תוססת ואוהבת תחרויות"'
            value={groupCharacter}
            onChangeText={handleGroupCharacterChange}
            multiline
            style={styles.multiline}
          />
          <Button label="שמור פרופיל" onPress={handleSaveProfile} loading={isSavingProfile} variant="secondary" />
          {profileSavedMessage && (
            <ThemedText type="small" themeColor="primary" style={styles.rtlText}>
              {profileSavedMessage}
            </ThemedText>
          )}
        </Card>

        <Card style={styles.card}>
          <ThemedText type="subtitle" style={styles.rtlText}>
            בניית הצעת לו״ז
          </ThemedText>
          <TextField label="מתאריך" placeholder="14/12/2026" value={startDateText} onChangeText={setStartDateText} />
          <TextField label="עד תאריך" placeholder="11/01/2027" value={endDateText} onChangeText={setEndDateText} />
          <Button label="🤖 צור הצעת לו״ז" onPress={handleGenerate} loading={isGenerating} />
        </Card>

        {commitMessage && (
          <ThemedText type="smallBold" themeColor="primary" style={styles.rtlText}>
            {commitMessage}
          </ThemedText>
        )}

        {warning && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            ℹ️ {warning}
          </ThemedText>
        )}
        {skippedHolidays.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            🕎 דולגו תאריכים שנופלים על חג: {skippedLabel}
          </ThemedText>
        )}
        {(attemptsUsed > 1 || validationNotes.length > 0) && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            🧠 הסוכן בדק את עצמו {attemptsUsed} פעמים לפני שסיים
            {validationNotes.length > 0 ? ` — תוקנו: ${validationNotes.join('; ')}` : ''}
          </ThemedText>
        )}
        {rejectedActivityIds.size > 0 && (
          <View style={styles.rejectedRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              🚫 מוחרגות {rejectedActivityIds.size} פעילויות שסומנו כלא רצויות בטיוטה קודמת
            </ThemedText>
            <Button label="נקה החרגות" variant="ghost" size="small" fullWidth={false} onPress={handleClearRejected} />
          </View>
        )}

        {suggestions.length > 0 && (
          <>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הצעת הלו״ז ({selectedKeys.size} מתוך {suggestions.length} נבחרו)
            </ThemedText>
            <View style={styles.list}>
              {suggestionsByDate.map((group) => (
                <Card key={group.date} style={styles.dateGroupCard}>
                  <ThemedText type="smallBold" style={styles.rtlText}>
                    {toIsraeliDate(group.date)} ({DAY_OF_WEEK_LABELS[group.dayOfWeek]})
                  </ThemedText>
                  {group.items.map((s) => (
                    <View key={suggestionKey(s)} style={styles.suggestionRow}>
                      <Checkbox
                        checked={selectedKeys.has(suggestionKey(s))}
                        onToggle={() => toggleSelected(suggestionKey(s))}
                        label={`${ACTIVITY_TYPE_LABELS[s.activity_type]}: ${s.activity_name}`}
                        strikethrough={false}
                      />
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        {s.reason}
                      </ThemedText>
                    </View>
                  ))}
                </Card>
              ))}
            </View>
            <Button
              label={`הוסף ${selectedKeys.size} פעילויות ללוח`}
              onPress={handleCommit}
              loading={isCommitting}
              disabled={selectedKeys.size === 0}
            />
          </>
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
    gap: Spacing.two,
  },
  dateGroupCard: {
    gap: Spacing.two,
  },
  suggestionRow: {
    gap: 2,
  },
  rejectedRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
