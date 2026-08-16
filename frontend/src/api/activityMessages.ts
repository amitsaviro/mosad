import { api } from '@/api/client';
import { ActivityMessage, ActivityMessageThread } from '@/types';

// For a non-creator, omit withUserId -- the backend defaults it to the
// activity's own creator, since that's the only thread they can have.
export function listActivityMessages(activityId: string, withUserId?: string) {
  const query = withUserId ? `?with=${withUserId}` : '';
  return api.get<ActivityMessage[]>(`/activities/${activityId}/messages${query}`);
}

export function sendActivityMessage(activityId: string, body: string, toUserId?: string) {
  return api.post<ActivityMessage>(`/activities/${activityId}/messages`, { body, to_user_id: toUserId });
}

// Creator-only: everyone who's messaged them about this activity.
export function listActivityMessageThreads(activityId: string) {
  return api.get<ActivityMessageThread[]>(`/activities/${activityId}/messages/threads`);
}
