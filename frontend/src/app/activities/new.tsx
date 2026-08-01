import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActivityInput, createActivity, getActivity, updateActivity } from '@/api/activities';
import { ApiError } from '@/api/client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from '@/constants/activity';
import { Spacing } from '@/constants/theme';
import { ActivityType } from '@/types';

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
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [duration, setDuration] = useState('');
  const [groupMin, setGroupMin] = useState('');
  const [groupMax, setGroupMax] = useState('');
  const [location, setLocation] = useState('');
  const [equipment, setEquipment] = useState('');
  const [budget, setBudget] = useState('');
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
        setAgeMin(activity.age_min?.toString() ?? '');
        setAgeMax(activity.age_max?.toString() ?? '');
        setDuration(activity.duration_minutes?.toString() ?? '');
        setGroupMin(activity.group_size_min?.toString() ?? '');
        setGroupMax(activity.group_size_max?.toString() ?? '');
        setLocation(activity.location ?? '');
        setEquipment(activity.required_equipment ?? '');
        setBudget(activity.budget_estimate?.toString() ?? '');
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
        age_min: toNumberOrUndefined(ageMin),
        age_max: toNumberOrUndefined(ageMax),
        duration_minutes: toNumberOrUndefined(duration),
        group_size_min: toNumberOrUndefined(groupMin),
        group_size_max: toNumberOrUndefined(groupMax),
        location: location.trim() || undefined,
        required_equipment: equipment.trim() || undefined,
        budget_estimate: toNumberOrUndefined(budget),
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
            סוג
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

          <View style={styles.row}>
            <View style={styles.field}>
              <TextField label="גיל מינימלי" value={ageMin} onChangeText={setAgeMin} keyboardType="numeric" />
            </View>
            <View style={styles.field}>
              <TextField label="גיל מקסימלי" value={ageMax} onChangeText={setAgeMax} keyboardType="numeric" />
            </View>
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
          <TextField label="מיקום" placeholder="בחוץ / באולם / בכיתה" value={location} onChangeText={setLocation} />
          <TextField label="ציוד נדרש" value={equipment} onChangeText={setEquipment} multiline style={styles.multiline} />
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
  },
  field: {
    flex: 1,
  },
});
