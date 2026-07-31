import { api } from '@/api/client';
import { Layer } from '@/types';

export function listLayers() {
  return api.get<Layer[]>('/layers');
}

export function getLayer(layerId: string) {
  return api.get<Layer>(`/layers/${layerId}`);
}

export function createLayer(name: string, description?: string) {
  return api.post<Layer>('/layers', { name, description });
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
