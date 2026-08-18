# Request/response shapes for a layer's schedule profile (weekly
# meeting pattern + group character) and for the AI scheduling
# agent's draft proposals.
import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

DayOfWeekLiteral = Literal["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]


class LayerScheduleProfileSet(BaseModel):
    meeting_days: list[DayOfWeekLiteral] = Field(default_factory=list)
    group_character: str | None = None


class LayerScheduleProfileOut(BaseModel):
    meeting_days: list[DayOfWeekLiteral]
    group_character: str | None


class AiScheduleRequest(BaseModel):
    start_date: date
    end_date: date


class AiScheduleSuggestion(BaseModel):
    date: date
    day_of_week: DayOfWeekLiteral
    activity_id: uuid.UUID
    activity_name: str
    activity_type: str
    reason: str


class AiScheduleResponse(BaseModel):
    suggestions: list[AiScheduleSuggestion]
    # Meeting dates that fell inside a holiday and were skipped --
    # shown to the counselor for transparency, not silently dropped.
    skipped_holiday_dates: list[date]
    # Set when the LLM step was unavailable/unreachable/misbehaved and
    # the response fell back to the plain ratings-based heuristic, or
    # when there simply wasn't enough data to propose anything.
    warning: str | None = None
