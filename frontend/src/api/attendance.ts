import { api } from '@/api/client';
import { Attendance, ParticipantAttendanceSummary } from '@/types';

export type AttendanceMarkItem = { participant_id: string; present: boolean };

export function markAttendance(layerId: string, date: string, records: AttendanceMarkItem[]) {
  return api.post<Attendance[]>(`/layers/${layerId}/attendance`, { date, records });
}

export function listAttendanceForDate(layerId: string, date: string) {
  return api.get<Attendance[]>(`/layers/${layerId}/attendance?date=${date}`);
}

export function listParticipantAttendance(participantId: string) {
  return api.get<Attendance[]>(`/participants/${participantId}/attendance`);
}

export function getParticipantAttendanceSummary(participantId: string) {
  return api.get<ParticipantAttendanceSummary>(`/participants/${participantId}/attendance-summary`);
}
