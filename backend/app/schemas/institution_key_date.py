import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator


class KeyDateCreate(BaseModel):
    name: str
    date: date
    note: str | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם התאריך לא יכול להיות ריק")
        return stripped


class KeyDateOut(BaseModel):
    id: uuid.UUID
    institution_id: uuid.UUID
    name: str
    date: date
    note: str | None
    created_at: datetime
