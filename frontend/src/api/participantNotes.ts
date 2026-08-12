import { api } from '@/api/client';
import { ParticipantNote } from '@/types';

export function listParticipantNotes(participantId: string) {
  return api.get<ParticipantNote[]>(`/participants/${participantId}/notes`);
}

export function createParticipantNote(participantId: string, body: string) {
  return api.post<ParticipantNote>(`/participants/${participantId}/notes`, { body });
}

export function deleteParticipantNote(noteId: string) {
  return api.delete<void>(`/notes/${noteId}`);
}
