import uuid
from datetime import date, datetime
from datetime import time as time_type
from typing import Literal

from pydantic import BaseModel, Field, field_validator

MealType = Literal["breakfast", "lunch", "dinner"]


class TripCreate(BaseModel):
    name: str
    destination: str | None = None
    start_date: date
    # Defaults to start_date (single-day trip) when omitted -- most
    # trips this app sees are day trips, not multi-day.
    end_date: date | None = None
    notes: str | None = None
    # Extra layers to share this trip with at creation time, beyond the
    # home layer it's being created under (URL path) -- e.g. two
    # שכבות going on the same bus. Optional and empty by default.
    share_layer_ids: list[uuid.UUID] = Field(default_factory=list)

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
    # Surfaced right next to attendance so whoever's handing out food
    # on the trip knows who needs a different plate, without having to
    # cross-reference the participant roster separately.
    allergies: str | None


class TripContactCreate(BaseModel):
    label: str = Field(min_length=1)
    phone: str = Field(min_length=1)


class TripContactOut(BaseModel):
    id: uuid.UUID
    label: str
    phone: str


class TripMealSet(BaseModel):
    date: date
    meal_type: MealType
    # Blank clears/removes the slot instead of leaving an empty row.
    description: str = ""


class TripMealOut(BaseModel):
    id: uuid.UUID
    date: date
    meal_type: MealType
    description: str


class TripShareLayer(BaseModel):
    layer_id: uuid.UUID


class TripLayerSummary(BaseModel):
    id: uuid.UUID
    name: str


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
    is_shared: bool
    created_at: datetime


class TripOut(BaseModel):
    id: uuid.UUID
    layer_id: uuid.UUID
    layer_name: str
    # Layers this trip is ALSO shared with, beyond layer_id/layer_name
    # above -- carries real ids (not just names) so the frontend can
    # offer "remove this share" per layer and exclude already-shared
    # layers from the "add a layer" picker.
    shared_layers: list[TripLayerSummary]
    name: str
    destination: str | None
    start_date: date
    end_date: date
    notes: str | None
    created_by_name: str
    can_manage: bool
    # Narrower than can_manage: only the trip's own creator may delete
    # it, but any manager of one of its layers may edit it.
    can_delete: bool
    created_at: datetime
    equipment: list[TripEquipmentItemOut]
    shopping: list[TripShoppingItemOut]
    documents: list[TripDocumentOut]
    schedule: list[TripScheduleItemOut]
    confirmations: list[TripConfirmationOut]
    contacts: list[TripContactOut]
    meals: list[TripMealOut]
