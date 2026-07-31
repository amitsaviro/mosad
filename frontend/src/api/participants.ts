import { api } from '@/api/client';
import { Participant } from '@/types';

export function listParticipants(layerId: string) {
  return api.get<Participant[]>(`/layers/${layerId}/participants`);
}

export function createParticipant(
  layerId: string,
  fullName: string,
  dateOfBirth?: string,
  guardianContact?: string
) {
  return api.post<Participant>(`/layers/${layerId}/participants`, {
    full_name: fullName,
    date_of_birth: dateOfBirth,
    guardian_contact: guardianContact,
  });
}

export function updateParticipant(participantId: string, changes: Partial<Participant>) {
  return api.patch<Participant>(`/participants/${participantId}`, changes);
}
