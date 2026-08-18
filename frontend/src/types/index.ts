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
  allergies: string | null;
  is_active: boolean;
};

export type Attendance = {
  id: string;
  participant_id: string;
  participant_name: string;
  date: string; // "YYYY-MM-DD"
  present: boolean;
  marked_by_name: string;
  created_at: string;
};

export type ParticipantAttendanceSummary = {
  total_sessions: number;
  present_count: number;
  rate: number | null;
};

export type ParticipantNote = {
  id: string;
  participant_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type ActivityType = 'opener' | 'main' | 'closing';

// Content genre -- independent of ActivityType (the session-role of
// opener/main/closing). An activity can belong to several at once.
export type ActivityCategory =
  | 'game'
  | 'workshop'
  | 'discussion'
  | 'team_building'
  | 'sports'
  | 'arts'
  | 'trip'
  | 'ceremony'
  | 'boys_evening'
  | 'girls_evening';

// A closed vocabulary rather than free text, so activities can be
// filtered by location reliably.
export type ActivityLocation =
  | 'outdoor'
  | 'indoor_room'
  | 'sports_hall'
  | 'classroom'
  | 'dining_hall'
  | 'field_trip'
  | 'other';

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
  grade_min: number | null;
  grade_max: number | null;
  duration_minutes: number | null;
  group_size_min: number | null;
  group_size_max: number | null;
  location: ActivityLocation | null;
  equipment: string[];
  budget_estimate: number | null;
  tags: string[];
  categories: ActivityCategory[];
  contact_phone: string | null;
  attachments: Attachment[];
  average_rating: number | null;
  usage_count: number;
  can_manage: boolean;
  created_at: string;
};

export type ActivityListResult = {
  items: Activity[];
  total: number;
  page: number;
  page_size: number;
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
  reply_to_id: string | null;
  reply_to_user_name: string | null;
  created_at: string;
};

export type DayOfWeek =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export type KeyDate = {
  id: string;
  institution_id: string;
  name: string;
  date: string; // "YYYY-MM-DD"
  note: string | null;
  created_at: string;
};

// Computed from the real Hebrew calendar on the backend -- never
// stored, so there's nothing here for anyone to keep up to date.
export type Holiday = {
  name: string;
  start_date: string; // "YYYY-MM-DD"
  end_date: string; // "YYYY-MM-DD"
};

export type CalendarActivity = {
  id: string;
  layer_id: string;
  layer_name: string;
  activity_id: string;
  activity_name: string;
  activity_type: ActivityType;
  date: string; // "YYYY-MM-DD"
  start_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  equipment: string[];
  equipment_checked: string[];
  created_by_name: string;
  can_manage: boolean;
  is_past: boolean;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  layer_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type TripEquipmentItem = {
  id: string;
  label: string;
  checked: boolean;
};

export type TripShoppingItem = {
  id: string;
  label: string;
  checked: boolean;
};

export type TripDocument = {
  id: string;
  label: string;
  url: string;
};

export type TripScheduleItem = {
  id: string;
  time: string | null; // "HH:MM:SS"
  title: string;
  notes: string | null;
};

export type TripConfirmation = {
  participant_id: string;
  participant_name: string;
  confirmed: boolean;
  allergies: string | null;
};

export type TripContact = {
  id: string;
  label: string;
  phone: string;
};

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type TripMeal = {
  id: string;
  date: string; // "YYYY-MM-DD"
  meal_type: MealType;
  description: string;
};

export type TripLayerSummary = {
  id: string;
  name: string;
};

export type TripSummary = {
  id: string;
  layer_id: string;
  name: string;
  destination: string | null;
  start_date: string; // "YYYY-MM-DD"
  end_date: string; // "YYYY-MM-DD"
  can_manage: boolean;
  is_shared: boolean;
  created_at: string;
};

export type Trip = {
  id: string;
  layer_id: string;
  layer_name: string;
  shared_layers: TripLayerSummary[];
  name: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_by_name: string;
  can_manage: boolean;
  can_delete: boolean;
  created_at: string;
  equipment: TripEquipmentItem[];
  shopping: TripShoppingItem[];
  documents: TripDocument[];
  schedule: TripScheduleItem[];
  confirmations: TripConfirmation[];
  contacts: TripContact[];
  meals: TripMeal[];
};

export type LayerScheduleProfile = {
  meeting_days: DayOfWeek[];
  group_character: string | null;
};

export type AiScheduleSuggestion = {
  date: string; // "YYYY-MM-DD"
  day_of_week: DayOfWeek;
  activity_id: string;
  activity_name: string;
  activity_type: ActivityType;
  reason: string;
};

export type AiScheduleResponse = {
  suggestions: AiScheduleSuggestion[];
  skipped_holiday_dates: string[];
  warning: string | null;
  attempts_used: number;
  validation_notes: string[];
};

