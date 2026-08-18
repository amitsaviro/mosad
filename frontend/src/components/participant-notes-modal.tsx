// Quick-access note history for a participant (חניך) -- opened from
// the roster without navigating away, so jotting something down mid-session
// stays a two-tap action.
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { createParticipantNote, deleteParticipantNote, listParticipantNotes } from '@/api/participantNotes';
import { Button } from '@/components/button';
import { ConfirmButton } from '@/components/confirm-button';
import { IconButton } from '@/components/icon-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ParticipantNote } from '@/types';
import { toIsraeliDate } from '@/utils/calendar';

function formatNoteTimestamp(iso: string): string {
  const [datePart, timePart] = iso.split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  return time ? `${toIsraeliDate(datePart)} ${time}` : toIsraeliDate(datePart);
}

export function ParticipantNotesModal({
  participantId,
  participantName,
  canManage,
  onClose,
}: {
  participantId: string | null;
  participantName: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [notes, setNotes] = useState<ParticipantNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function loadNotes() {
    if (!participantId) return;
    setError(null);
    try {
      setNotes(await listParticipantNotes(participantId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת ההערות נכשלה');
    }
  }

  useEffect(() => {
    setNotes([]);
    setBody('');
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId]);

  async function handleAddNote() {
    if (!participantId || !body.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      await createParticipantNote(participantId, body.trim());
      setBody('');
      await loadNotes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הוספת ההערה נכשלה');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await deleteParticipantNote(noteId);
      await loadNotes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  return (
    <Modal visible={!!participantId} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.headerRow}>
              <IconButton glyph="✕" accessibilityLabel="סגור" onPress={onClose} />
              <ThemedText type="subtitle" style={styles.rtlText} numberOfLines={2}>
                הערות — {participantName}
              </ThemedText>
            </View>

            {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              {notes.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  אין עדיין הערות על החניך הזה.
                </ThemedText>
              ) : (
                notes.map((note) => (
                  <View key={note.id} style={[styles.noteCard, { borderColor: theme.border }]}>
                    <View style={styles.noteHeaderRow}>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        {note.author_name} · {formatNoteTimestamp(note.created_at)}
                      </ThemedText>
                      {canManage && <ConfirmButton label="מחק" onConfirm={() => handleDeleteNote(note.id)} />}
                    </View>
                    <ThemedText style={styles.rtlText}>{note.body}</ThemedText>
                  </View>
                ))
              )}
            </ScrollView>

            {canManage && (
              <View style={[styles.addBox, { borderTopColor: theme.border }]}>
                <TextField
                  label="הוספת הערה"
                  placeholder="למשל: התקשה בפעילות היום, כדאי לעקוב"
                  value={body}
                  onChangeText={setBody}
                  multiline
                  style={styles.multiline}
                />
                <Button label="הוסף הערה" onPress={handleAddNote} loading={isSaving} />
              </View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
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
  noteCard: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  addBox: {
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
});
