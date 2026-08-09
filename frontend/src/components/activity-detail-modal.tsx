// Quick-reference popup for "what's this activity again?" moments --
// e.g. a counselor mid-session on the weekly schedule who wants the
// full activity write-up without losing their place on the board.
// Read-only: rating/commenting/editing still happen on the full page.
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getActivity } from '@/api/activities';
import { ApiError } from '@/api/client';
import { Badge } from '@/components/badge';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import {
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_LOCATION_LABELS,
  ACTIVITY_TYPE_LABELS,
  GRADE_LABELS,
} from '@/constants/activity';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Activity } from '@/types';

export function ActivityDetailModal({
  activityId,
  onClose,
}: {
  activityId: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activityId) {
      setActivity(null);
      setError(null);
      return;
    }
    getActivity(activityId)
      .then(setActivity)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'טעינת הפעילות נכשלה'));
  }, [activityId]);

  return (
    <Modal visible={!!activityId} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <IconButton glyph="✕" accessibilityLabel="סגור" onPress={onClose} />
            <ThemedText type="subtitle" style={styles.rtlText} numberOfLines={2}>
              {activity ? activity.name : 'פעילות'}
            </ThemedText>
          </View>

          {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

          {!activity && !error && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              טוען...
            </ThemedText>
          )}

          {activity && (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <View style={styles.chipRow}>
                <Badge label={ACTIVITY_TYPE_LABELS[activity.activity_type]} tone="primary" />
                {activity.categories.map((c) => (
                  <Badge key={c} label={ACTIVITY_CATEGORY_LABELS[c]} />
                ))}
              </View>

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
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metaGrid: {
    gap: Spacing.one,
  },
  list: {
    gap: Spacing.one,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: Spacing.two,
  },
});
