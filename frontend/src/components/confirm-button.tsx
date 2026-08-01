// A destructive action (delete layer, remove member, delete account)
// shouldn't fire on a single tap. react-native-web doesn't implement
// Alert.alert as a real dialog, so instead of a native confirm popup
// this expands inline into "בטוח? [כן] [ביטול]" on first tap.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function ConfirmButton({
  label,
  confirmLabel = 'כן, בטוח',
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <Button label={label} variant="danger" size="small" onPress={() => setIsConfirming(true)} fullWidth={false} />
    );
  }

  return (
    <View style={styles.row}>
      <ThemedText type="small" style={styles.rtlText}>
        בטוח?
      </ThemedText>
      <Button
        label={confirmLabel}
        variant="danger"
        size="small"
        fullWidth={false}
        onPress={() => {
          setIsConfirming(false);
          onConfirm();
        }}
      />
      <Button label="ביטול" variant="ghost" size="small" fullWidth={false} onPress={() => setIsConfirming(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
