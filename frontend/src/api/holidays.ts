import { api } from '@/api/client';
import { Holiday } from '@/types';

export function listHolidays(fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (fromDate) params.set('from_date', fromDate);
  if (toDate) params.set('to_date', toDate);
  const query = params.toString();
  return api.get<Holiday[]>(`/holidays${query ? `?${query}` : ''}`);
}
