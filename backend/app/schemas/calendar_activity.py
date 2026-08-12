import uuid
from datetime import date, datetime

from pydantic import BaseModel


class CalendarActivityCreate(BaseModel):
    activity_id: uuid.UUID
    date: date
    notes: str | None = None


class CalendarActivityUpdate(BaseModel):
    """All optional -- PATCH only changes what's provided. Also used to
    toggle equipment_checked (send the full new list of checked items)."""
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
    notes: str | None
    equipment: list[str]
    equipment_checked: list[str]
    created_by_name: str
    can_manage: bool
    is_past: bool
    created_at: datetime
