// A celebratory pop-up shown once per layer visit when someone's
// birthday is today -- easy to miss a small inline badge in a long
// roster, so this makes sure it can't be missed.
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function BirthdayPopup({ names, onClose }: { names: string[]; onClose: () => void }) {
  const theme = useTheme();
  const visible = names.length > 0;

  const message =
    names.length === 1
      ? `היום יום ההולדת של ${names[0]}!`
      : `היום יום ההולדת של ${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}!`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
          <ThemedText style={styles.emoji}>🎉🎂🎈</ThemedText>
          <ThemedText type="subtitle" style={styles.message}>
            {message}
          </ThemedText>
          <View style={styles.buttonRow}>
            <Button label="יאללה!" onPress={onClose} fullWidth={false} />
          </View>
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
    borderRadius: 24,
    padding: Spacing.five,
    gap: Spacing.three,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 48,
  },
  message: {
    textAlign: 'center',
  },
  buttonRow: {
    marginTop: Spacing.two,
  },
});
