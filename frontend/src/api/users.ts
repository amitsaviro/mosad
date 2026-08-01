import { api } from '@/api/client';
import { User } from '@/types';

export function listInstitutionUsers() {
  return api.get<User[]>('/users');
}

export function updateSelf(changes: { full_name?: string; email?: string }) {
  return api.patch<User>('/users/me', changes);
}

export function deleteSelf() {
  return api.delete<void>('/users/me');
}

export function adminUpdateMember(userId: string, fullName: string) {
  return api.patch<User>(`/users/${userId}`, { full_name: fullName });
}

export function adminRemoveMember(userId: string) {
  return api.delete<void>(`/users/${userId}`);
}
