import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { getLayer } from '@/api/layers';
import { createParticipant, listParticipants, updateParticipant } from '@/api/participants';
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
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.rtlText}>
        {layer?.name ?? '...'}
      </ThemedText>
      {layer?.description && (
        <ThemedText type="small" style={styles.rtlText}>
          {layer.description}
        </ThemedText>
      )}
      {layer && (
        <ThemedText type="small" style={styles.rtlText}>
          קוד הצטרפות: {layer.join_code}
        </ThemedText>
      )}

      {error && <ThemedText style={[styles.error, styles.rtlText]}>{error}</ThemedText>}

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={styles.rtlText}>
          הוספת חניך
        </ThemedText>
        <TextInput style={styles.input} placeholder="שם החניך" value={newName} onChangeText={setNewName} />
        <Pressable style={styles.button} onPress={handleAddParticipant}>
          <ThemedText style={styles.buttonText}>הוסף</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedText type="subtitle" style={styles.rtlText}>
        רשימת חניכים ({participants.length})
      </ThemedText>
      <FlatList
        data={participants}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText
              style={[styles.rtlText, !item.is_active && styles.inactiveText]}
            >
              {item.full_name}
            </ThemedText>
            <Pressable onPress={() => handleToggleActive(item)}>
              <ThemedText type="link">{item.is_active ? 'השבת' : 'הפעל'}</ThemedText>
            </Pressable>
          </ThemedView>
        )}
        ListEmptyComponent={
          <ThemedText type="small" style={styles.rtlText}>
            אין עדיין חניכים בשכבה הזו.
          </ThemedText>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
    backgroundColor: '#F0F0F3',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: Spacing.two,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  button: {
    backgroundColor: '#3c87f7',
    borderRadius: 8,
    padding: Spacing.two,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#d33',
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
  },
  inactiveText: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
});
