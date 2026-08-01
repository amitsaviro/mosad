// Mirrors the backend Pydantic schemas (backend/app/schemas/). Kept in
// one place so every screen/api file shares the same shape.

export type UserRole = 'institution_admin' | 'counselor';

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole | null;
  institution_id: string | null;
  institution_name: string | null;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type Layer = {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  join_code: string;
  is_active: boolean;
  can_manage: boolean;
  is_assigned: boolean;
};

export type Participant = {
  id: string;
  layer_id: string;
  full_name: string;
  date_of_birth: string | null;
  guardian_contact: string | null;
  is_active: boolean;
};

export type ActivityType = 'opener' | 'main' | 'closing';

export type Attachment = {
  id: string;
  url: string;
  label: string | null;
};

export type Activity = {
  id: string;
  creator_id: string;
  creator_name: string;
  name: string;
  description: string;
  activity_type: ActivityType;
  age_min: number | null;
  age_max: number | null;
  duration_minutes: number | null;
  group_size_min: number | null;
  group_size_max: number | null;
  location: string | null;
  required_equipment: string | null;
  budget_estimate: number | null;
  tags: string[];
  attachments: Attachment[];
  average_rating: number | null;
  usage_count: number;
  can_manage: boolean;
  created_at: string;
};

export type ActivityRating = {
  id: string;
  user_id: string;
  user_name: string;
  layer_id: string;
  layer_name: string;
  rating: number;
  notes: string | null;
  created_at: string;
};

export type ActivityComment = {
  id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
};
