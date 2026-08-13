// Quick attendance + notes reporting for one activity occurrence --
// opened right from the activity's own slot in the schedule (weekly or
// dated), instead of a separate date-driven page. Institutions that
// only meet part of the week don't have "today" reliably map to a real
// session, so the entry point is the activity itself, not a calendar.
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { listAttendanceForDate, markAttendance } from '@/api/attendance';
import { ApiError } from '@/api/client';
import { createParticipantNote } from '@/api/participantNotes';
import { listParticipants } from '@/api/participants';
import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Participant } from '@/types';
import { fromIsraeliDate, toIsraeliDate } from '@/utils/calendar';

export function SessionReportModal({
  layerId,
  activityName,
  initialDate,
  onClose,
}: {
  layerId: string | null;
  activityName: string;
  initialDate: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [dateText, setDateText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [openNoteFor, setOpenNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteAddedFor, setNoteAddedFor] = useState<string[]>([]);

  async function loadMarks(list: Participant[], date: string) {
    if (!layerId) return;
    try {
      const existing = await listAttendanceForDate(layerId, date);
      const byParticipant = new Map(existing.map((r) => [r.participant_id, r.present]));
      const next: Record<string, boolean> = {};
      for (const p of list) next[p.id] = byParticipant.get(p.id) ?? true;
      setMarks(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הנוכחות נכשלה');
    }
  }

  useEffect(() => {
    if (!layerId) return;
    setDateText(toIsraeliDate(initialDate));
    setError(null);
    setSavedMessage(null);
    setOpenNoteFor(null);
    setNoteDraft('');
    setNoteAddedFor([]);
    listParticipants(layerId)
      .then((all) => {
        const active = all.filter((p) => p.is_active);
        setParticipants(active);
        return loadMarks(active, initialDate);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'טעינת החניכים נכשלה'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId]);

  function handleDateBlur() {
    const parsed = fromIsraeliDate(dateText);
    if (!parsed) {
      setError('תאריך לא תקין, למשל 12/08/2026');
      return;
    }
    setError(null);
    loadMarks(participants, parsed);
  }

  async function handleSaveAttendance() {
    if (!layerId) return;
    const parsed = fromIsraeliDate(dateText);
    if (!parsed) {
      setError('תאריך לא תקין, למשל 12/08/2026');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await markAttendance(
        layerId,
        parsed,
        participants.map((p) => ({ participant_id: p.id, present: marks[p.id] ?? true }))
      );
      setSavedMessage('הנוכחות נשמרה בהצלחה');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שמירת הנוכחות נכשלה');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddNote(participantId: string) {
    if (!noteDraft.trim()) return;
    setError(null);
    try {
      await createParticipantNote(participantId, noteDraft.trim());
      setNoteDraft('');
      setOpenNoteFor(null);
      setNoteAddedFor((prev) => [...prev, participantId]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הוספת ההערה נכשלה');
    }
  }

  return (
    <Modal visible={!!layerId} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <IconButton glyph="✕" accessibilityLabel="סגור" onPress={onClose} />
            <ThemedText type="subtitle" style={styles.rtlText} numberOfLines={2}>
              נוכחות והערות — {activityName}
            </ThemedText>
          </View>

          <TextField
            label="תאריך (יום/חודש/שנה)"
            value={dateText}
            onChangeText={setDateText}
            onBlur={handleDateBlur}
          />

          {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}
          {savedMessage && <ThemedText themeColor="success" style={styles.rtlText}>{savedMessage}</ThemedText>}

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {participants.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                אין חניכים פעילים בשכבה הזו.
              </ThemedText>
            ) : (
              participants.map((p) => (
                <View key={p.id} style={[styles.participantBox, { borderColor: theme.border }]}>
                  <View style={styles.participantRow}>
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {p.full_name}
                    </ThemedText>
                    <View style={styles.toggleRow}>
                      <Button
                        label="✓ נכח"
                        size="small"
                        fullWidth={false}
                        variant={(marks[p.id] ?? true) ? 'primary' : 'ghost'}
                        onPress={() => setMarks((prev) => ({ ...prev, [p.id]: true }))}
                      />
                      <Button
                        label="✗ נעדר"
                        size="small"
                        fullWidth={false}
                        variant={!(marks[p.id] ?? true) ? 'danger' : 'ghost'}
                        onPress={() => setMarks((prev) => ({ ...prev, [p.id]: false }))}
                      />
                    </View>
                  </View>

                  {openNoteFor === p.id ? (
                    <View style={styles.noteRow}>
                      <View style={styles.noteField}>
                        <TextField placeholder="הערה על החניך" value={noteDraft} onChangeText={setNoteDraft} />
                      </View>
                      <Button label="הוסף" size="small" fullWidth={false} onPress={() => handleAddNote(p.id)} />
                      <Button
                        label="ביטול"
                        variant="ghost"
                        size="small"
                        fullWidth={false}
                        onPress={() => {
                          setOpenNoteFor(null);
                          setNoteDraft('');
                        }}
                      />
                    </View>
                  ) : (
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.rtlText}
                      onPress={() => {
                        setOpenNoteFor(p.id);
                        setNoteDraft('');
                      }}
                    >
                      {noteAddedFor.includes(p.id) ? '✓ הערה נוספה — להוסיף עוד?' : '📝 הוספת הערה'}
                    </ThemedText>
                  )}
                </View>
              ))
            )}
          </ScrollView>

          {participants.length > 0 && (
            <Button label="שמור נוכחות" onPress={handleSaveAttendance} loading={isSaving} />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: Spacing.two,
  },
  participantBox: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  participantRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
  },
  noteRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  noteField: {
    flex: 1,
  },
});
