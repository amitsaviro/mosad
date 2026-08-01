// Shared "name with a pencil next to it" pattern used for institution
// name, layer name, and participant name — tap the pencil, it turns
// into a text field with save/cancel, instead of three separate
// bespoke implementations of the same interaction.
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { ThemedText, ThemedTextProps } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function EditableText({
  value,
  onSave,
  canEdit,
  textType = 'default',
}: {
  value: string;
  onSave: (newValue: string) => void | Promise<void>;
  canEdit: boolean;
  textType?: ThemedTextProps['type'];
}) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!canEdit) {
    return (
      <ThemedText type={textType} style={styles.rtlText}>
        {value}
      </ThemedText>
    );
  }

  if (!isEditing) {
    return (
      <View style={styles.row}>
        <IconButton
          glyph="✏️"
          accessibilityLabel="ערוך"
          onPress={() => {
            setDraft(value);
            setIsEditing(true);
          }}
        />
        <ThemedText type={textType} style={styles.rtlText}>
          {value}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <IconButton
        glyph="✓"
        accessibilityLabel="שמור"
        onPress={() => {
          setIsEditing(false);
          if (draft.trim() && draft.trim() !== value) {
            onSave(draft.trim());
          }
        }}
      />
      <IconButton glyph="✕" accessibilityLabel="ביטול" onPress={() => setIsEditing(false)} />
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoFocus
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.primary },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
