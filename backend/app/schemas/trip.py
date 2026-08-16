import uuid
from datetime import date, datetime
from datetime import time as time_type

from pydantic import BaseModel, Field, field_validator


class TripCreate(BaseModel):
    name: str
    destination: str | None = None
    start_date: date
    # Defaults to start_date (single-day trip) when omitted -- most
    # trips this app sees are day trips, not multi-day.
    end_date: date | None = None
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם הטיול לא יכול להיות ריק")
        return stripped


class TripUpdate(BaseModel):
    name: str | None = None
    destination: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class TripEquipmentItemCreate(BaseModel):
    label: str = Field(min_length=1)


class TripEquipmentItemOut(BaseModel):
    id: uuid.UUID
    label: str
    checked: bool


class TripShoppingItemCreate(BaseModel):
    label: str = Field(min_length=1)


class TripShoppingItemOut(BaseModel):
    id: uuid.UUID
    label: str
    checked: bool


class TripChecklistItemUpdate(BaseModel):
    checked: bool


class TripDocumentCreate(BaseModel):
    label: str = Field(min_length=1)
    url: str = Field(min_length=1)


class TripDocumentOut(BaseModel):
    id: uuid.UUID
    label: str
    url: str


class TripScheduleItemCreate(BaseModel):
    time: time_type | None = None
    title: str = Field(min_length=1)
    notes: str | None = None


class TripScheduleItemUpdate(BaseModel):
    time: time_type | None = None
    title: str | None = None
    notes: str | None = None


class TripScheduleItemOut(BaseModel):
    id: uuid.UUID
    time: time_type | None
    title: str
    notes: str | None


class TripConfirmationSet(BaseModel):
    confirmed: bool


class TripConfirmationOut(BaseModel):
    participant_id: uuid.UUID
    participant_name: str
    confirmed: bool


class TripSummaryOut(BaseModel):
    """The list view -- no nested checklists/roster, so listing a
    layer's trips stays a single cheap query."""
    id: uuid.UUID
    layer_id: uuid.UUID
    name: str
    destination: str | None
    start_date: date
    end_date: date
    can_manage: bool
    created_at: datetime


class TripOut(BaseModel):
    id: uuid.UUID
    layer_id: uuid.UUID
    layer_name: str
    name: str
    destination: str | None
    start_date: date
    end_date: date
    notes: str | None
    created_by_name: str
    can_manage: bool
    created_at: datetime
    equipment: list[TripEquipmentItemOut]
    shopping: list[TripShoppingItemOut]
    documents: list[TripDocumentOut]
    schedule: list[TripScheduleItemOut]
    confirmations: list[TripConfirmationOut]
