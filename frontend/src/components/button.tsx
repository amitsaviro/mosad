// A single, reusable button so every screen looks and behaves the
// same way (touch target size, pressed feedback, accessibility) —
// instead of ad-hoc <Pressable><Text>...</Text></Pressable> pairs
// scattered across screens with no visual affordance that they're tappable.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const palette = {
    primary: { bg: theme.primary, pressedBg: theme.primaryPressed, text: theme.onPrimary, border: 'transparent' },
    danger: { bg: theme.danger, pressedBg: theme.dangerPressed, text: '#FFFFFF', border: 'transparent' },
    secondary: { bg: 'transparent', pressedBg: theme.backgroundSelected, text: theme.primary, border: theme.primary },
    ghost: { bg: 'transparent', pressedBg: theme.backgroundSelected, text: theme.text, border: theme.border },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      // hitSlop enlarges the tappable area beyond the visible box —
      // helps hit the ~44pt minimum touch target guideline even if the
      // visual button ends up smaller on a compact layout.
      hitSlop={8}
      // `hovered` only exists on react-native-web (mouse pointer) — a
      // no-op on iOS/Android, where there's no such thing as hover.
      style={(state) => {
        const { pressed } = state;
        const hovered = 'hovered' in state ? Boolean((state as { hovered?: boolean }).hovered) : false;
        return [
          styles.base,
          {
            backgroundColor: pressed ? palette.pressedBg : palette.bg,
            borderColor: palette.border,
            borderWidth: variant === 'secondary' || variant === 'ghost' ? 1.5 : 0,
            opacity: isDisabled ? 0.5 : 1,
            alignSelf: fullWidth ? 'stretch' : 'flex-start',
            transform: [{ scale: hovered && !isDisabled ? 1.03 : 1 }],
            // web-only CSS passthrough — react-native-web forwards these
            // style keys straight to the DOM node, giving the scale/color
            // change above a smooth animation instead of an instant jump.
            transitionProperty: 'transform, background-color',
            transitionDuration: '150ms',
            cursor: isDisabled ? 'auto' : 'pointer',
          },
        ];
      }}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <View style={styles.contentRow}>
          <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
