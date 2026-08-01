import { api } from '@/api/client';

type InstitutionOut = { id: string; name: string };

export function createInstitution(name: string) {
  return api.post<InstitutionOut>('/institutions', { name });
}

export function updateInstitution(name: string) {
  return api.patch<InstitutionOut>('/institutions', { name });
}
