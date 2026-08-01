import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { getLayer } from '@/api/layers';
import { createParticipant, listParticipants, updateParticipant } from '@/api/participants';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Layer, Participant } from '@/types';

export default function LayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, fetchedParticipants] = await Promise.all([
        getLayer(id),
        listParticipants(id),
      ]);
      setLayer(fetchedLayer);
      setParticipants(fetchedParticipants);
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

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBlock}>
          <ThemedText type="title" style={styles.rtlText}>
            {layer?.name ?? '...'}
          </ThemedText>
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
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

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
                <ThemedText
                  style={[styles.rtlText, !item.is_active && styles.inactiveText]}
                >
                  {item.full_name}
                </ThemedText>
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
  inactiveText: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
});
