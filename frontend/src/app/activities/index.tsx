import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { listActivities } from '@/api/activities';
import { ApiError } from '@/api/client';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { Spacing } from '@/constants/theme';
import { Activity, ActivityType } from '@/types';

export default function ActivitiesScreen() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [age, setAge] = useState('');
  const [groupSize, setGroupSize] = useState('');
  const [tag, setTag] = useState('');

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const results = await listActivities({
        search: search.trim() || undefined,
        activity_type: activityType ?? undefined,
        age: age.trim() ? Number(age.trim()) : undefined,
        group_size: groupSize.trim() ? Number(groupSize.trim()) : undefined,
        tag: tag.trim() || undefined,
      });
      setActivities(results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הפעילויות נכשלה');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            מאגר פעילויות
          </ThemedText>
          <Button
            label="פעילות חדשה +"
            fullWidth={false}
            onPress={() => router.push('/activities/new')}
          />
        </View>

        <Card style={styles.filtersCard}>
          <TextField label="חיפוש" placeholder="שם או תיאור" value={search} onChangeText={setSearch} />

          <ThemedText type="smallBold" style={styles.rtlText}>
            סוג פעילות
          </ThemedText>
          <View style={styles.chipRow}>
            <Button
              label="הכל"
              size="small"
              fullWidth={false}
              variant={activityType === null ? 'primary' : 'ghost'}
              onPress={() => setActivityType(null)}
            />
            {ACTIVITY_TYPES.map((t) => (
              <Button
                key={t}
                label={ACTIVITY_TYPE_LABELS[t]}
                size="small"
                fullWidth={false}
                variant={activityType === t ? 'primary' : 'ghost'}
                onPress={() => setActivityType(t)}
              />
            ))}
          </View>

          <View style={styles.filterFieldsRow}>
            <View style={styles.filterField}>
              <TextField label="גיל" placeholder="למשל: 12" value={age} onChangeText={setAge} keyboardType="numeric" />
            </View>
            <View style={styles.filterField}>
              <TextField
                label="כמות משתתפים"
                placeholder="למשל: 20"
                value={groupSize}
                onChangeText={setGroupSize}
                keyboardType="numeric"
              />
            </View>
          </View>
          <TextField label="תגית" placeholder="למשל: חנוכה" value={tag} onChangeText={setTag} />

          <Button label="חפש" onPress={loadData} loading={isLoading} variant="secondary" />
        </Card>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {activities.length === 0 && !isLoading ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            לא נמצאו פעילויות התואמות את החיפוש.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {activities.map((activity) => (
              <Card key={activity.id} style={styles.activityCard}>
                <View style={styles.titleRow}>
                  <Badge label={ACTIVITY_TYPE_LABELS[activity.activity_type]} tone="primary" />
                  <ThemedText type="linkPrimary" style={styles.rtlText}>
                    {activity.name}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  {activity.description.slice(0, 100)}
                  {activity.description.length > 100 ? '…' : ''}
                </ThemedText>
                <View style={styles.metaRow}>
                  {activity.average_rating !== null && (
                    <ThemedText type="small">⭐ {activity.average_rating} ({activity.usage_count})</ThemedText>
                  )}
                  {activity.duration_minutes && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {activity.duration_minutes} דק׳
                    </ThemedText>
                  )}
                  {(activity.age_min || activity.age_max) && (
                    <ThemedText type="small" themeColor="textSecondary">
                      גילאי {activity.age_min ?? '?'}-{activity.age_max ?? '?'}
                    </ThemedText>
                  )}
                </View>
                {activity.tags.length > 0 && (
                  <View style={styles.chipRow}>
                    {activity.tags.map((t) => (
                      <Badge key={t} label={t} />
                    ))}
                  </View>
                )}
                <Button
                  label="פרטים ←"
                  variant="secondary"
                  size="small"
                  fullWidth={false}
                  onPress={() => router.push(`/activities/${activity.id}`)}
                />
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
  filtersCard: {
    gap: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  filterFieldsRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
  },
  filterField: {
    flex: 1,
  },
  list: {
    gap: Spacing.three,
  },
  activityCard: {
    gap: Spacing.one,
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.three,
    flexWrap: 'wrap',
  },
});
