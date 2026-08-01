import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { assignCounselor, createLayer, joinLayer, listLayers } from '@/api/layers';
import { listInstitutionUsers } from '@/api/users';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
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
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerTextBlock}>
            <View style={styles.greetingRow}>
              <ThemedText type="title" style={styles.rtlText}>
                שלום, {user?.full_name}
              </ThemedText>
              <Badge
                label={isAdmin ? 'מנהל' : user?.role === 'counselor' ? 'מדריך' : 'עדיין לא שייך לאף קבוצה'}
                tone={isAdmin ? 'primary' : 'neutral'}
              />
            </View>
            {user?.institution_name && (
              <ThemedText type="subtitle" themeColor="primary" style={styles.rtlText}>
                {user.institution_name}
              </ThemedText>
            )}
          </View>
          <Button label="התנתקות" onPress={logout} variant="ghost" fullWidth={false} />
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        <Card>
          <ThemedText type="subtitle" style={styles.rtlText}>
            {isAdmin ? 'צור שכבה חדשה' : 'צור קבוצת הדרכה משלך'}
          </ThemedText>
          {hasNoGroupYet && (
            <TextField
              label="שם מסגרת החינוך"
              placeholder="חינוך XXXX"
              value={newInstitutionName}
              onChangeText={setNewInstitutionName}
            />
          )}
          <TextField
            label="שם השכבה"
            placeholder="למשל: שכבה ז'"
            value={newLayerName}
            onChangeText={setNewLayerName}
          />
          <Button label="צור" onPress={handleCreateLayer} />
        </Card>

        <Card>
          <ThemedText type="subtitle" style={styles.rtlText}>
            הצטרפות בקוד
          </ThemedText>
          <TextField
            label="קוד הצטרפות"
            placeholder="XXXXXX"
            autoCapitalize="characters"
            value={joinCode}
            onChangeText={setJoinCode}
          />
          <Button label="הצטרף" onPress={handleJoinLayer} variant="secondary" />
        </Card>

        <ThemedText type="subtitle" style={styles.rtlText}>
          השכבות {user?.institution_name ? `של ${user.institution_name}` : 'שלי'}
        </ThemedText>

        {layers.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            עדיין אין שכבות. צור אחת למעלה, או הצטרף עם קוד.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {layers.map((item) => (
              <Card key={item.id} style={styles.layerCard}>
                <View style={styles.layerTitleRow}>
                  {!item.can_manage && <Badge label="צפייה בלבד" />}
                  <Link href={`/layer/${item.id}`}>
                    <ThemedText type="linkPrimary" style={styles.rtlText}>
                      {item.name}
                    </ThemedText>
                  </Link>
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  קוד הצטרפות: {item.join_code}
                </ThemedText>

                {isAdmin && item.can_manage && (
                  <View style={styles.assignRow}>
                    <View style={styles.assignInput}>
                      <TextField
                        placeholder="אימייל מדריך לשיוך"
                        autoCapitalize="none"
                        value={assignEmailByLayer[item.id] ?? ''}
                        onChangeText={(text) =>
                          setAssignEmailByLayer((prev) => ({ ...prev, [item.id]: text }))
                        }
                      />
                    </View>
                    <Button
                      label="שייך"
                      onPress={() => handleAssign(item.id)}
                      variant="secondary"
                      fullWidth={false}
                    />
                  </View>
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
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  headerTextBlock: {
    gap: Spacing.two,
    flex: 1,
  },
  greetingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  list: {
    gap: Spacing.three,
  },
  layerCard: {
    gap: Spacing.one,
  },
  layerTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  assignRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    marginTop: Spacing.two,
    alignItems: 'flex-end',
  },
  assignInput: {
    flex: 1,
  },
});
