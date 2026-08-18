// Full trip file (תיק טיול): itinerary, equipment/shopping checklists,
// document links, and the pre-trip "confirmed for the bus" roster.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { listLayers } from '@/api/layers';
import {
  addTripContact,
  addTripDocument,
  addTripEquipmentItem,
  addTripScheduleItem,
  addTripShoppingItem,
  deleteTrip,
  deleteTripContact,
  deleteTripDocument,
  deleteTripEquipmentItem,
  deleteTripScheduleItem,
  deleteTripShoppingItem,
  getTrip,
  setTripConfirmation,
  setTripMeal,
  shareTrip,
  toggleTripEquipmentItem,
  toggleTripShoppingItem,
  unshareTrip,
  updateTrip,
} from '@/api/trips';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Checkbox } from '@/components/checkbox';
import { ConfirmButton } from '@/components/confirm-button';
import { EditableText } from '@/components/editable-text';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Layer, MealType, Trip } from '@/types';
import { addDaysUtc, formatIsoDate, fromIsraeliDate, parseIsoDate, toIsraeliDate } from '@/utils/calendar';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
};

function toApiTime(text: string): string | null {
  const match = text.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const [, hours, minutes] = match;
  return `${hours.padStart(2, '0')}:${minutes}:00`;
}

function displayTime(apiTime: string): string {
  return apiTime.slice(0, 5);
}

function mealKey(date: string, mealType: MealType): string {
  return `${date}__${mealType}`;
}

// Every calendar date from start_date to end_date inclusive -- the
// meal plan gets one card per day, breakfast/lunch/dinner each.
function tripDateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  let cur = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  while (cur.getTime() <= end.getTime()) {
    dates.push(formatIsoDate(cur));
    cur = addDaysUtc(cur, 1);
  }
  return dates;
}

export default function TripDetailScreen() {
  const { id, tripId } = useLocalSearchParams<{ id: string; tripId: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [otherLayers, setOtherLayers] = useState<Layer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [destinationDraft, setDestinationDraft] = useState('');
  const [startDateDraft, setStartDateDraft] = useState('');
  const [endDateDraft, setEndDateDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const [equipmentLabel, setEquipmentLabel] = useState('');
  const [shoppingLabel, setShoppingLabel] = useState('');
  const [docLabel, setDocLabel] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [contactLabel, setContactLabel] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [mealDrafts, setMealDrafts] = useState<Record<string, string>>({});
  const [isSavingMealDate, setIsSavingMealDate] = useState<string | null>(null);

  async function loadData() {
    setError(null);
    try {
      const [fetched, fetchedLayers] = await Promise.all([getTrip(tripId), listLayers()]);
      setTrip(fetched);
      setDestinationDraft(fetched.destination ?? '');
      setStartDateDraft(toIsraeliDate(fetched.start_date));
      setEndDateDraft(toIsraeliDate(fetched.end_date));
      setNotesDraft(fetched.notes ?? '');
      const sharedIds = new Set([fetched.layer_id, ...fetched.shared_layers.map((l) => l.id)]);
      setOtherLayers(fetchedLayers.filter((l) => l.can_manage && !sharedIds.has(l.id)));
      const draftMap: Record<string, string> = {};
      for (const meal of fetched.meals) {
        draftMap[mealKey(meal.date, meal.meal_type)] = meal.description;
      }
      setMealDrafts(draftMap);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת תיק הטיול נכשלה');
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Always push straight to a known route instead of router.back():
  // this screen sits 3 levels deep (layer -> trips list -> trip file),
  // the deepest nesting in the app, and canGoBack()/back() get
  // unreliable that deep on web (e.g. after a refresh) -- they can
  // bounce back to this very screen instead of going up a level,
  // trapping the user in a loop.
  function handleBackToTrips() {
    router.push(`/layer/${id}/trips`);
  }

  function handleBackToLayer() {
    router.push(`/layer/${id}`);
  }

  async function handleRenameTrip(name: string) {
    try {
      await updateTrip(tripId, { name });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שינוי השם נכשל');
    }
  }

  async function handleSaveDetails() {
    const startIso = fromIsraeliDate(startDateDraft);
    const endIso = fromIsraeliDate(endDateDraft);
    if (!startIso || !endIso) {
      setError('תאריך לא תקין, למשל 14/12/2026');
      return;
    }
    setError(null);
    setIsSavingDetails(true);
    try {
      await updateTrip(tripId, {
        destination: destinationDraft.trim() || undefined,
        start_date: startIso,
        end_date: endIso,
        notes: notesDraft.trim() || undefined,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'השמירה נכשלה');
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function handleDeleteTrip() {
    try {
      await deleteTrip(tripId);
      router.replace(`/layer/${id}/trips`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'מחיקת הטיול נכשלה');
    }
  }

  async function handleAddEquipment() {
    if (!equipmentLabel.trim()) return;
    try {
      await addTripEquipmentItem(tripId, equipmentLabel.trim());
      setEquipmentLabel('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    }
  }

  async function handleToggleEquipment(itemId: string, checked: boolean) {
    try {
      await toggleTripEquipmentItem(tripId, itemId, checked);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
    }
  }

  async function handleDeleteEquipment(itemId: string) {
    try {
      await deleteTripEquipmentItem(tripId, itemId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  async function handleAddShopping() {
    if (!shoppingLabel.trim()) return;
    try {
      await addTripShoppingItem(tripId, shoppingLabel.trim());
      setShoppingLabel('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    }
  }

  async function handleToggleShopping(itemId: string, checked: boolean) {
    try {
      await toggleTripShoppingItem(tripId, itemId, checked);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
    }
  }

  async function handleDeleteShopping(itemId: string) {
    try {
      await deleteTripShoppingItem(tripId, itemId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  async function handleAddDocument() {
    if (!docLabel.trim() || !docUrl.trim()) {
      setError('יש למלא שם וקישור למסמך');
      return;
    }
    setError(null);
    try {
      await addTripDocument(tripId, docLabel.trim(), docUrl.trim());
      setDocLabel('');
      setDocUrl('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    }
  }

  async function handleDeleteDocument(documentId: string) {
    try {
      await deleteTripDocument(tripId, documentId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  async function handleAddSchedule() {
    if (!scheduleTitle.trim()) {
      setError('יש למלא כותרת לפריט הלו״ז');
      return;
    }
    const apiTime = scheduleTime.trim() ? toApiTime(scheduleTime) : undefined;
    if (scheduleTime.trim() && !apiTime) {
      setError('שעה לא תקינה, למשל 08:00');
      return;
    }
    setError(null);
    try {
      await addTripScheduleItem(tripId, {
        title: scheduleTitle.trim(),
        time: apiTime ?? undefined,
        notes: scheduleNotes.trim() || undefined,
      });
      setScheduleTime('');
      setScheduleTitle('');
      setScheduleNotes('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    }
  }

  async function handleDeleteSchedule(itemId: string) {
    try {
      await deleteTripScheduleItem(tripId, itemId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  async function handleToggleConfirmation(participantId: string, confirmed: boolean) {
    try {
      await setTripConfirmation(tripId, participantId, confirmed);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'העדכון נכשל');
    }
  }

  async function handleShareLayer(layerId: string) {
    try {
      await shareTrip(tripId, layerId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'השיתוף נכשל');
    }
  }

  async function handleUnshareLayer(layerId: string) {
    try {
      await unshareTrip(tripId, layerId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הסרת השיתוף נכשלה');
    }
  }

  async function handleAddContact() {
    if (!contactLabel.trim() || !contactPhone.trim()) {
      setError('יש למלא תיאור ומספר טלפון');
      return;
    }
    setError(null);
    try {
      await addTripContact(tripId, contactLabel.trim(), contactPhone.trim());
      setContactLabel('');
      setContactPhone('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההוספה נכשלה');
    }
  }

  async function handleDeleteContact(contactId: string) {
    try {
      await deleteTripContact(tripId, contactId);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
    }
  }

  async function handleSaveMealsForDate(date: string) {
    setError(null);
    setIsSavingMealDate(date);
    try {
      for (const mealType of MEAL_TYPES) {
        await setTripMeal(tripId, date, mealType, mealDrafts[mealKey(date, mealType)] ?? '');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שמירת התפריט נכשלה');
    } finally {
      setIsSavingMealDate(null);
    }
  }

  if (!trip) {
    return (
      <ThemedView style={styles.flex}>
        <ThemedText style={styles.rtlText}>{error ?? 'טוען...'}</ThemedText>
      </ThemedView>
    );
  }

  const confirmedCount = trip.confirmations.filter((c) => c.confirmed).length;
  const dateRangeLabel =
    trip.start_date === trip.end_date
      ? toIsraeliDate(trip.start_date)
      : `${toIsraeliDate(trip.start_date)} – ${toIsraeliDate(trip.end_date)}`;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBlock}>
          <View style={styles.headerRow}>
            <EditableText
              value={trip.name}
              canEdit={trip.can_manage}
              textType="title"
              onSave={handleRenameTrip}
            />
            <View style={styles.headerBackButtons}>
              <Button label="חזרה לתיקי הטיול" variant="ghost" size="small" fullWidth={false} onPress={handleBackToTrips} />
              <Button label="חזרה לשכבה" variant="ghost" size="small" fullWidth={false} onPress={handleBackToLayer} />
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            {dateRangeLabel}
            {trip.destination ? ` · ${trip.destination}` : ''} · נוצר על ידי {trip.created_by_name}
          </ThemedText>
          {trip.can_delete && <ConfirmButton label="מחק תיק טיול" onConfirm={handleDeleteTrip} />}
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        <ThemedText type="subtitle" style={styles.rtlText}>
          🔗 שכבות משותפות
        </ThemedText>
        <Card style={styles.card}>
          <View style={styles.chipRow}>
            <Badge label={trip.layer_name} tone="primary" />
            {trip.shared_layers.map((l) => (
              <View key={l.id} style={styles.sharedLayerChip}>
                <Badge label={l.name} tone="shared" />
                {trip.can_manage && (
                  <ConfirmButton label="הסר שיתוף" onConfirm={() => handleUnshareLayer(l.id)} />
                )}
              </View>
            ))}
          </View>
          {trip.can_manage && otherLayers.length > 0 && (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                שתפו את תיק הטיול עם שכבה נוספת (למשל טיול לכמה שכבות באותו אוטובוס):
              </ThemedText>
              <View style={styles.chipRow}>
                {otherLayers.map((l) => (
                  <Button
                    key={l.id}
                    label={`+ ${l.name}`}
                    size="small"
                    fullWidth={false}
                    variant="ghost"
                    onPress={() => handleShareLayer(l.id)}
                  />
                ))}
              </View>
            </>
          )}
        </Card>

        {trip.can_manage && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              פרטי הטיול
            </ThemedText>
            <TextField label="יעד" value={destinationDraft} onChangeText={setDestinationDraft} />
            <TextField
              label="תאריך התחלה (יום/חודש/שנה)"
              value={startDateDraft}
              onChangeText={setStartDateDraft}
            />
            <TextField label="תאריך סיום (יום/חודש/שנה)" value={endDateDraft} onChangeText={setEndDateDraft} />
            <TextField
              label="הערות כלליות"
              value={notesDraft}
              onChangeText={setNotesDraft}
              multiline
              style={styles.multiline}
            />
            <Button label="שמור פרטים" onPress={handleSaveDetails} loading={isSavingDetails} variant="secondary" />
          </Card>
        )}
        {!trip.can_manage && trip.notes && (
          <Card style={styles.card}>
            <ThemedText style={styles.rtlText}>{trip.notes}</ThemedText>
          </Card>
        )}

        <ThemedText type="subtitle" style={styles.rtlText}>
          🕒 לו״ז הטיול
        </ThemedText>
        <Card style={styles.card}>
          {trip.schedule.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              עדיין אין לו״ז לטיול הזה.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {trip.schedule.map((item) => (
                <View key={item.id} style={styles.scheduleRow}>
                  <View style={styles.scheduleTextBlock}>
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {item.time ? `${displayTime(item.time)} — ` : ''}
                      {item.title}
                    </ThemedText>
                    {item.notes && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                        {item.notes}
                      </ThemedText>
                    )}
                  </View>
                  {trip.can_manage && (
                    <ConfirmButton label="הסר" onConfirm={() => handleDeleteSchedule(item.id)} />
                  )}
                </View>
              ))}
            </View>
          )}
          {trip.can_manage && (
            <View style={styles.addRow}>
              <View style={styles.timeField}>
                <TextField placeholder="08:00" label="שעה (אופציונלי)" value={scheduleTime} onChangeText={setScheduleTime} />
              </View>
              <View style={styles.grow}>
                <TextField placeholder="למשל: יציאה מבית הספר" label="כותרת" value={scheduleTitle} onChangeText={setScheduleTitle} />
              </View>
            </View>
          )}
          {trip.can_manage && (
            <>
              <TextField label="הערה (אופציונלי)" value={scheduleNotes} onChangeText={setScheduleNotes} />
              <Button label="הוסף ללו״ז" onPress={handleAddSchedule} variant="secondary" />
            </>
          )}
        </Card>

        <ThemedText type="subtitle" style={styles.rtlText}>
          🎒 ציוד
        </ThemedText>
        <Card style={styles.card}>
          {trip.equipment.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              עדיין אין פריטי ציוד ברשימה.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {trip.equipment.map((item) => (
                <View key={item.id} style={styles.checklistRow}>
                  <Checkbox
                    checked={item.checked}
                    label={item.label}
                    disabled={!trip.can_manage}
                    onToggle={() => handleToggleEquipment(item.id, !item.checked)}
                  />
                  {trip.can_manage && (
                    <ConfirmButton label="הסר" onConfirm={() => handleDeleteEquipment(item.id)} />
                  )}
                </View>
              ))}
            </View>
          )}
          {trip.can_manage && (
            <View style={styles.addRow}>
              <View style={styles.grow}>
                <TextField placeholder="למשל: שקי שינה" value={equipmentLabel} onChangeText={setEquipmentLabel} />
              </View>
              <Button label="הוסף" size="small" fullWidth={false} onPress={handleAddEquipment} />
            </View>
          )}
        </Card>

        <ThemedText type="subtitle" style={styles.rtlText}>
          🛒 רשימת קניות
        </ThemedText>
        <Card style={styles.card}>
          {trip.shopping.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              עדיין אין פריטים ברשימת הקניות.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {trip.shopping.map((item) => (
                <View key={item.id} style={styles.checklistRow}>
                  <Checkbox
                    checked={item.checked}
                    label={item.label}
                    disabled={!trip.can_manage}
                    onToggle={() => handleToggleShopping(item.id, !item.checked)}
                  />
                  {trip.can_manage && (
                    <ConfirmButton label="הסר" onConfirm={() => handleDeleteShopping(item.id)} />
                  )}
                </View>
              ))}
            </View>
          )}
          {trip.can_manage && (
            <View style={styles.addRow}>
              <View style={styles.grow}>
                <TextField placeholder="למשל: חטיפים" value={shoppingLabel} onChangeText={setShoppingLabel} />
              </View>
              <Button label="הוסף" size="small" fullWidth={false} onPress={handleAddShopping} />
            </View>
          )}
        </Card>

        <ThemedText type="subtitle" style={styles.rtlText}>
          📎 אישורים ומסמכים
        </ThemedText>
        <Card style={styles.card}>
          {trip.documents.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              עדיין לא הועלו מסמכים (קישורים לאישורי הורים, ביטוח וכו').
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {trip.documents.map((doc) => (
                <View key={doc.id} style={styles.checklistRow}>
                  <ThemedText type="linkPrimary" style={styles.rtlText} onPress={() => Linking.openURL(doc.url)}>
                    {doc.label}
                  </ThemedText>
                  {trip.can_manage && (
                    <ConfirmButton label="הסר" onConfirm={() => handleDeleteDocument(doc.id)} />
                  )}
                </View>
              ))}
            </View>
          )}
          {trip.can_manage && (
            <>
              <TextField label="שם המסמך" placeholder="למשל: אישור הורים" value={docLabel} onChangeText={setDocLabel} />
              <TextField label="קישור" placeholder="https://..." value={docUrl} onChangeText={setDocUrl} />
              <Button label="הוסף מסמך" onPress={handleAddDocument} variant="secondary" />
            </>
          )}
        </Card>

        <ThemedText type="subtitle" style={styles.rtlText}>
          📞 אנשי קשר חשובים
        </ThemedText>
        <Card style={styles.card}>
          {trip.contacts.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              עדיין אין אנשי קשר (למשל מנהל אטרקציה, נהג אוטובוס).
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {trip.contacts.map((contact) => (
                <View key={contact.id} style={styles.checklistRow}>
                  <ThemedText
                    type="linkPrimary"
                    style={styles.rtlText}
                    onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                  >
                    {contact.label}: {contact.phone}
                  </ThemedText>
                  {trip.can_manage && (
                    <ConfirmButton label="הסר" onConfirm={() => handleDeleteContact(contact.id)} />
                  )}
                </View>
              ))}
            </View>
          )}
          {trip.can_manage && (
            <View style={styles.addRow}>
              <View style={styles.grow}>
                <TextField placeholder="למשל: נהג האוטובוס" label="תיאור" value={contactLabel} onChangeText={setContactLabel} />
              </View>
              <View style={styles.grow}>
                <TextField placeholder="050-1234567" label="טלפון" value={contactPhone} onChangeText={setContactPhone} />
              </View>
            </View>
          )}
          {trip.can_manage && <Button label="הוסף איש קשר" onPress={handleAddContact} variant="secondary" />}
        </Card>

        <ThemedText type="subtitle" style={styles.rtlText}>
          🍽️ תפריטים
        </ThemedText>
        <View style={styles.list}>
          {tripDateRange(trip.start_date, trip.end_date).map((date) => (
            <Card key={date} style={styles.card}>
              <ThemedText type="smallBold" style={styles.rtlText}>
                {toIsraeliDate(date)}
              </ThemedText>
              {MEAL_TYPES.map((mealType) =>
                trip.can_manage ? (
                  <TextField
                    key={mealType}
                    label={MEAL_LABELS[mealType]}
                    placeholder="למשל: כריכים וירקות"
                    value={mealDrafts[mealKey(date, mealType)] ?? ''}
                    onChangeText={(text) =>
                      setMealDrafts((prev) => ({ ...prev, [mealKey(date, mealType)]: text }))
                    }
                  />
                ) : (
                  <ThemedText key={mealType} type="small" style={styles.rtlText}>
                    {MEAL_LABELS[mealType]}: {mealDrafts[mealKey(date, mealType)] || '—'}
                  </ThemedText>
                )
              )}
              {trip.can_manage && (
                <Button
                  label="שמור תפריט היום"
                  size="small"
                  variant="secondary"
                  loading={isSavingMealDate === date}
                  onPress={() => handleSaveMealsForDate(date)}
                />
              )}
            </Card>
          ))}
        </View>

        <ThemedText type="subtitle" style={styles.rtlText}>
          ✅ אישורי הגעה ({confirmedCount}/{trip.confirmations.length})
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
          לוודא לפני היציאה שכל חניך שאמור להיות באוטובוס באמת מסומן.
        </ThemedText>
        <Card style={styles.card}>
          {trip.confirmations.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
              אין חניכים פעילים בשכבות של תיק הטיול.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {trip.confirmations.map((c) => (
                <View key={c.participant_id} style={styles.confirmationRow}>
                  <View style={styles.confirmationTextBlock}>
                    <ThemedText type="smallBold" style={styles.rtlText}>
                      {c.participant_name}
                    </ThemedText>
                    {c.allergies && (
                      <ThemedText type="small" themeColor="danger" style={styles.rtlText}>
                        ⚠️ {c.allergies}
                      </ThemedText>
                    )}
                  </View>
                  <Button
                    label={c.confirmed ? '✓ הגיע/ה' : 'טרם אושר'}
                    size="small"
                    fullWidth={false}
                    variant={c.confirmed ? 'primary' : 'ghost'}
                    disabled={!trip.can_manage}
                    onPress={() => handleToggleConfirmation(c.participant_id, !c.confirmed)}
                  />
                </View>
              ))}
            </View>
          )}
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
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  headerBlock: {
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  headerBackButtons: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    gap: Spacing.two,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  list: {
    gap: Spacing.two,
  },
  scheduleRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  scheduleTextBlock: {
    gap: 2,
    flex: 1,
    minWidth: 160,
  },
  checklistRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  confirmationRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  confirmationTextBlock: {
    gap: 2,
  },
  addRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
  },
  timeField: {
    width: 110,
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  sharedLayerChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
