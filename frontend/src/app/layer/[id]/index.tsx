import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import {
  deleteLayer,
  getLayer,
  leaveLayer,
  listLayerCounselors,
  unassignCounselor,
  updateLayer,
} from '@/api/layers';
import { createParticipant, listParticipants, updateParticipant } from '@/api/participants';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/badge';
import { BirthdayPopup } from '@/components/birthday-popup';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { EditableText } from '@/components/editable-text';
import { ParticipantNotesModal } from '@/components/participant-notes-modal';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Layer, Participant, User } from '@/types';
import { fromIsraeliDate, nextBirthdayInfo, toIsraeliDate } from '@/utils/calendar';

const BIRTHDAY_WINDOW_DAYS = 30;

export default function LayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [counselors, setCounselors] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('');
  const [notesParticipant, setNotesParticipant] = useState<Participant | null>(null);
  const [editingDobId, setEditingDobId] = useState<string | null>(null);
  const [dobDraft, setDobDraft] = useState('');
  const [birthdayPopupDismissed, setBirthdayPopupDismissed] = useState(false);

  const isAdmin = user?.role === 'institution_admin';

  const upcomingBirthdays = useMemo(() => {
    return participants
      .filter((p) => p.is_active && p.date_of_birth)
      .map((p) => ({ participant: p, info: nextBirthdayInfo(p.date_of_birth!) }))
      .filter(({ info }) => info.daysUntil <= BIRTHDAY_WINDOW_DAYS)
      .sort((a, b) => a.info.daysUntil - b.info.daysUntil);
  }, [participants]);

  const todaysBirthdayNames = useMemo(
    () => upcomingBirthdays.filter(({ info }) => info.daysUntil === 0).map(({ participant }) => participant.full_name),
    [upcomingBirthdays]
  );

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, fetchedParticipants, fetchedCounselors] = await Promise.all([
        getLayer(id),
        listParticipants(id),
        listLayerCounselors(id),
      ]);
      setLayer(fetchedLayer);
      setParticipants(fetchedParticipants);
      setCounselors(fetchedCounselors);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת השכבה נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddParticipant() {
    if (!newName.trim()) return;
    let dob: string | undefined;
    if (newDob.trim()) {
      const parsed = fromIsraeliDate(newDob);
      if (!parsed) {
        setError('תאריך הלידה אינו בפורמט תקין, למשל 05/03/2015');
        return;
      }
      dob = parsed;
    }
    try {
      await createParticipant(id, newName.trim(), dob);
      setNewName('');
      setNewDob('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הוספת החניך נכשלה');
    }
  }

  async function handleSaveDob(participantId: string) {
    const trimmed = dobDraft.trim();
    if (!trimmed) {
      try {
        await updateParticipant(participantId, { date_of_birth: null });
        setEditingDobId(null);
        await loadData();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
      }
      return;
    }
    const parsed = fromIsraeliDate(trimmed);
    if (!parsed) {
      setError('תאריך הלידה אינו בפורמט תקין, למשל 05/03/2015');
      return;
    }
    try {
      await updateParticipant(participantId, { date_of_birth: parsed });
      setEditingDobId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
    }
  }

  async function handleToggleActive(participant: Participant) {
    try {
      await updateParticipant(participant.id, { is_active: !participant.is_active });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
    }
  }

  async function handleRenameParticipant(participantId: string, fullName: string) {
    try {
      await updateParticipant(participantId, { full_name: fullName });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שינוי השם נכשל');
    }
  }

  async function handleRenameLayer(name: string) {
    try {
      await updateLayer(id, { name });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שינוי השם נכשל');
    }
  }

  async function handleDeleteLayer() {
    try {
      await deleteLayer(id);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'מחיקת השכבה נכשלה');
    }
  }

  async function handleLeaveLayer() {
    try {
      await leaveLayer(id);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'היציאה מהשכבה נכשלה');
    }
  }

  async function handleRemoveCounselor(userId: string) {
    try {
      await unassignCounselor(id, userId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההסרה נכשלה');
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBlock}>
          {layer && (
            <EditableText
              value={layer.name}
              canEdit={layer.can_manage}
              textType="title"
              onSave={handleRenameLayer}
            />
          )}
          {layer?.description && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              {layer.description}
            </ThemedText>
          )}
          {layer && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              קוד הצטרפות: {layer.join_code}
            </ThemedText>
          )}
          {layer && !layer.can_manage && <Badge label="צפייה בלבד — אינך משוייך לשכבה זו" />}
          <View style={styles.layerActionsRow}>
            <Button
              label="לוח →"
              variant="secondary"
              size="small"
              fullWidth={false}
              onPress={() => router.push(`/layer/${id}/schedule`)}
            />
            <Button
              label="מעקב חניכים →"
              variant="secondary"
              size="small"
              fullWidth={false}
              onPress={() => router.push(`/layer/${id}/attendance`)}
            />
            {!isAdmin && layer?.is_assigned && <ConfirmButton label="עזוב שכבה" onConfirm={handleLeaveLayer} />}
            {isAdmin && <ConfirmButton label="מחק שכבה" onConfirm={handleDeleteLayer} />}
          </View>
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {upcomingBirthdays.length > 0 && (
          <Card style={styles.list}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              🎂 ימי הולדת קרובים
            </ThemedText>
            {upcomingBirthdays.map(({ participant, info }) => (
              <View key={participant.id} style={styles.birthdayRow}>
                <ThemedText style={styles.rtlText}>{participant.full_name}</ThemedText>
                <Badge
                  label={info.daysUntil === 0 ? 'היום! 🎉' : info.daysUntil === 1 ? 'מחר' : `בעוד ${info.daysUntil} ימים`}
                  tone={info.daysUntil <= 1 ? 'primary' : 'neutral'}
                />
              </View>
            ))}
          </Card>
        )}

        {isAdmin && counselors.length > 0 && (
          <Card style={styles.list}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              מדריכים משוייכים
            </ThemedText>
            {counselors.map((c) => (
              <View key={c.id} style={styles.row}>
                <ThemedText style={styles.rtlText}>
                  {c.full_name} ({c.email})
                </ThemedText>
                <Button
                  label="הסר"
                  variant="ghost"
                  fullWidth={false}
                  onPress={() => handleRemoveCounselor(c.id)}
                />
              </View>
            ))}
          </Card>
        )}

        {layer?.can_manage && (
          <Card>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הוספת חניך
            </ThemedText>
            <TextField label="שם החניך" placeholder="ישראל ישראלי" value={newName} onChangeText={setNewName} />
            <TextField
              label="תאריך לידה (אופציונלי, יום/חודש/שנה)"
              placeholder="05/03/2015"
              value={newDob}
              onChangeText={setNewDob}
            />
            <Button label="הוסף" onPress={handleAddParticipant} />
          </Card>
        )}

        <ThemedText type="subtitle" style={styles.rtlText}>
          רשימת חניכים ({participants.length})
        </ThemedText>

        {participants.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            אין עדיין חניכים בשכבה הזו.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {participants.map((item) => {
              const birthday = item.date_of_birth ? nextBirthdayInfo(item.date_of_birth) : null;
              const showBirthday = birthday && birthday.daysUntil <= 7;
              return (
                <Card key={item.id} style={styles.participantCard}>
                  <View style={styles.row}>
                    <View style={item.is_active ? undefined : styles.inactiveText}>
                      <EditableText
                        value={item.full_name}
                        canEdit={!!layer?.can_manage}
                        onSave={(name) => handleRenameParticipant(item.id, name)}
                      />
                    </View>
                    <View style={styles.rowActions}>
                      <Button
                        label="📝 הערות"
                        variant="ghost"
                        size="small"
                        fullWidth={false}
                        onPress={() => setNotesParticipant(item)}
                      />
                      {layer?.can_manage && (
                        <Button
                          label={item.is_active ? 'השבת' : 'הפעל'}
                          onPress={() => handleToggleActive(item)}
                          variant={item.is_active ? 'ghost' : 'secondary'}
                          size="small"
                          fullWidth={false}
                        />
                      )}
                    </View>
                  </View>
                  {showBirthday && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                      🎂{' '}
                      {birthday.daysUntil === 0
                        ? 'יום הולדת היום!'
                        : birthday.daysUntil === 1
                          ? 'יום הולדת מחר'
                          : `יום הולדת בעוד ${birthday.daysUntil} ימים`}
                    </ThemedText>
                  )}
                  {layer?.can_manage &&
                    (editingDobId === item.id ? (
                      <View style={styles.dobEditRow}>
                        <View style={styles.dobEditField}>
                          <TextField placeholder="05/03/2015" value={dobDraft} onChangeText={setDobDraft} />
                        </View>
                        <Button
                          label="שמור"
                          size="small"
                          fullWidth={false}
                          onPress={() => handleSaveDob(item.id)}
                        />
                        <Button
                          label="ביטול"
                          variant="ghost"
                          size="small"
                          fullWidth={false}
                          onPress={() => setEditingDobId(null)}
                        />
                      </View>
                    ) : (
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        style={styles.rtlText}
                        onPress={() => {
                          setDobDraft(item.date_of_birth ? toIsraeliDate(item.date_of_birth) : '');
                          setEditingDobId(item.id);
                        }}
                      >
                        {item.date_of_birth ? `🎂 תאריך לידה: ${toIsraeliDate(item.date_of_birth)}` : '+ הוספת תאריך לידה'}
                      </ThemedText>
                    ))}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
      <ParticipantNotesModal
        participantId={notesParticipant?.id ?? null}
        participantName={notesParticipant?.full_name ?? ''}
        canManage={!!layer?.can_manage}
        onClose={() => setNotesParticipant(null)}
      />
      <BirthdayPopup
        names={birthdayPopupDismissed ? [] : todaysBirthdayNames}
        onClose={() => setBirthdayPopupDismissed(true)}
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
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  headerBlock: {
    gap: Spacing.two,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  list: {
    gap: Spacing.two,
  },
  birthdayRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantCard: {
    gap: Spacing.one,
  },
  rowActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dobEditRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  dobEditField: {
    flex: 1,
  },
  layerActionsRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    flexWrap: 'wrap',
    marginTop: Spacing.one,
  },
  inactiveText: {
    opacity: 0.5,
  },
});
