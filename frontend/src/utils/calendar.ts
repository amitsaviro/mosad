import { CalendarActivity, Holiday, KeyDate } from '@/types';

export const MONTH_LABELS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

// Short weekday header, Sunday-first to match this app's RTL week
// convention everywhere else (DAYS_OF_WEEK in constants/schedule).
export const WEEKDAY_SHORT_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export type YearItem =
  | { kind: 'holiday'; holiday: Holiday }
  | { kind: 'keyDate'; keyDate: KeyDate }
  | { kind: 'activity'; activity: CalendarActivity };

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// All date math below works in UTC-epoch terms (not the browser's local
// timezone) so that iterating "the next day" of an ISO date string never
// drifts across a DST boundary or a UTC offset -- an "YYYY-MM-DD" string
// has no timezone of its own, so pretending it's UTC and staying in UTC
// the whole way through is the only way to keep it stable.
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// Display format only -- API calls and query params keep using the
// ISO "YYYY-MM-DD" the backend expects; this is purely for what the
// user reads/types, matching the day/month/year convention used in Israel.
export function toIsraeliDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function isValidIsraeliDate(text: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(text.trim());
}

export function fromIsraeliDate(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m}-${d}`;
}

export function buildItemsByDate(
  holidays: Holiday[],
  keyDates: KeyDate[],
  calendarActivities: CalendarActivity[]
): Record<string, YearItem[]> {
  const map: Record<string, YearItem[]> = {};
  function push(iso: string, item: YearItem) {
    (map[iso] ??= []).push(item);
  }
  for (const h of holidays) {
    let cur = parseIsoDate(h.start_date);
    const end = parseIsoDate(h.end_date);
    while (cur.getTime() <= end.getTime()) {
      push(formatIsoDate(cur), { kind: 'holiday', holiday: h });
      cur = addDaysUtc(cur, 1);
    }
  }
  for (const k of keyDates) push(k.date, { kind: 'keyDate', keyDate: k });
  for (const a of calendarActivities) push(a.date, { kind: 'activity', activity: a });
  return map;
}
