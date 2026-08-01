// A minimal icon-only tap target (pencil to edit, etc). Uses plain
// Unicode glyphs instead of an icon library/font to avoid adding a new
// dependency (and the SDK-version risk that comes with it) for one button.
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function IconButton({
  glyph,
  onPress,
  accessibilityLabel,
}: {
  glyph: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <ThemedText style={styles.glyph}>{glyph}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.5,
  },
  glyph: {
    fontSize: 16,
  },
});
