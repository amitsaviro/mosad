import { api } from '@/api/client';
import { CalendarActivity } from '@/types';

export type CalendarActivityInput = {
  activity_id: string;
  date: string; // "YYYY-MM-DD"
  start_time?: string; // "HH:MM:SS"
  duration_minutes?: number;
  notes?: string;
};

export function listCalendarActivities() {
  return api.get<CalendarActivity[]>('/calendar-activities');
}

export function createCalendarActivity(layerId: string, payload: CalendarActivityInput) {
  return api.post<CalendarActivity>(`/layers/${layerId}/calendar-activities`, payload);
}

export type CalendarActivityUpdate = {
  start_time?: string;
  duration_minutes?: number;
  notes?: string;
  equipment_checked?: string[];
};

export function updateCalendarActivity(entryId: string, payload: CalendarActivityUpdate) {
  return api.patch<CalendarActivity>(`/calendar-activities/${entryId}`, payload);
}

export function deleteCalendarActivity(entryId: string) {
  return api.delete<void>(`/calendar-activities/${entryId}`);
}
