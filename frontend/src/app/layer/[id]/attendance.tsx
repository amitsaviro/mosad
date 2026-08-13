// Read-only tracking dashboard -- attendance percentage and notes are
// now reported per activity slot (see schedule.tsx's SessionReportModal),
// since institutions that only meet part of the week don't have "any
// date" marking make sense. This page is just the overview for
// following up on how each participant is doing.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getParticipantAttendanceSummary } from '@/api/attendance';
import { ApiError } from '@/api/client';
import { getLayer } from '@/api/layers';
import { listParticipantNotes } from '@/api/participantNotes';
import { listParticipants } from '@/api/participants';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ParticipantNotesModal } from '@/components/participant-notes-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Layer, Participant, ParticipantAttendanceSummary, ParticipantNote } from '@/types';

type Tracking = {
  summary: ParticipantAttendanceSummary | null;
  notesCount: number;
  latestNote: ParticipantNote | null;
};

export default function LayerAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [tracking, setTracking] = useState<Record<string, Tracking>>({});
  const [error, setError] = useState<string | null>(null);
  const [notesParticipantId, setNotesParticipantId] = useState<string | null>(null);

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, fetchedParticipants] = await Promise.all([getLayer(id), listParticipants(id)]);
      setLayer(fetchedLayer);
      const active = fetchedParticipants.filter((p) => p.is_active);
      setParticipants(active);

      const entries = await Promise.all(
        active.map(async (p) => {
          const [summary, notes] = await Promise.all([
            getParticipantAttendanceSummary(p.id),
            listParticipantNotes(p.id),
          ]);
          const tracking: Tracking = {
            summary,
            notesCount: notes.length,
            latestNote: notes[0] ?? null,
          };
          return [p.id, tracking] as const;
        })
      );
      setTracking(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הנתונים נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const notesParticipant = participants.find((p) => p.id === notesParticipantId) ?? null;

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
            מעקב חניכים{layer ? ` — ${layer.name}` : ''}
          </ThemedText>
          <Button
            label="חזרה לשכבה"
            variant="ghost"
            size="small"
            fullWidth={false}
            onPress={handleBackToLayer}
          />
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
          נוכחות והערות מדווחות ישירות מתוך משבצת הפעילות בלוח. כאן רואים סיכום לכל חניך.
        </ThemedText>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {participants.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            אין חניכים פעילים בשכבה הזו.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {participants.map((p) => {
              const t = tracking[p.id];
              return (
                <Card key={p.id} style={styles.participantCard}>
                  <ThemedText type="smallBold" style={styles.rtlText}>
                    {p.full_name}
                  </ThemedText>

                  {t?.summary && t.summary.rate !== null ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                      {t.summary.rate}% נוכחות ({t.summary.present_count}/{t.summary.total_sessions})
                    </ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                      אין עדיין נתוני נוכחות
                    </ThemedText>
                  )}

                  {t?.latestNote ? (
                    <ThemedText type="small" style={styles.rtlText} numberOfLines={2}>
                      📝 {t.latestNote.body}
                    </ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                      אין עדיין הערות
                    </ThemedText>
                  )}

                  <Button
                    label={t?.notesCount ? `כל ההערות (${t.notesCount}) ←` : 'הערות ←'}
                    variant="secondary"
                    size="small"
                    fullWidth={false}
                    onPress={() => setNotesParticipantId(p.id)}
                  />
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
      <ParticipantNotesModal
        participantId={notesParticipantId}
        participantName={notesParticipant?.full_name ?? ''}
        canManage={!!layer?.can_manage}
        onClose={() => {
          setNotesParticipantId(null);
          loadData();
        }}
      />
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
  list: {
    gap: Spacing.two,
  },
  participantCard: {
    gap: Spacing.one,
  },
});
