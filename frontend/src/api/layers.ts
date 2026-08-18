import { api } from '@/api/client';
import { AiScheduleResponse, DayOfWeek, Layer, LayerScheduleProfile, User } from '@/types';

export function listLayers() {
  return api.get<Layer[]>('/layers');
}

export function getLayer(layerId: string) {
  return api.get<Layer>(`/layers/${layerId}`);
}

export function createLayer(name: string, description?: string) {
  return api.post<Layer>('/layers', { name, description });
}

export function updateLayer(layerId: string, changes: { name?: string; description?: string }) {
  return api.patch<Layer>(`/layers/${layerId}`, changes);
}

export function deleteLayer(layerId: string) {
  return api.delete<void>(`/layers/${layerId}`);
}

export function leaveLayer(layerId: string) {
  return api.post<void>(`/layers/${layerId}/leave`);
}

export function listLayerCounselors(layerId: string) {
  return api.get<User[]>(`/layers/${layerId}/counselors`);
}

export function joinLayer(joinCode: string) {
  return api.post<Layer>('/layers/join', { join_code: joinCode });
}

export function assignCounselor(layerId: string, userId: string) {
  return api.post<void>(`/layers/${layerId}/assign-counselor`, { user_id: userId });
}

export function unassignCounselor(layerId: string, userId: string) {
  return api.delete<void>(`/layers/${layerId}/assign-counselor/${userId}`);
}

export function getScheduleProfile(layerId: string) {
  return api.get<LayerScheduleProfile>(`/layers/${layerId}/schedule-profile`);
}

export function setScheduleProfile(layerId: string, meetingDays: DayOfWeek[], groupCharacter: string | null) {
  return api.put<LayerScheduleProfile>(`/layers/${layerId}/schedule-profile`, {
    meeting_days: meetingDays,
    group_character: groupCharacter,
  });
}

export function generateAiSchedule(
  layerId: string,
  startDate: string,
  endDate: string,
  excludeActivityIds: string[] = []
) {
  return api.post<AiScheduleResponse>(`/layers/${layerId}/ai-schedule`, {
    start_date: startDate,
    end_date: endDate,
    exclude_activity_ids: excludeActivityIds,
  });
}
