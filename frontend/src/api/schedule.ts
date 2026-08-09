import { api } from '@/api/client';
import { DayOfWeek, ScheduledActivity } from '@/types';

export type ScheduleEntryInput = {
  activity_id: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM:SS"
  duration_minutes?: number;
  notes?: string;
};

export function listSchedule(layerId: string) {
  return api.get<ScheduledActivity[]>(`/layers/${layerId}/schedule`);
}

export function createScheduleEntry(layerId: string, payload: ScheduleEntryInput) {
  return api.post<ScheduledActivity>(`/layers/${layerId}/schedule`, payload);
}

export type ScheduleEntryUpdate = Partial<ScheduleEntryInput> & { equipment_checked?: string[] };

export function updateScheduleEntry(entryId: string, payload: ScheduleEntryUpdate) {
  return api.patch<ScheduledActivity>(`/schedule/${entryId}`, payload);
}

export function deleteScheduleEntry(entryId: string) {
  return api.delete<void>(`/schedule/${entryId}`);
}
