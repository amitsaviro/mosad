import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.activity import ActivityType


class AttachmentIn(BaseModel):
    url: str
    label: str | None = None

    @field_validator("url")
    @classmethod
    def url_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("קישור לא יכול להיות ריק")
        return stripped


class AttachmentOut(BaseModel):
    id: uuid.UUID
    url: str
    label: str | None

    model_config = {"from_attributes": True}


class ActivityCreate(BaseModel):
    """Body for POST /activities. Age/size/duration/location/equipment/
    budget are all optional -- not every activity has (or needs) every
    attribute filled in."""
    name: str
    description: str
    activity_type: ActivityType
    age_min: int | None = None
    age_max: int | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    group_size_min: int | None = None
    group_size_max: int | None = None
    location: str | None = None
    required_equipment: str | None = None
    budget_estimate: float | None = Field(default=None, ge=0)
    tags: list[str] = []
    attachments: list[AttachmentIn] = []

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם הפעילות לא יכול להיות ריק")
        return stripped

    @field_validator("description")
    @classmethod
    def description_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("תיאור הפעילות לא יכול להיות ריק")
        return stripped


class ActivityUpdate(BaseModel):
    """Same fields as ActivityCreate, all optional -- PATCH only
    changes what's provided. Attachments are replaced wholesale when
    provided (simplest mental model: 'this is the full list now')."""
    name: str | None = None
    description: str | None = None
    activity_type: ActivityType | None = None
    age_min: int | None = None
    age_max: int | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    group_size_min: int | None = None
    group_size_max: int | None = None
    location: str | None = None
    required_equipment: str | None = None
    budget_estimate: float | None = Field(default=None, ge=0)
    tags: list[str] | None = None
    attachments: list[AttachmentIn] | None = None


class ActivityOut(BaseModel):
    id: uuid.UUID
    creator_id: uuid.UUID
    creator_name: str
    name: str
    description: str
    activity_type: ActivityType
    age_min: int | None
    age_max: int | None
    duration_minutes: int | None
    group_size_min: int | None
    group_size_max: int | None
    location: str | None
    required_equipment: str | None
    budget_estimate: float | None
    tags: list[str]
    attachments: list[AttachmentOut]
    average_rating: float | None
    usage_count: int
    can_manage: bool
    created_at: datetime


class ActivityRatingCreate(BaseModel):
    layer_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    notes: str | None = None


class ActivityRatingOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    layer_id: uuid.UUID
    layer_name: str
    rating: int
    notes: str | None
    created_at: datetime


class ActivityCommentCreate(BaseModel):
    body: str

    @field_validator("body")
    @classmethod
    def body_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("התגובה לא יכולה להיות ריקה")
        return stripped


class ActivityCommentOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    body: str
    created_at: datetime
