# Request/response shapes for the participant (חניך) roster.
import uuid
from datetime import date

from pydantic import BaseModel, field_validator


class ParticipantCreate(BaseModel):
    """Body for POST /layers/{layer_id}/participants. layer_id itself
    comes from the URL, not the body — same reasoning as LayerCreate."""
    full_name: str
    date_of_birth: date | None = None
    guardian_contact: str | None = None

    @field_validator("full_name")
    @classmethod
    def full_name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("full_name must not be blank")
        return stripped


class ParticipantUpdate(BaseModel):
    """All fields optional: PATCH only changes what's provided."""
    full_name: str | None = None
    date_of_birth: date | None = None
    guardian_contact: str | None = None
    is_active: bool | None = None


class ParticipantOut(BaseModel):
    id: uuid.UUID
    layer_id: uuid.UUID
    full_name: str
    date_of_birth: date | None
    guardian_contact: str | None
    is_active: bool

    model_config = {"from_attributes": True}
