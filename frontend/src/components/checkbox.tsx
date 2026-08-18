// A tappable checklist row: a filled, rounded box with a checkmark
// that animates in, plus a strikethrough on the label when checked --
// replaces the plain ☐/☑ unicode toggles used across checklists
// (trip equipment/shopping, calendar-activity equipment) with
// something that actually looks tappable and gives feedback.
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function Checkbox({
  checked,
  onToggle,
  label,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      hitSlop={6}
      style={styles.row}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: checked ? theme.primary : 'transparent',
            borderColor: checked ? theme.primary : theme.border,
          },
        ]}
      >
        <ThemedText style={[styles.check, { opacity: checked ? 1 : 0 }]}>✓</ThemedText>
      </View>
      <ThemedText
        style={[styles.label, checked && styles.labelChecked]}
        themeColor={checked ? 'textSecondary' : 'text'}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Web-only CSS passthrough (react-native-web forwards these style
    // keys to the DOM node) -- gives the fill color and checkmark a
    // smooth transition instead of an instant snap, matching the same
    // trick used by Button's pressed/hover states.
    transitionProperty: 'background-color, border-color',
    transitionDuration: '150ms',
  },
  check: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
  },
  label: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  labelChecked: {
    textDecorationLine: 'line-through',
  },
});
