import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { EditableText } from '@/components/editable-text';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Layer, Participant, User } from '@/types';

export default function LayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [counselors, setCounselors] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const isAdmin = user?.role === 'institution_admin';

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
    try {
      await createParticipant(id, newName.trim());
      setNewName('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הוספת החניך נכשלה');
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
            {!isAdmin && layer?.is_assigned && <ConfirmButton label="עזוב שכבה" onConfirm={handleLeaveLayer} />}
            {isAdmin && <ConfirmButton label="מחק שכבה" onConfirm={handleDeleteLayer} />}
          </View>
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

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
            {participants.map((item) => (
              <Card key={item.id} style={styles.row}>
                <View style={item.is_active ? undefined : styles.inactiveText}>
                  <EditableText
                    value={item.full_name}
                    canEdit={!!layer?.can_manage}
                    onSave={(name) => handleRenameParticipant(item.id, name)}
                  />
                </View>
                {layer?.can_manage && (
                  <Button
                    label={item.is_active ? 'השבת' : 'הפעל'}
                    onPress={() => handleToggleActive(item)}
                    variant={item.is_active ? 'ghost' : 'secondary'}
                    fullWidth={false}
                  />
                )}
              </Card>
            ))}
          </View>
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
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
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
