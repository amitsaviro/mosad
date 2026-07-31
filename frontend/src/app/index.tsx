import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { assignCounselor, createLayer, joinLayer, listLayers } from '@/api/layers';
import { listInstitutionUsers } from '@/api/users';
import { useAuth } from '@/auth/AuthContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Layer, User } from '@/types';

export default function DashboardScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [layers, setLayers] = useState<Layer[]>([]);
  const [counselors, setCounselors] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newInstitutionName, setNewInstitutionName] = useState('');
  const [newLayerName, setNewLayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [assignEmailByLayer, setAssignEmailByLayer] = useState<Record<string, string>>({});

  const isAdmin = user?.role === 'institution_admin';
  const hasNoGroupYet = !user?.institution_id;

  async function loadData() {
    setError(null);
    try {
      const fetchedLayers = await listLayers();
      setLayers(fetchedLayers);
      if (user?.role === 'institution_admin') {
        const users = await listInstitutionUsers();
        setCounselors(users.filter((u) => u.role === 'counselor'));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הנתונים נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCreateLayer() {
    if (!newLayerName.trim()) return;
    if (hasNoGroupYet && !newInstitutionName.trim()) return;
    try {
      await createLayer(newLayerName.trim(), undefined, newInstitutionName.trim() || undefined);
      setNewLayerName('');
      setNewInstitutionName('');
      // Creating your first-ever layer turns you into an institution
      // admin server-side — refresh the local user so the UI picks
      // that up immediately (e.g. shows the institution name heading).
      await refreshUser();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'יצירת השכבה נכשלה');
    }
  }

  async function handleJoinLayer() {
    if (!joinCode.trim()) return;
    try {
      await joinLayer(joinCode.trim());
      setJoinCode('');
      await refreshUser();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההצטרפות נכשלה');
    }
  }

  async function handleAssign(layerId: string) {
    const email = assignEmailByLayer[layerId]?.trim();
    if (!email) return;
    const match = counselors.find((c) => c.email === email);
    if (!match) {
      setError('לא נמצא מדריך עם האימייל הזה במוסד שלך (עליו קודם להירשם ולהצטרף עם קוד)');
      return;
    }
    try {
      await assignCounselor(layerId, match.id);
      setAssignEmailByLayer((prev) => ({ ...prev, [layerId]: '' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'השיוך נכשל');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.rtlText}>
          שלום, {user?.full_name}
        </ThemedText>
        {user?.institution_name && (
          <ThemedText type="subtitle" style={styles.rtlText}>
            {user.institution_name}
          </ThemedText>
        )}
        <ThemedText type="small" style={styles.rtlText}>
          {isAdmin ? 'מנהל' : user?.role === 'counselor' ? 'מדריך' : 'עדיין לא שייך לאף קבוצה'}
        </ThemedText>
        <Pressable onPress={logout}>
          <ThemedText type="link">התנתקות</ThemedText>
        </Pressable>
      </ThemedView>

      {error && <ThemedText style={[styles.error, styles.rtlText]}>{error}</ThemedText>}

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={styles.rtlText}>
          {isAdmin ? 'צור שכבה חדשה' : 'צור קבוצת הדרכה משלך'}
        </ThemedText>
        {hasNoGroupYet && (
          <TextInput
            style={styles.input}
            placeholder="שם מסגרת החינוך (למשל: חינוך בית קמה)"
            value={newInstitutionName}
            onChangeText={setNewInstitutionName}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="שם השכבה (למשל: שכבה ז')"
          value={newLayerName}
          onChangeText={setNewLayerName}
        />
        <Pressable style={styles.button} onPress={handleCreateLayer}>
          <ThemedText style={styles.buttonText}>צור</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={styles.rtlText}>
          הצטרפות בקוד
        </ThemedText>
        <TextInput
          style={styles.input}
          placeholder="קוד הצטרפות"
          autoCapitalize="characters"
          value={joinCode}
          onChangeText={setJoinCode}
        />
        <Pressable style={styles.button} onPress={handleJoinLayer}>
          <ThemedText style={styles.buttonText}>הצטרף</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedText type="subtitle" style={styles.rtlText}>
        השכבות {user?.institution_name ? `של ${user.institution_name}` : 'שלי'}
      </ThemedText>
      <FlatList
        data={layers}
        keyExtractor={(layer) => layer.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.layerCard}>
            <ThemedView style={styles.layerTitleRow}>
              <Link href={`/layer/${item.id}`}>
                <ThemedText type="linkPrimary" style={styles.rtlText}>
                  {item.name}
                </ThemedText>
              </Link>
              {!item.can_manage && (
                <ThemedText type="small" style={styles.viewOnlyBadge}>
                  צפייה בלבד
                </ThemedText>
              )}
            </ThemedView>
            <ThemedText type="small" style={styles.rtlText}>
              קוד הצטרפות: {item.join_code}
            </ThemedText>

            {isAdmin && item.can_manage && (
              <ThemedView style={styles.assignRow}>
                <TextInput
                  style={[styles.input, styles.assignInput]}
                  placeholder="אימייל מדריך לשיוך"
                  autoCapitalize="none"
                  value={assignEmailByLayer[item.id] ?? ''}
                  onChangeText={(text) =>
                    setAssignEmailByLayer((prev) => ({ ...prev, [item.id]: text }))
                  }
                />
                <Pressable style={styles.smallButton} onPress={() => handleAssign(item.id)}>
                  <ThemedText style={styles.buttonText}>שייך</ThemedText>
                </Pressable>
              </ThemedView>
            )}
          </ThemedView>
        )}
        ListEmptyComponent={
          <ThemedText type="small" style={styles.rtlText}>
            עדיין אין שכבות. צור אחת למעלה, או הצטרף עם קוד.
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
  header: {
    gap: Spacing.one,
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
  smallButton: {
    backgroundColor: '#3c87f7',
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
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
  layerCard: {
    padding: Spacing.three,
    borderRadius: 12,
    gap: Spacing.one,
  },
  layerTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
  },
  viewOnlyBadge: {
    color: '#888',
    fontStyle: 'italic',
  },
  assignRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  assignInput: {
    flex: 1,
  },
});
