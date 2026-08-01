import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { addComment, addRating, deleteActivity, getActivity, listComments, listRatings } from '@/api/activities';
import { ApiError } from '@/api/client';
import { listLayers } from '@/api/layers';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { Spacing } from '@/constants/theme';
import { Activity, ActivityComment, ActivityRating, Layer } from '@/types';

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [ratings, setRatings] = useState<ActivityRating[]>([]);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [myLayers, setMyLayers] = useState<Layer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [ratingNotes, setRatingNotes] = useState('');
  const [commentBody, setCommentBody] = useState('');

  async function loadData() {
    setError(null);
    try {
      const [fetchedActivity, fetchedRatings, fetchedComments, fetchedLayers] = await Promise.all([
        getActivity(id),
        listRatings(id),
        listComments(id),
        listLayers(),
      ]);
      setActivity(fetchedActivity);
      setRatings(fetchedRatings);
      setComments(fetchedComments);
      setMyLayers(fetchedLayers.filter((l) => l.can_manage));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הפעילות נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDelete() {
    try {
      await deleteActivity(id);
      router.replace('/activities');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'מחיקת הפעילות נכשלה');
    }
  }

  async function handleAddRating() {
    if (!selectedLayerId) {
      setError('יש לבחור שכבה שהשתמשה בפעילות');
      return;
    }
    try {
      await addRating(id, selectedLayerId, selectedRating, ratingNotes.trim() || undefined);
      setRatingNotes('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הוספת הדירוג נכשלה');
    }
  }

  async function handleAddComment() {
    if (!commentBody.trim()) return;
    try {
      await addComment(id, commentBody.trim());
      setCommentBody('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הוספת התגובה נכשלה');
    }
  }

  if (!activity) {
    return (
      <ThemedView style={styles.flex}>
        <ThemedText style={styles.rtlText}>{error ?? 'טוען...'}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBlock}>
          <View style={styles.titleRow}>
            <Badge label={ACTIVITY_TYPE_LABELS[activity.activity_type]} tone="primary" />
            <ThemedText type="title" style={styles.rtlText}>
              {activity.name}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            הועלה על ידי {activity.creator_name}
          </ThemedText>
          {activity.average_rating !== null && (
            <ThemedText style={styles.rtlText}>
              ⭐ {activity.average_rating} מתוך 5 ({activity.usage_count} שימושים)
            </ThemedText>
          )}
          {activity.can_manage && (
            <View style={styles.actionsRow}>
              <Button
                label="ערוך"
                variant="secondary"
                size="small"
                fullWidth={false}
                onPress={() => router.push(`/activities/new?id=${activity.id}`)}
              />
              <ConfirmButton label="מחק פעילות" onConfirm={handleDelete} />
            </View>
          )}
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        <Card style={styles.card}>
          <ThemedText style={styles.rtlText}>{activity.description}</ThemedText>

          <View style={styles.metaGrid}>
            {activity.location && (
              <ThemedText type="small" style={styles.rtlText}>
                📍 מיקום: {activity.location}
              </ThemedText>
            )}
            {activity.duration_minutes && (
              <ThemedText type="small" style={styles.rtlText}>
                ⏱ משך: {activity.duration_minutes} דקות
              </ThemedText>
            )}
            {(activity.age_min || activity.age_max) && (
              <ThemedText type="small" style={styles.rtlText}>
                🎂 גילאים: {activity.age_min ?? '?'}-{activity.age_max ?? '?'}
              </ThemedText>
            )}
            {(activity.group_size_min || activity.group_size_max) && (
              <ThemedText type="small" style={styles.rtlText}>
                👥 כמות משתתפים: {activity.group_size_min ?? '?'}-{activity.group_size_max ?? '?'}
              </ThemedText>
            )}
            {activity.budget_estimate != null && (
              <ThemedText type="small" style={styles.rtlText}>
                💰 תקציב משוער לחניך: ₪{activity.budget_estimate}
              </ThemedText>
            )}
          </View>

          {activity.required_equipment && (
            <>
              <ThemedText type="smallBold" style={styles.rtlText}>
                ציוד נדרש
              </ThemedText>
              <ThemedText type="small" style={styles.rtlText}>
                {activity.required_equipment}
              </ThemedText>
            </>
          )}

          {activity.tags.length > 0 && (
            <View style={styles.chipRow}>
              {activity.tags.map((t) => (
                <Badge key={t} label={t} />
              ))}
            </View>
          )}

          {activity.attachments.length > 0 && (
            <View style={styles.list}>
              <ThemedText type="smallBold" style={styles.rtlText}>
                קבצים וקישורים
              </ThemedText>
              {activity.attachments.map((a) => (
                <ThemedText
                  key={a.id}
                  type="linkPrimary"
                  style={styles.rtlText}
                  onPress={() => Linking.openURL(a.url)}
                >
                  {a.label || a.url}
                </ThemedText>
              ))}
            </View>
          )}
        </Card>

        <ThemedText type="subtitle" style={styles.rtlText}>
          דירוג הפעילות
        </ThemedText>
        <Card style={styles.card}>
          {myLayers.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              כדי לדרג, עליך להיות משוייך לשכבה כלשהי.
            </ThemedText>
          ) : (
            <>
              <ThemedText type="smallBold" style={styles.rtlText}>
                איזו שכבה השתמשה בפעילות?
              </ThemedText>
              <View style={styles.chipRow}>
                {myLayers.map((l) => (
                  <Button
                    key={l.id}
                    label={l.name}
                    size="small"
                    fullWidth={false}
                    variant={selectedLayerId === l.id ? 'primary' : 'ghost'}
                    onPress={() => setSelectedLayerId(l.id)}
                  />
                ))}
              </View>
              <ThemedText type="smallBold" style={styles.rtlText}>
                דירוג
              </ThemedText>
              <View style={styles.chipRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    label={`${n} ⭐`}
                    size="small"
                    fullWidth={false}
                    variant={selectedRating === n ? 'primary' : 'ghost'}
                    onPress={() => setSelectedRating(n)}
                  />
                ))}
              </View>
              <TextField
                label="איך זה עבד? (אופציונלי)"
                value={ratingNotes}
                onChangeText={setRatingNotes}
                multiline
                style={styles.multiline}
              />
              <Button label="שלח דירוג" onPress={handleAddRating} variant="secondary" />
            </>
          )}

          {ratings.length > 0 && (
            <View style={styles.list}>
              {ratings.map((r) => (
                <View key={r.id} style={styles.ratingRow}>
                  <ThemedText type="small" style={styles.rtlText}>
                    {r.user_name} ({r.layer_name}) — {r.rating} ⭐
                  </ThemedText>
                  {r.notes && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                      {r.notes}
                    </ThemedText>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>

        <ThemedText type="subtitle" style={styles.rtlText}>
          תגובות ({comments.length})
        </ThemedText>
        <Card style={styles.card}>
          <TextField
            label="שאל שאלה או הוסף הערה"
            value={commentBody}
            onChangeText={setCommentBody}
            multiline
            style={styles.multiline}
          />
          <Button label="שלח תגובה" onPress={handleAddComment} variant="secondary" />

          {comments.length > 0 && (
            <View style={styles.list}>
              {comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <ThemedText type="smallBold" style={styles.rtlText}>
                    {c.user_name}
                  </ThemedText>
                  <ThemedText style={styles.rtlText}>{c.body}</ThemedText>
                </View>
              ))}
            </View>
          )}
        </Card>
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
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerBlock: {
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  card: {
    gap: Spacing.two,
  },
  metaGrid: {
    gap: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  ratingRow: {
    gap: Spacing.half,
  },
  commentRow: {
    gap: Spacing.half,
  },
});
