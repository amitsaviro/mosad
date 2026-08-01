import uuid

from pydantic import BaseModel, field_validator


class InstitutionCreate(BaseModel):
    """Body for POST /institutions — creating an empty group with no
    layers yet. The admin adds layers separately, whenever ready."""
    name: str

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם מסגרת החינוך לא יכול להיות ריק")
        return stripped


class InstitutionUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם מסגרת החינוך לא יכול להיות ריק")
        return stripped


class InstitutionOut(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}
