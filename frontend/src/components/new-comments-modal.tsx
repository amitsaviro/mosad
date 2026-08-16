// Compact "what did I miss" popup for comments on activities you
// created -- lists just the activity + comment, no full activity page
// or repository search. Opening it also marks everything read (like a
// WhatsApp notification tray), so the caller should refresh its own
// badge count after onClose.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ActivityCommentNotification, listUnreadActivityComments, markActivityCommentsRead } from '@/api/activities';
import { ApiError } from '@/api/client';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function formatTimestamp(iso: string): string {
  const [datePart, timePart] = iso.split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  const [, m, d] = datePart.split('-');
  return time ? `${d}/${m} ${time}` : `${d}/${m}`;
}

export function NewCommentsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<ActivityCommentNotification[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    listUnreadActivityComments()
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'טעינת ההתראות נכשלה'));
    markActivityCommentsRead().catch(() => {});
  }, [visible]);

  function handleOpenActivity(activityId: string) {
    onClose();
    router.push(`/activities/${activityId}`);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <IconButton glyph="✕" accessibilityLabel="סגור" onPress={onClose} />
            <ThemedText type="subtitle" style={styles.rtlText}>
              תגובות חדשות
            </ThemedText>
          </View>

          {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {items.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                אין תגובות חדשות על הפעילויות שלך.
              </ThemedText>
            ) : (
              items.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.itemCard, { borderColor: theme.border }]}
                  onPress={() => handleOpenActivity(item.activity_id)}
                >
                  <View style={styles.itemHeaderRow}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                      {formatTimestamp(item.created_at)}
                    </ThemedText>
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {item.activity_name}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" style={styles.rtlText}>
                    {item.user_name}: {item.body}
                  </ThemedText>
                </Pressable>
              ))
            )}
          </ScrollView>
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
    maxWidth: 420,
    maxHeight: '75%',
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
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: Spacing.two,
  },
  itemCard: {
    gap: 2,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
