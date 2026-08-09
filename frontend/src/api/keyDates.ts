import { api } from '@/api/client';
import { KeyDate } from '@/types';

export function listKeyDates() {
  return api.get<KeyDate[]>('/key-dates');
}

export function createKeyDate(name: string, date: string, note?: string) {
  return api.post<KeyDate>('/key-dates', { name, date, note });
}

export function deleteKeyDate(keyDateId: string) {
  return api.delete<void>(`/key-dates/${keyDateId}`);
}
