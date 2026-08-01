import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' }) {
  const theme = useTheme();
  const backgroundColor = tone === 'primary' ? theme.primary : theme.backgroundSelected;
  const color = tone === 'primary' ? theme.onPrimary : theme.textSecondary;

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
