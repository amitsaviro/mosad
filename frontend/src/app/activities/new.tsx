import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActivityInput, createActivity, getActivity, updateActivity } from '@/api/activities';
import { ApiError } from '@/api/client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_LOCATIONS,
  ACTIVITY_LOCATION_LABELS,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  GRADE_LABELS,
  GRADE_LEVELS,
} from '@/constants/activity';
import { Spacing } from '@/constants/theme';
import { ActivityCategory, ActivityLocation, ActivityType } from '@/types';

function toNumberOrUndefined(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

// Reused for both creating a brand-new activity and editing an
// existing one (?id=...) -- same fields, same validation, just a
// different API call and a pre-fill step at the end.
export default function NewActivityScreen() {
  const router = useRouter();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = !!editId;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('main');
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [gradeMin, setGradeMin] = useState<number | null>(null);
  const [gradeMax, setGradeMax] = useState<number | null>(null);
  const [duration, setDuration] = useState('');
  const [groupMin, setGroupMin] = useState('');
  const [groupMax, setGroupMax] = useState('');
  const [location, setLocation] = useState<ActivityLocation | null>(null);
  const [equipmentItems, setEquipmentItems] = useState<string[]>([]);
  const [equipmentDraft, setEquipmentDraft] = useState('');
  const [budget, setBudget] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(isEditMode);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const activity = await getActivity(editId);
        setName(activity.name);
        setDescription(activity.description);
        setActivityType(activity.activity_type);
        setCategories(activity.categories);
        setGradeMin(activity.grade_min);
        setGradeMax(activity.grade_max);
        setDuration(activity.duration_minutes?.toString() ?? '');
        setGroupMin(activity.group_size_min?.toString() ?? '');
        setGroupMax(activity.group_size_max?.toString() ?? '');
        setLocation(activity.location);
        setEquipmentItems(activity.equipment);
        setBudget(activity.budget_estimate?.toString() ?? '');
        setContactPhone(activity.contact_phone ?? '');
        setTagsText(activity.tags.join(', '));
        if (activity.attachments.length > 0) {
          setLinkUrl(activity.attachments[0].url);
          setLinkLabel(activity.attachments[0].label ?? '');
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'טעינת הפעילות נכשלה');
      } finally {
        setIsLoadingExisting(false);
      }
    })();
  }, [editId]);

  function toggleCategory(category: ActivityCategory) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  function addEquipmentItem() {
    const trimmed = equipmentDraft.trim();
    if (!trimmed) return;
    setEquipmentItems((prev) => [...prev, trimmed]);
    setEquipmentDraft('');
  }

  function removeEquipmentItem(index: number) {
    setEquipmentItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!name.trim() || !description.trim()) {
      setError('שם ותיאור הם שדות חובה');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const payload: ActivityInput = {
        name: name.trim(),
        description: description.trim(),
        activity_type: activityType,
        categories,
        grade_min: gradeMin ?? undefined,
        grade_max: gradeMax ?? undefined,
        duration_minutes: toNumberOrUndefined(duration),
        group_size_min: toNumberOrUndefined(groupMin),
        group_size_max: toNumberOrUndefined(groupMax),
        location: location ?? undefined,
        equipment: equipmentItems,
        budget_estimate: toNumberOrUndefined(budget),
        contact_phone: contactPhone.trim() || undefined,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        attachments: linkUrl.trim() ? [{ url: linkUrl.trim(), label: linkLabel.trim() || null }] : [],
      };
      const activity = isEditMode
        ? await updateActivity(editId, payload)
        : await createActivity(payload);
      router.replace(`/activities/${activity.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שמירת הפעילות נכשלה');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoadingExisting) {
    return (
      <ThemedView style={styles.flex}>
        <ThemedText style={styles.rtlText}>טוען...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type="title" style={styles.rtlText}>
          {isEditMode ? 'עריכת פעילות' : 'פעילות חדשה'}
        </ThemedText>

        <Card style={styles.card}>
          <TextField label="שם הפעילות" value={name} onChangeText={setName} />
          <TextField
            label="תיאור / הסבר על הפעילות"
            value={description}
            onChangeText={setDescription}
            multiline
            style={styles.multiline}
          />

          <ThemedText type="smallBold" style={styles.rtlText}>
            תפקיד בפעילות
          </ThemedText>
          <View style={styles.chipRow}>
            {ACTIVITY_TYPES.map((t) => (
              <Button
                key={t}
                label={ACTIVITY_TYPE_LABELS[t]}
                size="small"
                fullWidth={false}
                variant={activityType === t ? 'primary' : 'ghost'}
                onPress={() => setActivityType(t)}
              />
            ))}
          </View>

          <ThemedText type="smallBold" style={styles.rtlText}>
            קטגוריית תוכן (ניתן לבחור כמה, או בלי סיווג)
          </ThemedText>
          <View style={styles.chipRow}>
            {ACTIVITY_CATEGORIES.map((category) => (
              <Button
                key={category}
                label={ACTIVITY_CATEGORY_LABELS[category]}
                size="small"
                fullWidth={false}
                variant={categories.includes(category) ? 'primary' : 'ghost'}
                onPress={() => toggleCategory(category)}
              />
            ))}
          </View>

          <ThemedText type="smallBold" style={styles.rtlText}>
            משכבה (לא חובה)
          </ThemedText>
          <View style={styles.chipRow}>
            {GRADE_LEVELS.map((g) => (
              <Button
                key={g}
                label={GRADE_LABELS[g]}
                size="small"
                fullWidth={false}
                variant={gradeMin === g ? 'primary' : 'ghost'}
                onPress={() => setGradeMin(gradeMin === g ? null : g)}
              />
            ))}
          </View>
          <ThemedText type="smallBold" style={styles.rtlText}>
            עד שכבה (לא חובה)
          </ThemedText>
          <View style={styles.chipRow}>
            {GRADE_LEVELS.map((g) => (
              <Button
                key={g}
                label={GRADE_LABELS[g]}
                size="small"
                fullWidth={false}
                variant={gradeMax === g ? 'primary' : 'ghost'}
                onPress={() => setGradeMax(gradeMax === g ? null : g)}
              />
            ))}
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <TextField
                label="כמות משתתפים מינ׳"
                value={groupMin}
                onChangeText={setGroupMin}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.field}>
              <TextField
                label="כמות משתתפים מקס׳"
                value={groupMax}
                onChangeText={setGroupMax}
                keyboardType="numeric"
              />
            </View>
          </View>

          <TextField label="משך (דקות)" value={duration} onChangeText={setDuration} keyboardType="numeric" />

          <ThemedText type="smallBold" style={styles.rtlText}>
            מיקום
          </ThemedText>
          <View style={styles.chipRow}>
            {ACTIVITY_LOCATIONS.map((loc) => (
              <Button
                key={loc}
                label={ACTIVITY_LOCATION_LABELS[loc]}
                size="small"
                fullWidth={false}
                variant={location === loc ? 'primary' : 'ghost'}
                onPress={() => setLocation(location === loc ? null : loc)}
              />
            ))}
          </View>

          <ThemedText type="smallBold" style={styles.rtlText}>
            ציוד נדרש (אופציונלי — אפשר להשאיר ריק אם אין צורך בציוד)
          </ThemedText>
          {equipmentItems.length > 0 && (
            <View style={styles.equipmentList}>
              {equipmentItems.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.equipmentRow}>
                  <ThemedText style={styles.rtlText}>{item}</ThemedText>
                  <IconButton glyph="×" accessibilityLabel="הסר פריט ציוד" onPress={() => removeEquipmentItem(index)} />
                </View>
              ))}
            </View>
          )}
          <View style={styles.row}>
            <View style={styles.field}>
              <TextField
                placeholder="למשל: חבל, טבעות"
                value={equipmentDraft}
                onChangeText={setEquipmentDraft}
                onSubmitEditing={addEquipmentItem}
              />
            </View>
            <Button label="הוסף" variant="secondary" fullWidth={false} onPress={addEquipmentItem} />
          </View>

          <TextField
            label="תקציב משוער לחניך (₪)"
            value={budget}
            onChangeText={setBudget}
            keyboardType="numeric"
          />
          <TextField
            label="תגיות (מופרדות בפסיק)"
            placeholder="חנוכה, קיץ, ספורט"
            value={tagsText}
            onChangeText={setTagsText}
          />
          <TextField
            label="טלפון ליצירת קשר (אופציונלי — למשל מעביר סדנה חיצוני)"
            placeholder="050-1234567"
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
          />

          <ThemedText type="smallBold" style={styles.rtlText}>
            קישור (אופציונלי — מצגת, PDF, שיר)
          </ThemedText>
          <TextField label="כתובת" placeholder="https://" value={linkUrl} onChangeText={setLinkUrl} autoCapitalize="none" />
          <TextField label="תיאור הקישור" value={linkLabel} onChangeText={setLinkLabel} />

          {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

          <Button
            label={isEditMode ? 'שמור שינויים' : 'שמור פעילות'}
            onPress={handleSubmit}
            loading={isSaving}
          />
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    gap: Spacing.three,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  field: {
    flex: 1,
  },
  equipmentList: {
    gap: Spacing.one,
  },
  equipmentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
