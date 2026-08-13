import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field


class CalendarActivityCreate(BaseModel):
    activity_id: uuid.UUID
    date: date
    start_time: time | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None


class CalendarActivityUpdate(BaseModel):
    """All optional -- PATCH only changes what's provided. Also used to
    toggle equipment_checked (send the full new list of checked items).
    No `date` field: nothing currently needs to move a pinned activity
    to a different date, only edit its time/notes/equipment in place."""
    start_time: time | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None
    equipment_checked: list[str] | None = None


class CalendarActivityOut(BaseModel):
    id: uuid.UUID
    layer_id: uuid.UUID
    layer_name: str
    activity_id: uuid.UUID
    activity_name: str
    activity_type: str
    date: date
    start_time: time | None
    duration_minutes: int | None
    notes: str | None
    equipment: list[str]
    equipment_checked: list[str]
    created_by_name: str
    can_manage: bool
    is_past: bool
    created_at: datetime
