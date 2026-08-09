import uuid
from datetime import datetime, time

from pydantic import BaseModel, Field

from app.models.scheduled_activity import DayOfWeek


class ScheduledActivityCreate(BaseModel):
    activity_id: uuid.UUID
    day_of_week: DayOfWeek
    start_time: time
    duration_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None


class ScheduledActivityUpdate(BaseModel):
    """All optional -- PATCH only changes what's provided. Also used to
    toggle equipment_checked (send the full new list of checked items)."""
    day_of_week: DayOfWeek | None = None
    start_time: time | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None
    equipment_checked: list[str] | None = None


class ScheduledActivityOut(BaseModel):
    id: uuid.UUID
    layer_id: uuid.UUID
    activity_id: uuid.UUID
    activity_name: str
    activity_type: str
    day_of_week: DayOfWeek
    start_time: time
    duration_minutes: int | None
    notes: str | None
    equipment: list[str]
    equipment_checked: list[str]
    created_by_name: str
    can_manage: bool
    created_at: datetime
