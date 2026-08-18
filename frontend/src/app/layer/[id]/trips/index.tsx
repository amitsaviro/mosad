// A layer's list of trip files (תיקי טיול) -- create a new one, or
// open an existing one for the full itinerary/checklists/roster.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { getLayer, listLayers } from '@/api/layers';
import { createTrip, listTrips } from '@/api/trips';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Layer, TripSummary } from '@/types';
import { fromIsraeliDate, toIsraeliDate, todayIso } from '@/utils/calendar';

export default function LayerTripsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [otherLayers, setOtherLayers] = useState<Layer[]>([]);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDateText, setStartDateText] = useState('');
  const [endDateText, setEndDateText] = useState('');
  const [notes, setNotes] = useState('');
  const [shareLayerIds, setShareLayerIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    setError(null);
    try {
      const [fetchedLayer, fetchedTrips, fetchedLayers] = await Promise.all([
        getLayer(id),
        listTrips(id),
        listLayers(),
      ]);
      setLayer(fetchedLayer);
      setTrips(fetchedTrips);
      setOtherLayers(fetchedLayers.filter((l) => l.can_manage && l.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'טעינת תיקי הטיול נכשלה');
    }
  }

  function toggleShareLayer(layerId: string) {
    setShareLayerIds((prev) => (prev.includes(layerId) ? prev.filter((l) => l !== layerId) : [...prev, layerId]));
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleCreate() {
    if (!name.trim()) {
      setError('יש להזין שם לטיול');
      return;
    }
    const startIso = startDateText.trim() ? fromIsraeliDate(startDateText) : todayIso();
    if (!startIso) {
      setError('תאריך התחלה לא תקין, למשל 14/12/2026');
      return;
    }
    let endIso: string | undefined;
    if (endDateText.trim()) {
      endIso = fromIsraeliDate(endDateText) ?? undefined;
      if (!endIso) {
        setError('תאריך סיום לא תקין, למשל 14/12/2026');
        return;
      }
    }
    setError(null);
    setIsSaving(true);
    try {
      await createTrip(id, {
        name: name.trim(),
        destination: destination.trim() || undefined,
        start_date: startIso,
        end_date: endIso,
        notes: notes.trim() || undefined,
        share_layer_ids: shareLayerIds,
      });
      setName('');
      setDestination('');
      setStartDateText('');
      setEndDateText('');
      setNotes('');
      setShareLayerIds([]);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'יצירת הטיול נכשלה');
    } finally {
      setIsSaving(false);
    }
  }

  // Always push straight to the layer instead of router.back(): this
  // screen sits 2 levels deep (layer -> trips list), and canGoBack()/
  // back() get unreliable that deep on web (e.g. after a refresh) --
  // they can bounce back to the very trip screen we're trying to
  // leave instead of the layer, trapping the user in a loop.
  function handleBackToLayer() {
    router.push(`/layer/${id}`);
  }

  function dateRangeLabel(trip: TripSummary): string {
    return trip.start_date === trip.end_date
      ? toIsraeliDate(trip.start_date)
      : `${toIsraeliDate(trip.start_date)} – ${toIsraeliDate(trip.end_date)}`;
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.rtlText}>
            תיקי טיול{layer ? ` — ${layer.name}` : ''}
          </ThemedText>
          <Button label="חזרה לשכבה" variant="ghost" size="small" fullWidth={false} onPress={handleBackToLayer} />
        </View>

        {error && <ThemedText themeColor="danger" style={styles.rtlText}>{error}</ThemedText>}

        {trips.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
            אין עדיין תיקי טיול לשכבה הזו.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {trips.map((trip) => (
              <Card key={trip.id} style={styles.tripCard}>
                <View style={styles.tripCardHeaderRow}>
                  <ThemedText
                    type="smallBold"
                    style={styles.rtlText}
                    onPress={() => router.push(`/layer/${id}/trips/${trip.id}`)}
                  >
                    {trip.name}
                  </ThemedText>
                  {trip.is_shared && <Badge label="🔗 משותף" tone="shared" />}
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.rtlText}>
                  {dateRangeLabel(trip)}
                  {trip.destination ? ` · ${trip.destination}` : ''}
                </ThemedText>
                <Button
                  label="פתח תיק טיול ←"
                  variant="secondary"
                  size="small"
                  fullWidth={false}
                  onPress={() => router.push(`/layer/${id}/trips/${trip.id}`)}
                />
              </Card>
            ))}
          </View>
        )}

        {layer?.can_manage && (
          <Card style={styles.card}>
            <ThemedText type="subtitle" style={styles.rtlText}>
              טיול חדש
            </ThemedText>
            <TextField label="שם הטיול" placeholder="למשל: טיול לצפון" value={name} onChangeText={setName} />
            <TextField label="יעד (אופציונלי)" value={destination} onChangeText={setDestination} />
            {otherLayers.length > 0 && (
              <>
                <ThemedText type="smallBold" style={styles.rtlText}>
                  גם עבור שכבות נוספות (משותף) — למשל טיול לכמה שכבות באותו אוטובוס
                </ThemedText>
                <View style={styles.chipRow}>
                  {otherLayers.map((l) => (
                    <Button
                      key={l.id}
                      label={l.name}
                      size="small"
                      fullWidth={false}
                      variant={shareLayerIds.includes(l.id) ? 'primary' : 'ghost'}
                      onPress={() => toggleShareLayer(l.id)}
                    />
                  ))}
                </View>
              </>
            )}
            <TextField
              label="תאריך התחלה (יום/חודש/שנה) — ברירת מחדל: היום"
              placeholder="14/12/2026"
              value={startDateText}
              onChangeText={setStartDateText}
            />
            <TextField
              label="תאריך סיום (אופציונלי — לטיול של יום אחד השאירו ריק)"
              placeholder="15/12/2026"
              value={endDateText}
              onChangeText={setEndDateText}
            />
            <TextField label="הערות (אופציונלי)" value={notes} onChangeText={setNotes} multiline style={styles.multiline} />
            <Button label="צור תיק טיול" onPress={handleCreate} loading={isSaving} />
          </Card>
        )}
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
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  list: {
    gap: Spacing.two,
  },
  tripCard: {
    gap: Spacing.one,
  },
  tripCardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.two,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
