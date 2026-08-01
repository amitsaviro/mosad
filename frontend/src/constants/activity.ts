import { ActivityType } from '@/types';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  opener: 'פתיחה',
  main: 'מרכזית',
  closing: 'סיכום',
};

export const ACTIVITY_TYPES: ActivityType[] = ['opener', 'main', 'closing'];
