// One chat channel per layer -- polls for new messages while open (no
// websocket infra yet) and marks read on open/poll so the layer page's
// unread badge clears once the counselor has actually seen the feed.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { listChatMessages, markChatRead, sendChatMessage } from '@/api/chat';
import { ApiError } from '@/api/client';
import { getLayer } from '@/api/layers';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ChatMessage, Layer } from '@/types';

const POLL_INTERVAL_MS = 8000;

function formatTimestamp(iso: string): string {
  const [datePart, timePart] = iso.split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  const [y, m, d] = datePart.split('-');
  return time ? `${d}/${m} ${time}` : `${d}/${m}`;
}

export default function LayerChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function loadMessages() {
    try {
      const fetched = await listChatMessages(id);
      setMessages(fetched);
      await markChatRead(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת הצ׳אט נכשלה');
    }
  }

  useEffect(() => {
    getLayer(id)
      .then(setLayer)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'טעינת השכבה נכשלה'));
    loadMessages();
    const interval = setInterval(loadMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSend() {
    if (!draft.trim()) return;
    setError(null);
    setIsSending(true);
    try {
      await sendChatMessage(id, draft.trim());
      setDraft('');
      await loadMessages();
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שליחת ההודעה נכשלה');
    } finally {
      setIsSending(false);
    }
  }

  // Prefer popping back to wherever the user actually came from (so
  // repeated visits here don't keep pushing new "layer" entries onto
  // the stack) -- only push a fresh navigation if there's nowhere to
  // pop back to (e.g. a direct link).
  function handleBackToLayer() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push(`/layer/${id}`);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <View style={styles.headerRow}>
        <ThemedText type="title" style={styles.rtlText}>
          צ׳אט{layer ? ` — ${layer.name}` : ''}
        </ThemedText>
        <Button label="חזרה לשכבה" variant="ghost" size="small" fullWidth={false} onPress={handleBackToLayer} />
      </View>

      {error && <ThemedText themeColor="danger" style={[styles.rtlText, styles.errorPad]}>{error}</ThemedText>}

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            אין עדיין הודעות. תתחילו את השיחה!
          </ThemedText>
        ) : (
          messages.map((m) => {
            const isMine = m.author_id === user?.id;
            return (
              <View key={m.id} style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View
                  style={[
                    styles.bubble,
                    { backgroundColor: isMine ? theme.primary : theme.card, borderColor: theme.border },
                  ]}
                >
                  {!isMine && (
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {m.author_name}
                    </ThemedText>
                  )}
                  <ThemedText style={[styles.rtlText, isMine && { color: theme.onPrimary }]}>{m.body}</ThemedText>
                  <ThemedText
                    type="small"
                    style={[styles.rtlText, styles.timestamp, isMine && { color: theme.onPrimary }]}
                  >
                    {formatTimestamp(m.created_at)}
                  </ThemedText>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={[styles.composerRow, { borderTopColor: theme.border }]}>
        <View style={styles.composerField}>
          <TextField placeholder="כתבו הודעה..." value={draft} onChangeText={setDraft} />
        </View>
        <Button label="שלח" onPress={handleSend} loading={isSending} fullWidth={false} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    padding: Spacing.four,
    paddingBottom: 0,
  },
  errorPad: {
    paddingHorizontal: Spacing.four,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  messagesContent: {
    padding: Spacing.four,
    gap: Spacing.two,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    gap: 2,
    padding: Spacing.two,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timestamp: {
    opacity: 0.7,
  },
  composerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  composerField: {
    flex: 1,
  },
});
