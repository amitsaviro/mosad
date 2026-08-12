import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { createInstitution, updateInstitution } from '@/api/institutions';
import {
  assignCounselor,
  createLayer,
  deleteLayer,
  joinLayer,
  leaveLayer,
  listLayers,
  updateLayer,
} from '@/api/layers';
import { listParticipants } from '@/api/participants';
import { adminRemoveMember, adminUpdateMember, listInstitutionUsers } from '@/api/users';
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
import { nextBirthdayInfo } from '@/utils/calendar';

const BIRTHDAY_WINDOW_DAYS = 30;

type UpcomingBirthday = {
  participant: Participant;
  layerName: string;
  daysUntil: number;
  turningAge: number;
};

export default function DashboardScreen() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [layers, setLayers] = useState<Layer[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<UpcomingBirthday[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newInstitutionName, setNewInstitutionName] = useState('');
  const [newLayerName, setNewLayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [assignEmailByLayer, setAssignEmailByLayer] = useState<Record<string, string>>({});

  const isAdmin = user?.role === 'institution_admin';
  const hasNoGroupYet = !user?.institution_id;
  const counselors = members.filter((m) => m.role === 'counselor');

  async function loadData() {
    setError(null);
    try {
      const fetchedLayers = await listLayers();
      setLayers(fetchedLayers);
      if (isAdmin) {
        setMembers(await listInstitutionUsers());
      }

      const manageableLayers = fetchedLayers.filter((l) => l.can_manage);
      const rosterByLayer = await Promise.all(
        manageableLayers.map(async (l) => ({ layer: l, participants: await listParticipants(l.id) }))
      );
      const birthdays: UpcomingBirthday[] = [];
      for (const { layer, participants } of rosterByLayer) {
        for (const p of participants) {
          if (!p.is_active || !p.date_of_birth) continue;
          const info = nextBirthdayInfo(p.date_of_birth);
          if (info.daysUntil <= BIRTHDAY_WINDOW_DAYS) {
            birthdays.push({ participant: p, layerName: layer.name, daysUntil: info.daysUntil, turningAge: info.turningAge });
          }
        }
      }
      birthdays.sort((a, b) => a.daysUntil - b.daysUntil);
      setUpcomingBirthdays(birthdays);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הנתונים נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCreateInstitution() {
    if (!newInstitutionName.trim()) return;
    try {
      await createInstitution(newInstitutionName.trim());
      setNewInstitutionName('');
      await refreshUser();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'יצירת מסגרת החינוך נכשלה');
    }
  }

  async function handleRenameInstitution(name: string) {
    try {
      await updateInstitution(name);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שינוי השם נכשל');
    }
  }

  async function handleCreateLayer() {
    if (!newLayerName.trim()) return;
    try {
      await createLayer(newLayerName.trim());
      setNewLayerName('');
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

  async function handleRenameLayer(layerId: string, name: string) {
    try {
      await updateLayer(layerId, { name });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שינוי השם נכשל');
    }
  }

  async function handleDeleteLayer(layerId: string) {
    try {
      await deleteLayer(layerId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'מחיקת השכבה נכשלה');
    }
  }

  async function handleLeaveLayer(layerId: string) {
    try {
      await leaveLayer(layerId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'היציאה מהשכבה נכשלה');
    }
  }

  async function handleAssign(layerId: string) {
    const email = assignEmailByLayer[layerId]?.trim();
    if (!email) return;
    const match = counselors.find((c) => c.email === email);
    if (!match) {
      setError('משתמש זה אינו קיים (עליו קודם להירשם ולהצטרף עם קוד)');
      return;
    }
    try {
      await assignCounselor(layerId, match.id);
      setAssignEmailByLayer((prev) => ({ ...prev, [layerId]: '' }));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    }
  }

  async function handleRenameMember(userId: string, fullName: string) {
    try {
      await adminUpdateMember(userId, fullName);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שינוי השם נכשל');
    }
  }

  async function handleRemoveMember(userId: string) {
    try {
      await adminRemoveMember(userId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההסרה נכשלה');
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerTextBlock}>
            <ThemedText type="title" style={styles.rtlText}>
              שלום, {user?.full_name}
            </ThemedText>
            <View style={styles.badgeRow}>
              <Badge
                label={isAdmin ? 'מנהל' : user?.role === 'counselor' ? 'מדריך' : 'עדיין לא שייך לאף קבוצה'}
                tone={isAdmin ? 'primary' : 'neutral'}
              />
              <Link href="/profile">
                <ThemedText type="linkPrimary">הגדרות חשבון</ThemedText>
              </Link>
            </View>
            {user?.institution_name && (
              <EditableText
                value={user.institution_name}
                canEdit={isAdmin}
                textType="subtitle"
                onSave={handleRenameInstitution}
              />
            )}
          </View>
          <View style={styles.headerActions}>
            <Button
              label="מאגר פעילויות"
              onPress={() => router.push('/activities')}
              variant="secondary"
              fullWidth={false}
            />
            <Button
              label="תצוגת שנה"
              onPress={() => router.push('/year')}
              variant="secondary"
              fullWidth={false}
            />
            <Button label="התנתקות" onPress={logout} variant="ghost" fullWidth={false} />
          </View>
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {upcomingBirthdays.length > 0 && (
          <Card style={styles.list}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              🎂 ימי הולדת קרובים
            </ThemedText>
            {upcomingBirthdays.map(({ participant, layerName, daysUntil, turningAge }) => (
              <View key={participant.id} style={styles.birthdayRow}>
                <ThemedText style={styles.rtlText}>
                  {participant.full_name} ({layerName}) — מלאו/ת {turningAge}
                </ThemedText>
                <Badge
                  label={daysUntil === 0 ? 'היום! 🎉' : daysUntil === 1 ? 'מחר' : `בעוד ${daysUntil} ימים`}
                  tone={daysUntil <= 1 ? 'primary' : 'neutral'}
                />
              </View>
            ))}
          </Card>
        )}

        {hasNoGroupYet && (
          <Card>
            <ThemedText type="subtitle" style={styles.rtlText}>
              צור קבוצת חינוך משלך
            </ThemedText>
            <TextField
              label="שם מסגרת החינוך"
              placeholder="חינוך XXXX"
              value={newInstitutionName}
              onChangeText={setNewInstitutionName}
            />
            <Button label="צור" onPress={handleCreateInstitution} />
          </Card>
        )}

        {isAdmin && (
          <Card>
            <ThemedText type="subtitle" style={styles.rtlText}>
              צור שכבה חדשה
            </ThemedText>
            <TextField
              label="שם השכבה"
              placeholder="למשל: שכבה ז'"
              value={newLayerName}
              onChangeText={setNewLayerName}
            />
            <Button label="צור" onPress={handleCreateLayer} />
          </Card>
        )}

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
            {hasNoGroupYet
              ? 'צור קבוצת חינוך למעלה, ואז שכבות בתוכה.'
              : 'עדיין אין שכבות. צור אחת למעלה, או הצטרף עם קוד.'}
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {layers.map((item) => (
              <Card key={item.id} style={styles.layerCard}>
                <View style={styles.layerTitleRow}>
                  {!item.can_manage && <Badge label="צפייה בלבד" />}
                  <EditableText
                    value={item.name}
                    canEdit={item.can_manage}
                    textType="linkPrimary"
                    onSave={(name) => handleRenameLayer(item.id, name)}
                  />
                </View>
                <Button
                  label="כניסה לשכבה →"
                  variant="secondary"
                  size="small"
                  fullWidth={false}
                  onPress={() => router.push(`/layer/${item.id}`)}
                />
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  קוד הצטרפות: {item.join_code}
                </ThemedText>

                {isAdmin && item.can_manage && (
                  <View style={styles.assignSection}>
                    <ThemedText type="small" style={styles.rtlText}>
                      הוספת מדריך לפי אימייל
                    </ThemedText>
                    <View style={styles.assignRow}>
                      <View style={styles.assignInput}>
                        <TextField
                          placeholder="אימייל מדריך"
                          autoCapitalize="none"
                          value={assignEmailByLayer[item.id] ?? ''}
                          onChangeText={(text) =>
                            setAssignEmailByLayer((prev) => ({ ...prev, [item.id]: text }))
                          }
                        />
                      </View>
                      <Button
                        label="הוסף"
                        onPress={() => handleAssign(item.id)}
                        variant="secondary"
                        fullWidth={false}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.layerActionsRow}>
                  {!isAdmin && item.is_assigned && (
                    <ConfirmButton label="עזוב שכבה" onConfirm={() => handleLeaveLayer(item.id)} />
                  )}
                  {isAdmin && (
                    <ConfirmButton label="מחק שכבה" onConfirm={() => handleDeleteLayer(item.id)} />
                  )}
                </View>
              </Card>
            ))}
          </View>
        )}

        {isAdmin && members.length > 0 && (
          <>
            <ThemedText type="subtitle" style={styles.rtlText}>
              חברי הצוות
            </ThemedText>
            <View style={styles.list}>
              {members
                .filter((m) => m.id !== user?.id)
                .map((member) => (
                  <Card key={member.id} style={styles.memberCard}>
                    <View style={styles.memberTitleRow}>
                      <EditableText
                        value={member.full_name}
                        canEdit
                        onSave={(name) => handleRenameMember(member.id, name)}
                      />
                      <Badge label={member.role === 'institution_admin' ? 'מנהל' : 'מדריך'} />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                      {member.email}
                    </ThemedText>
                    <ConfirmButton
                      label="הסר מהמוסד"
                      onConfirm={() => handleRemoveMember(member.id)}
                    />
                  </Card>
                ))}
            </View>
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
  badgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  list: {
    gap: Spacing.three,
  },
  birthdayRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
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
  assignSection: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  assignRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  assignInput: {
    flex: 1,
  },
  layerActionsRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    marginTop: Spacing.two,
    flexWrap: 'wrap',
  },
  memberCard: {
    gap: Spacing.one,
  },
  memberTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
});
