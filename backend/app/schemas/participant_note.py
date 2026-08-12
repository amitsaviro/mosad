import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class ParticipantNoteCreate(BaseModel):
    body: str

    @field_validator("body")
    @classmethod
    def body_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("תוכן ההערה לא יכול להיות ריק")
        return stripped


class ParticipantNoteOut(BaseModel):
    id: uuid.UUID
    participant_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    body: str
    created_at: datetime
