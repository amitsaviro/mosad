import { api } from '@/api/client';
import { CalendarActivity } from '@/types';

export type CalendarActivityInput = {
  activity_id: string;
  date: string; // "YYYY-MM-DD"
  notes?: string;
};

export function listCalendarActivities() {
  return api.get<CalendarActivity[]>('/calendar-activities');
}

export function createCalendarActivity(layerId: string, payload: CalendarActivityInput) {
  return api.post<CalendarActivity>(`/layers/${layerId}/calendar-activities`, payload);
}

export function deleteCalendarActivity(entryId: string) {
  return api.delete<void>(`/calendar-activities/${entryId}`);
}
