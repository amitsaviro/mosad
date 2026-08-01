import { api } from '@/api/client';
import {
  Activity,
  ActivityCategory,
  ActivityComment,
  ActivityListResult,
  ActivityLocation,
  ActivityRating,
  ActivityType,
  Attachment,
} from '@/types';

export type ActivityFilters = {
  search?: string;
  activity_type?: ActivityType;
  tag?: string;
  categories?: ActivityCategory[];
  location?: ActivityLocation;
  grade?: number;
  group_size?: number;
  max_duration?: number;
  page?: number;
  page_size?: number;
};

function buildQuery(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === '' || value === null) return;
    if (key === 'categories') {
      (value as ActivityCategory[]).forEach((category) => params.append('category', category));
      return;
    }
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listActivities(filters: ActivityFilters = {}) {
  return api.get<ActivityListResult>(`/activities${buildQuery(filters)}`);
}

export function getActivity(activityId: string) {
  return api.get<Activity>(`/activities/${activityId}`);
}

export type ActivityInput = {
  name: string;
  description: string;
  activity_type: ActivityType;
  grade_min?: number;
  grade_max?: number;
  duration_minutes?: number;
  group_size_min?: number;
  group_size_max?: number;
  location?: ActivityLocation;
  equipment?: string[];
  budget_estimate?: number;
  tags?: string[];
  categories?: ActivityCategory[];
  contact_phone?: string;
  attachments?: Pick<Attachment, 'url' | 'label'>[];
};

export function createActivity(payload: ActivityInput) {
  return api.post<Activity>('/activities', payload);
}

export function updateActivity(activityId: string, payload: Partial<ActivityInput>) {
  return api.patch<Activity>(`/activities/${activityId}`, payload);
}

export function deleteActivity(activityId: string) {
  return api.delete<void>(`/activities/${activityId}`);
}

export function addRating(activityId: string, layerId: string, rating: number, notes?: string) {
  return api.post<ActivityRating>(`/activities/${activityId}/ratings`, {
    layer_id: layerId,
    rating,
    notes,
  });
}

export function listRatings(activityId: string) {
  return api.get<ActivityRating[]>(`/activities/${activityId}/ratings`);
}

export function addComment(activityId: string, body: string) {
  return api.post<ActivityComment>(`/activities/${activityId}/comments`, { body });
}

export function listComments(activityId: string) {
  return api.get<ActivityComment[]>(`/activities/${activityId}/comments`);
}
