// Mirrors the backend Pydantic schemas (backend/app/schemas/). Kept in
// one place so every screen/api file shares the same shape.

export type UserRole = 'institution_admin' | 'counselor';

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole | null;
  institution_id: string | null;
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
};

export type Participant = {
  id: string;
  layer_id: string;
  full_name: string;
  date_of_birth: string | null;
  guardian_contact: string | null;
  is_active: boolean;
};
