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

// The Sunday (Israeli week start) of "today, shifted by weekOffset
// weeks" -- local time, since it's about which real calendar week the
// counselor is currently looking at, not stable ISO-string iteration.
export function startOfWeekIso(weekOffset = 0): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + weekOffset * 7);
  return `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
}

// Day/month only, no year and no leading zeros -- for labeling each
// weekday column in the weekly schedule with its real date, where the
// year is implied by context and full padding would just add noise.
export function toIsraeliShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}

// Display format only -- API calls and query params keep using the
// ISO "YYYY-MM-DD" the backend expects; this is purely for what the
// user reads/types, matching the day/month/year convention used in Israel.
export function toIsraeliDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function isValidIsraeliDate(text: string): boolean {
  return fromIsraeliDate(text) !== null;
}

// Accepts both "/" and "." as separators, and a single digit for day/month
// (e.g. "3.3.2000" or "3/3/2000" both mean 03/03/2000) -- people type
// dates in whichever of those forms is fastest, and this shouldn't
// reject a perfectly clear date just because it's missing a leading zero.
export function fromIsraeliDate(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

export type BirthdayInfo = {
  nextBirthdayIso: string;
  daysUntil: number;
  turningAge: number;
};

// Local-time (not UTC) on purpose -- unlike the calendar-grid math
// above, this is about "how many calendar days from right now, in the
// user's own timezone" rather than iterating stable ISO date strings.
export function nextBirthdayInfo(dateOfBirth: string): BirthdayInfo {
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let next = new Date(today.getFullYear(), birthMonth - 1, birthDay);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, birthMonth - 1, birthDay);
  }
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
  return {
    nextBirthdayIso: `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`,
    daysUntil,
    turningAge: next.getFullYear() - birthYear,
  };
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
