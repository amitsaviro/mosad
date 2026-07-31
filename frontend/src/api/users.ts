import { api } from '@/api/client';
import { User } from '@/types';

export function listInstitutionUsers() {
  return api.get<User[]>('/users');
}
