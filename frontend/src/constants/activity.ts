import { ActivityCategory, ActivityLocation, ActivityType } from '@/types';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  opener: 'פתיחה',
  main: 'מרכזית',
  closing: 'סיכום',
};

export const ACTIVITY_TYPES: ActivityType[] = ['opener', 'main', 'closing'];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  game: 'משחק',
  workshop: 'סדנה',
  discussion: 'שיח ודיון',
  team_building: 'גיבוש',
  sports: 'ספורט ותנועה',
  arts: 'אומנות ויצירה',
  trip: 'טיול ושטח',
  ceremony: 'טקס',
  boys_evening: 'ערב בנים',
  girls_evening: 'ערב בנות',
};

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  'game',
  'workshop',
  'discussion',
  'team_building',
  'sports',
  'arts',
  'trip',
  'ceremony',
  'boys_evening',
  'girls_evening',
];

export const ACTIVITY_LOCATION_LABELS: Record<ActivityLocation, string> = {
  outdoor: 'בחוץ',
  indoor_room: 'חדר סגור',
  sports_hall: 'אולם ספורט',
  classroom: 'כיתה',
  dining_hall: 'חדר אוכל',
  field_trip: 'שטח / טבע',
  other: 'אחר',
};

export const ACTIVITY_LOCATIONS: ActivityLocation[] = [
  'outdoor',
  'indoor_room',
  'sports_hall',
  'classroom',
  'dining_hall',
  'field_trip',
  'other',
];

// School-grade range (1 = א, ..., 12 = יב) -- this app organizes
// everything around grade-based "layers" (e.g. "שכבה ז'"), so an
// activity's target audience is picked by grade rather than raw age.
export const GRADE_LABELS: Record<number, string> = {
  1: 'א',
  2: 'ב',
  3: 'ג',
  4: 'ד',
  5: 'ה',
  6: 'ו',
  7: 'ז',
  8: 'ח',
  9: 'ט',
  10: 'י',
  11: 'יא',
  12: 'יב',
};

export const GRADE_LEVELS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
