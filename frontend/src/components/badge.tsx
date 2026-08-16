import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

// A fixed amber, not a themed color -- "shared across layers" is a
// meaning-based tag (like a highlighter), not something that should
// shift with light/dark mode the way primary/neutral do. Exported so
// other "shared" indicators (e.g. MonthCalendar's dots) use the same color.
export const SHARED_COLOR = '#B8720A';
const SHARED_BACKGROUND = 'rgba(245, 166, 35, 0.18)';

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'primary' | 'shared';
}) {
  const theme = useTheme();
  const backgroundColor =
    tone === 'primary' ? theme.primary : tone === 'shared' ? SHARED_BACKGROUND : theme.backgroundSelected;
  const color = tone === 'primary' ? theme.onPrimary : tone === 'shared' ? SHARED_COLOR : theme.textSecondary;

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    // 'flex-end' = right edge in this app's visual-RTL convention
    // (row-reverse + right-aligned text, rather than true OS-level
    // RTL) — lines the badge's right edge up with the RTL text above it.
    alignSelf: 'flex-end',
  },
});
