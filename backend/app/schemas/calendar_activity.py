import uuid
from datetime import date, datetime

from pydantic import BaseModel


class CalendarActivityCreate(BaseModel):
    activity_id: uuid.UUID
    date: date
    notes: str | None = None


class CalendarActivityOut(BaseModel):
    id: uuid.UUID
    layer_id: uuid.UUID
    layer_name: str
    activity_id: uuid.UUID
    activity_name: str
    activity_type: str
    date: date
    notes: str | None
    created_by_name: str
    can_manage: bool
    is_past: bool
    created_at: datetime
