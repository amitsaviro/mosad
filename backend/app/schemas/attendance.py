import uuid
from datetime import date, datetime

from pydantic import BaseModel


class AttendanceMarkItem(BaseModel):
    participant_id: uuid.UUID
    present: bool


class AttendanceMarkInput(BaseModel):
    date: date
    records: list[AttendanceMarkItem]


class AttendanceOut(BaseModel):
    id: uuid.UUID
    participant_id: uuid.UUID
    participant_name: str
    date: date
    present: bool
    marked_by_name: str
    created_at: datetime


class ParticipantAttendanceSummary(BaseModel):
    total_sessions: int
    present_count: int
    rate: float | None
