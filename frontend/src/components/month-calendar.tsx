// A single-month calendar grid with prev/next paging -- one grid
// component reused by every layer's own calendar (avoids
// re-implementing the same day-grid math and rendering twice).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SHARED_COLOR } from '@/components/badge';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MONTH_LABELS, pad2, todayIso, WEEKDAY_SHORT_LABELS, YearItem } from '@/utils/calendar';

export function MonthCalendar({
  itemsByDate,
  selectedDate,
  onSelectDate,
  isItemShared,
}: {
  itemsByDate: Record<string, YearItem[]>;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  // Lets the caller flag which 'activity' items are pinned to more
  // than one layer, so their dot reads visually distinct from an
  // activity that belongs only to the layer whose calendar this is.
  isItemShared?: (item: YearItem) => boolean;
}) {
  const theme = useTheme();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth0, setViewMonth0] = useState(now.getMonth());

  function goPrevMonth() {
    if (viewMonth0 === 0) {
      setViewYear((y) => y - 1);
      setViewMonth0(11);
    } else {
      setViewMonth0((m) => m - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth0 === 11) {
      setViewYear((y) => y + 1);
      setViewMonth0(0);
    } else {
      setViewMonth0((m) => m + 1);
    }
  }

  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth0 + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(viewYear, viewMonth0, 1)).getUTCDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const today = todayIso();

  return (
    <View style={styles.container}>
      <View style={styles.pagerRow}>
        <Button label="→ הקודם" variant="ghost" size="small" fullWidth={false} onPress={goPrevMonth} />
        <ThemedText type="subtitle">
          {MONTH_LABELS[viewMonth0]} {viewYear}
        </ThemedText>
        <Button label="הבא ←" variant="ghost" size="small" fullWidth={false} onPress={goNextMonth} />
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_SHORT_LABELS.map((label, i) => (
          <View key={i} style={styles.dayCellWrap}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {label}
            </ThemedText>
          </View>
        ))}
      </View>
      <View style={styles.gridRow}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <View key={`empty-${idx}`} style={styles.dayCellWrap} />;
          }
          const iso = `${viewYear}-${pad2(viewMonth0 + 1)}-${pad2(day)}`;
          const dayItems = itemsByDate[iso] ?? [];
          const isSelected = selectedDate === iso;
          const isToday = iso === today;
          return (
            <View key={iso} style={styles.dayCellWrap}>
              <Pressable
                onPress={() => onSelectDate(iso)}
                style={[
                  styles.dayCell,
                  { borderColor: theme.border },
                  isToday && { borderColor: theme.primary },
                  isSelected && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <ThemedText type="small" style={styles.centerText}>
                  {day}
                </ThemedText>
                {dayItems.length > 0 && (
                  <View style={styles.dotRow}>
                    {dayItems.slice(0, 3).map((it, i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          {
                            backgroundColor:
                              it.kind === 'holiday'
                                ? theme.primary
                                : it.kind === 'keyDate'
                                  ? theme.success
                                  : it.kind === 'activity' && isItemShared?.(it)
                                    ? SHARED_COLOR
                                    : theme.danger,
                          },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  pagerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  centerText: {
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
  },
  gridRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
  },
  dayCellWrap: {
    width: '14.2857%',
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayCell: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 64,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
