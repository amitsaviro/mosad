import { api } from '@/api/client';
import { ChatMessage } from '@/types';

export function listChatMessages(layerId: string) {
  return api.get<ChatMessage[]>(`/layers/${layerId}/chat/messages`);
}

export function sendChatMessage(layerId: string, body: string) {
  return api.post<ChatMessage>(`/layers/${layerId}/chat/messages`, { body });
}

export function markChatRead(layerId: string) {
  return api.post<void>(`/layers/${layerId}/chat/mark-read`);
}

export function getChatUnreadCount(layerId: string) {
  return api.get<{ layer_id: string; count: number }>(`/layers/${layerId}/chat/unread-count`);
}
