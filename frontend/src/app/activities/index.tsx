import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { listActivities } from '@/api/activities';
import { ApiError } from '@/api/client';
import { createScheduleEntry } from '@/api/schedule';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_LOCATIONS,
  ACTIVITY_LOCATION_LABELS,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  GRADE_LABELS,
  GRADE_LEVELS,
} from '@/constants/activity';
import { DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { Activity, ActivityCategory, ActivityLocation, ActivityType, DayOfWeek } from '@/types';

const PAGE_SIZE = 12;

export default function ActivitiesScreen() {
  const router = useRouter();
  const { pickForLayerId, pickDay, pickTime } = useLocalSearchParams<{
    pickForLayerId?: string;
    pickDay?: DayOfWeek;
    pickTime?: string;
  }>();
  const isPicking = !!pickForLayerId && !!pickDay && !!pickTime;
  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [location, setLocation] = useState<ActivityLocation | null>(null);
  const [gradeMin, setGradeMin] = useState<number | null>(null);
  const [gradeMax, setGradeMax] = useState<number | null>(null);
  const [groupSize, setGroupSize] = useState('');
  const [tag, setTag] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function loadData(targetPage: number) {
    setIsLoading(true);
    setError(null);
    try {
      const results = await listActivities({
        search: search.trim() || undefined,
        activity_type: activityType ?? undefined,
        categories: categories.length > 0 ? categories : undefined,
        location: location ?? undefined,
        grade_min: gradeMin ?? undefined,
        grade_max: gradeMax ?? undefined,
        group_size: groupSize.trim() ? Number(groupSize.trim()) : undefined,
        tag: tag.trim() || undefined,
        page: targetPage,
        page_size: PAGE_SIZE,
      });
      setActivities(results.items);
      setTotal(results.total);
      setPage(results.page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הפעילויות נכשלה');
    } finally {
      setIsLoading(false);
    }
  }

  // Always call the latest loadData (current filter state), but keep
  // the focus-effect callback itself stable so it only actually fires
  // on real focus events -- not on every filter keystroke.
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  // Reload from page 1 every time this screen gains focus -- not just
  // on first mount -- so returning here after creating an activity (or
  // editing/deleting one) always shows the current state instead of a
  // stale list from before the navigation away.
  useFocusEffect(
    useCallback(() => {
      loadDataRef.current(1);
    }, [])
  );

  function toggleCategory(category: ActivityCategory) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  async function handleAddToSlot(activityId: string) {
    if (!pickForLayerId || !pickDay || !pickTime) return;
    setAddingId(activityId);
    setError(null);
    try {
      await createScheduleEntry(pickForLayerId, {
        activity_id: activityId,
        day_of_week: pickDay,
        start_time: pickTime,
      });
      router.replace(`/layer/${pickForLayerId}/schedule`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'השיבוץ נכשל');
      setAddingId(null);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            מאגר פעילויות
          </ThemedText>
          <View style={styles.headerActions}>
            <Button
              label="פעילות חדשה +"
              fullWidth={false}
              onPress={() => router.push('/activities/new')}
            />
            <Link href="/">
              <ThemedText type="linkPrimary">← לדף הבית</ThemedText>
            </Link>
          </View>
        </View>

        {isPicking && (
          <Card style={styles.pickBanner}>
            <ThemedText type="smallBold" style={styles.rtlText}>
              בחירת פעילות ליום {DAY_OF_WEEK_LABELS[pickDay]} בשעה {pickTime.slice(0, 5)} — לחצו + כדי
              להוסיף ללוח
            </ThemedText>
            <Button
              label="ביטול, חזרה ללוח"
              variant="ghost"
              size="small"
              fullWidth={false}
              onPress={() => router.replace(`/layer/${pickForLayerId}/schedule`)}
            />
          </Card>
        )}

        <Card style={styles.filtersCard}>
          <TextField label="חיפוש" placeholder="שם או תיאור" value={search} onChangeText={setSearch} />

          <ThemedText type="smallBold" style={styles.rtlText}>
            תפקיד בפעילות
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

          <ThemedText type="smallBold" style={styles.rtlText}>
            קטגוריית תוכן (ניתן לבחור כמה)
          </ThemedText>
          <View style={styles.chipRow}>
            {ACTIVITY_CATEGORIES.map((category) => (
              <Button
                key={category}
                label={ACTIVITY_CATEGORY_LABELS[category]}
                size="small"
                fullWidth={false}
                variant={categories.includes(category) ? 'primary' : 'ghost'}
                onPress={() => toggleCategory(category)}
              />
            ))}
          </View>

          <ThemedText type="smallBold" style={styles.rtlText}>
            מיקום
          </ThemedText>
          <View style={styles.chipRow}>
            <Button
              label="הכל"
              size="small"
              fullWidth={false}
              variant={location === null ? 'primary' : 'ghost'}
              onPress={() => setLocation(null)}
            />
            {ACTIVITY_LOCATIONS.map((loc) => (
              <Button
                key={loc}
                label={ACTIVITY_LOCATION_LABELS[loc]}
                size="small"
                fullWidth={false}
                variant={location === loc ? 'primary' : 'ghost'}
                onPress={() => setLocation(loc)}
              />
            ))}
          </View>

          <ThemedText type="smallBold" style={styles.rtlText}>
            משכבה (טווח — ניתן להשאיר צד אחד פתוח)
          </ThemedText>
          <View style={styles.chipRow}>
            <Button
              label="הכל"
              size="small"
              fullWidth={false}
              variant={gradeMin === null ? 'primary' : 'ghost'}
              onPress={() => setGradeMin(null)}
            />
            {GRADE_LEVELS.map((g) => (
              <Button
                key={g}
                label={GRADE_LABELS[g]}
                size="small"
                fullWidth={false}
                variant={gradeMin === g ? 'primary' : 'ghost'}
                onPress={() => setGradeMin(g)}
              />
            ))}
          </View>
          <ThemedText type="smallBold" style={styles.rtlText}>
            עד שכבה
          </ThemedText>
          <View style={styles.chipRow}>
            <Button
              label="הכל"
              size="small"
              fullWidth={false}
              variant={gradeMax === null ? 'primary' : 'ghost'}
              onPress={() => setGradeMax(null)}
            />
            {GRADE_LEVELS.map((g) => (
              <Button
                key={g}
                label={GRADE_LABELS[g]}
                size="small"
                fullWidth={false}
                variant={gradeMax === g ? 'primary' : 'ghost'}
                onPress={() => setGradeMax(g)}
              />
            ))}
          </View>

          <View style={styles.filterFieldsRow}>
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

          <Button label="חפש" onPress={() => loadData(1)} loading={isLoading} variant="secondary" />
        </Card>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {!isLoading && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            {total} פעילויות נמצאו
          </ThemedText>
        )}

        {activities.length === 0 && !isLoading ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            לא נמצאו פעילויות התואמות את החיפוש.
          </ThemedText>
        ) : (
          <View style={styles.grid}>
            {activities.map((activity) => (
              <Card key={activity.id} style={styles.tile}>
                <View style={styles.titleRow}>
                  <Badge label={ACTIVITY_TYPE_LABELS[activity.activity_type]} tone="primary" />
                </View>
                <ThemedText type="linkPrimary" style={styles.rtlText} numberOfLines={2}>
                  {activity.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText} numberOfLines={2}>
                  {activity.description}
                </ThemedText>
                <View style={styles.metaRow}>
                  {activity.average_rating !== null && (
                    <ThemedText type="small">⭐ {activity.average_rating}</ThemedText>
                  )}
                  {activity.duration_minutes && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {activity.duration_minutes} דק׳
                    </ThemedText>
                  )}
                </View>
                {activity.categories.length > 0 && (
                  <View style={styles.chipRowTight}>
                    {activity.categories.slice(0, 2).map((c) => (
                      <Badge key={c} label={ACTIVITY_CATEGORY_LABELS[c]} />
                    ))}
                  </View>
                )}
                <View style={styles.tileActions}>
                  <Button
                    label="פרטים ←"
                    variant="secondary"
                    size="small"
                    onPress={() =>
                      router.push(
                        isPicking
                          ? `/activities/${activity.id}?pickForLayerId=${pickForLayerId}&pickDay=${pickDay}&pickTime=${pickTime}`
                          : `/activities/${activity.id}`
                      )
                    }
                  />
                  {isPicking && (
                    <Button
                      label="+"
                      variant="primary"
                      size="small"
                      fullWidth={false}
                      loading={addingId === activity.id}
                      onPress={() => handleAddToSlot(activity.id)}
                    />
                  )}
                </View>
              </Card>
            ))}
          </View>
        )}

        {totalPages > 1 && (
          <View style={styles.paginationRow}>
            <Button
              label="הקודם"
              size="small"
              fullWidth={false}
              variant="ghost"
              disabled={page <= 1 || isLoading}
              onPress={() => loadData(page - 1)}
            />
            <ThemedText type="small" themeColor="textSecondary">
              עמוד {page} מתוך {totalPages}
            </ThemedText>
            <Button
              label="הבא"
              size="small"
              fullWidth={false}
              variant="ghost"
              disabled={page >= totalPages || isLoading}
              onPress={() => loadData(page + 1)}
            />
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
    gap: Spacing.three,
    maxWidth: 960,
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
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  filtersCard: {
    gap: Spacing.two,
  },
  pickBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tileActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chipRowTight: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  filterFieldsRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
  },
  filterField: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  tile: {
    width: 220,
    gap: Spacing.one,
    padding: 14,
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  paginationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
});
