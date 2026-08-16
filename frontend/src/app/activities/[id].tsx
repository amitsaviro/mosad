import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { addComment, addRating, deleteActivity, getActivity, listComments, listRatings } from '@/api/activities';
import { listActivityMessages, listActivityMessageThreads, sendActivityMessage } from '@/api/activityMessages';
import { createCalendarActivity } from '@/api/calendarActivities';
import { ApiError } from '@/api/client';
import { listLayers } from '@/api/layers';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_LOCATION_LABELS,
  ACTIVITY_TYPE_LABELS,
  GRADE_LABELS,
} from '@/constants/activity';
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from '@/constants/schedule';
import { Spacing } from '@/constants/theme';
import { Activity, ActivityComment, ActivityMessage, ActivityMessageThread, ActivityRating, DayOfWeek, Layer } from '@/types';
import { addDaysUtc, formatIsoDate, parseIsoDate, startOfWeekIso, toIsraeliDate } from '@/utils/calendar';

type PickParams = {
  id: string;
  pickForLayerId?: string;
  pickTime?: string;
  pickCalendarDate?: string;
  pickShareLayerIds?: string;
};

function toApiTime(text: string): string | null {
  const match = text.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const [, hours, minutes] = match;
  return `${hours.padStart(2, '0')}:${minutes}:00`;
}

// This real current week's date for a given weekday -- used by the
// standalone "add to schedule" form below, which (unlike the weekly
// grid on the layer's own schedule page) isn't tied to any specific
// week being browsed, so it always targets the actual current week.
function currentWeekDateFor(dayOfWeek: DayOfWeek): string {
  const start = parseIsoDate(startOfWeekIso(0));
  return formatIsoDate(addDaysUtc(start, DAYS_OF_WEEK.indexOf(dayOfWeek)));
}

export default function ActivityDetailScreen() {
  const { id, pickForLayerId, pickTime, pickCalendarDate, pickShareLayerIds } =
    useLocalSearchParams<PickParams>();
  const router = useRouter();
  const isPicking = !!pickForLayerId && !!pickCalendarDate;
  const shareLayerIds = pickShareLayerIds ? pickShareLayerIds.split(',').filter(Boolean) : [];
  const [isAddingToSlot, setIsAddingToSlot] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [ratings, setRatings] = useState<ActivityRating[]>([]);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [myLayers, setMyLayers] = useState<Layer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [ratingNotes, setRatingNotes] = useState('');
  const [commentBody, setCommentBody] = useState('');

  const [scheduleLayerIds, setScheduleLayerIds] = useState<string[]>([]);
  const [scheduleDay, setScheduleDay] = useState<DayOfWeek>('sunday');
  const [scheduleTimeText, setScheduleTimeText] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);

  // "Ask the creator" thread(s). A non-creator only ever has one
  // thread (with the creator); the creator may have several askers and
  // needs to pick which thread they're viewing/replying to.
  const [threads, setThreads] = useState<ActivityMessageThread[]>([]);
  const [selectedAskerId, setSelectedAskerId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ActivityMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

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

  async function loadMessages() {
    if (!activity) return;
    setMessagesError(null);
    try {
      if (activity.can_manage) {
        const fetchedThreads = await listActivityMessageThreads(activity.id);
        setThreads(fetchedThreads);
        if (selectedAskerId) {
          setThreadMessages(await listActivityMessages(activity.id, selectedAskerId));
        }
      } else {
        setThreadMessages(await listActivityMessages(activity.id));
      }
    } catch (err) {
      setMessagesError(err instanceof ApiError ? err.message : 'טעינת השאלות נכשלה');
    }
  }

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id, activity?.can_manage, selectedAskerId]);

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

  async function handleSendMessage() {
    if (!activity || !messageDraft.trim()) return;
    if (activity.can_manage && !selectedAskerId) return;
    setIsSendingMessage(true);
    setMessagesError(null);
    try {
      await sendActivityMessage(activity.id, messageDraft.trim(), selectedAskerId ?? undefined);
      setMessageDraft('');
      await loadMessages();
    } catch (err) {
      setMessagesError(err instanceof ApiError ? err.message : 'שליחת ההודעה נכשלה');
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleAddToPickedSlot() {
    if (!pickForLayerId || !pickCalendarDate) return;
    setIsAddingToSlot(true);
    setSlotError(null);
    try {
      for (const layerId of [pickForLayerId, ...shareLayerIds]) {
        await createCalendarActivity(layerId, {
          activity_id: id,
          date: pickCalendarDate,
          start_time: pickTime || undefined,
        });
      }
      router.replace(`/layer/${pickForLayerId}/schedule`);
    } catch (err) {
      setSlotError(err instanceof ApiError ? err.message : 'השיבוץ נכשל');
      setIsAddingToSlot(false);
    }
  }

  function toggleScheduleLayer(layerId: string) {
    setScheduleLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((l) => l !== layerId) : [...prev, layerId]
    );
  }

  async function handleAddToSchedule() {
    setScheduleMessage(null);
    if (scheduleLayerIds.length === 0) {
      setScheduleMessage('יש לבחור לפחות שכבה אחת');
      return;
    }
    const apiTime = toApiTime(scheduleTimeText);
    if (!apiTime) {
      setScheduleMessage('יש להזין שעה בפורמט תקין, למשל 16:00');
      return;
    }
    setIsScheduling(true);
    const layerNameById = new Map(myLayers.map((l) => [l.id, l.name]));
    const failures: string[] = [];
    let successCount = 0;
    for (const layerId of scheduleLayerIds) {
      try {
        await createCalendarActivity(layerId, {
          activity_id: id,
          date: currentWeekDateFor(scheduleDay),
          start_time: apiTime,
          notes: scheduleNotes.trim() || undefined,
        });
        successCount += 1;
      } catch (err) {
        const layerName = layerNameById.get(layerId) ?? layerId;
        const message = err instanceof ApiError ? err.message : 'השיבוץ נכשל';
        failures.push(`${layerName}: ${message}`);
      }
    }
    setIsScheduling(false);
    if (successCount > 0) {
      setScheduleLayerIds([]);
      setScheduleTimeText('');
      setScheduleNotes('');
    }
    if (failures.length === 0) {
      setScheduleMessage(`שובץ בהצלחה ל-${successCount} שכבות`);
    } else {
      setScheduleMessage(
        `${successCount > 0 ? `שובץ ל-${successCount} שכבות. ` : ''}נכשל עבור: ${failures.join('; ')}`
      );
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
          {activity.categories.length > 0 ? (
            <View style={styles.chipRow}>
              {activity.categories.map((c) => (
                <Badge key={c} label={ACTIVITY_CATEGORY_LABELS[c]} />
              ))}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              ללא סיווג תוכן מיוחד
            </ThemedText>
          )}
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

        {isPicking && (
          <Card style={styles.pickBanner}>
            <ThemedText type="smallBold" style={styles.rtlText}>
              {`שיבוץ לתאריך ${toIsraeliDate(pickCalendarDate!)}${
                pickTime ? ` בשעה ${pickTime.slice(0, 5)}` : ''
              }${shareLayerIds.length > 0 ? ` (משותפת עם ${shareLayerIds.length} שכבות נוספות)` : ''}`}
            </ThemedText>
            {slotError && <ThemedText themeColor="danger" style={styles.rtlText}>{slotError}</ThemedText>}
            <Button label="+ הוסף למשבצת שנבחרה" onPress={handleAddToPickedSlot} loading={isAddingToSlot} />
          </Card>
        )}

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        <Card style={styles.card}>
          <ThemedText style={styles.rtlText}>{activity.description}</ThemedText>

          <View style={styles.metaGrid}>
            {activity.location && (
              <ThemedText type="small" style={styles.rtlText}>
                📍 מיקום: {ACTIVITY_LOCATION_LABELS[activity.location]}
              </ThemedText>
            )}
            {activity.duration_minutes && (
              <ThemedText type="small" style={styles.rtlText}>
                ⏱ משך: {activity.duration_minutes} דקות
              </ThemedText>
            )}
            {(activity.grade_min || activity.grade_max) && (
              <ThemedText type="small" style={styles.rtlText}>
                🎓 שכבות: {activity.grade_min ? GRADE_LABELS[activity.grade_min] : '?'}-
                {activity.grade_max ? GRADE_LABELS[activity.grade_max] : '?'}
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
            {activity.contact_phone && (
              <ThemedText
                type="small"
                style={styles.rtlText}
                onPress={() => Linking.openURL(`tel:${activity.contact_phone}`)}
              >
                📞 ליצירת קשר: {activity.contact_phone}
              </ThemedText>
            )}
          </View>

          <ThemedText type="smallBold" style={styles.rtlText}>
            ציוד נדרש
          </ThemedText>
          {activity.equipment.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              לא נדרש ציוד מיוחד לפעילות זו
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {activity.equipment.map((item) => (
                <ThemedText key={item} type="small" style={styles.rtlText}>
                  • {item}
                </ThemedText>
              ))}
            </View>
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

        {myLayers.length > 0 && (
          <>
            <ThemedText type="subtitle" style={styles.rtlText}>
              הוספה ללוח
            </ThemedText>
            <Card style={styles.card}>
              <ThemedText type="smallBold" style={styles.rtlText}>
                לאיזו שכבה להוסיף? (ניתן לבחור כמה)
              </ThemedText>
              <View style={styles.chipRow}>
                {myLayers.map((l) => (
                  <Button
                    key={l.id}
                    label={l.name}
                    size="small"
                    fullWidth={false}
                    variant={scheduleLayerIds.includes(l.id) ? 'primary' : 'ghost'}
                    onPress={() => toggleScheduleLayer(l.id)}
                  />
                ))}
              </View>

              <ThemedText type="smallBold" style={styles.rtlText}>
                יום
              </ThemedText>
              <View style={styles.chipRow}>
                {DAYS_OF_WEEK.map((d) => (
                  <Button
                    key={d}
                    label={DAY_OF_WEEK_LABELS[d]}
                    size="small"
                    fullWidth={false}
                    variant={scheduleDay === d ? 'primary' : 'ghost'}
                    onPress={() => setScheduleDay(d)}
                  />
                ))}
              </View>

              <TextField
                label="שעה (למשל 16:00)"
                placeholder="16:00"
                value={scheduleTimeText}
                onChangeText={setScheduleTimeText}
              />
              <TextField label="הערות (אופציונלי)" value={scheduleNotes} onChangeText={setScheduleNotes} />

              {scheduleMessage && <ThemedText style={styles.rtlText}>{scheduleMessage}</ThemedText>}

              <Button label="הוסף ללוח" onPress={handleAddToSchedule} loading={isScheduling} variant="secondary" />
            </Card>
          </>
        )}

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

        <ThemedText type="subtitle" style={styles.rtlText}>
          📩 שאלות למעלה הפעילות
        </ThemedText>
        <Card style={styles.card}>
          {messagesError && <ThemedText themeColor="danger" style={styles.rtlText}>{messagesError}</ThemedText>}

          {activity.can_manage ? (
            <>
              {threads.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  אף אחד עדיין לא שאל שאלה על הפעילות הזו.
                </ThemedText>
              ) : (
                <View style={styles.chipRow}>
                  {threads.map((t) => (
                    <Button
                      key={t.other_user_id}
                      label={t.other_user_name}
                      size="small"
                      fullWidth={false}
                      variant={selectedAskerId === t.other_user_id ? 'primary' : 'ghost'}
                      onPress={() => setSelectedAskerId(t.other_user_id)}
                    />
                  ))}
                </View>
              )}
              {selectedAskerId && (
                <View style={styles.list}>
                  {threadMessages.map((m) => (
                    <View key={m.id} style={styles.commentRow}>
                      <ThemedText type="smallBold" style={styles.rtlText}>
                        {m.sender_name}
                      </ThemedText>
                      <ThemedText style={styles.rtlText}>{m.body}</ThemedText>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.list}>
              {threadMessages.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  שאלו את {activity.creator_name} שאלה על הפעילות הזו.
                </ThemedText>
              ) : (
                threadMessages.map((m) => (
                  <View key={m.id} style={styles.commentRow}>
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {m.sender_name}
                    </ThemedText>
                    <ThemedText style={styles.rtlText}>{m.body}</ThemedText>
                  </View>
                ))
              )}
            </View>
          )}

          {(!activity.can_manage || selectedAskerId) && (
            <>
              <TextField
                label={activity.can_manage ? 'תשובה' : `שאלה ל${activity.creator_name}`}
                value={messageDraft}
                onChangeText={setMessageDraft}
                multiline
                style={styles.multiline}
              />
              <Button label="שלח" onPress={handleSendMessage} loading={isSendingMessage} variant="secondary" />
            </>
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
  pickBanner: {
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
