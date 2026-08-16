import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.activity import ActivityCategory, ActivityLocation, ActivityType


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
    """Body for POST /activities. Grade/size/duration/location/equipment/
    budget are all optional -- not every activity has (or needs) every
    attribute filled in."""
    name: str
    description: str
    activity_type: ActivityType
    grade_min: int | None = Field(default=None, ge=1, le=12)
    grade_max: int | None = Field(default=None, ge=1, le=12)
    duration_minutes: int | None = Field(default=None, ge=0)
    group_size_min: int | None = Field(default=None, ge=0)
    group_size_max: int | None = Field(default=None, ge=0)
    location: ActivityLocation | None = None
    equipment: list[str] = []
    budget_estimate: float | None = Field(default=None, ge=0)
    tags: list[str] = []
    categories: list[ActivityCategory] = []
    contact_phone: str | None = None
    attachments: list[AttachmentIn] = []

    @field_validator("equipment")
    @classmethod
    def equipment_items_must_not_be_blank(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item.strip()]

    @field_validator("contact_phone")
    @classmethod
    def contact_phone_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

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

    @model_validator(mode="after")
    def max_must_not_be_below_min(self) -> "ActivityCreate":
        if self.grade_min is not None and self.grade_max is not None and self.grade_max < self.grade_min:
            raise ValueError("שכבה מקסימלית חייבת להיות גדולה או שווה לשכבה המינימלית")
        if (
            self.group_size_min is not None
            and self.group_size_max is not None
            and self.group_size_max < self.group_size_min
        ):
            raise ValueError("כמות משתתפים מקסימלית חייבת להיות גדולה או שווה לכמות המינימלית")
        return self


class ActivityUpdate(BaseModel):
    """Same fields as ActivityCreate, all optional -- PATCH only
    changes what's provided. Attachments are replaced wholesale when
    provided (simplest mental model: 'this is the full list now')."""
    name: str | None = None
    description: str | None = None
    activity_type: ActivityType | None = None
    grade_min: int | None = Field(default=None, ge=1, le=12)
    grade_max: int | None = Field(default=None, ge=1, le=12)
    duration_minutes: int | None = Field(default=None, ge=0)
    group_size_min: int | None = Field(default=None, ge=0)
    group_size_max: int | None = Field(default=None, ge=0)
    location: ActivityLocation | None = None
    equipment: list[str] | None = None
    budget_estimate: float | None = Field(default=None, ge=0)
    tags: list[str] | None = None
    categories: list[ActivityCategory] | None = None
    contact_phone: str | None = None
    attachments: list[AttachmentIn] | None = None

    @field_validator("equipment")
    @classmethod
    def equipment_items_must_not_be_blank(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return [item.strip() for item in value if item.strip()]

    @field_validator("contact_phone")
    @classmethod
    def contact_phone_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def max_must_not_be_below_min(self) -> "ActivityUpdate":
        # Only checks the relationship when both sides are present in
        # THIS request -- the service layer re-validates against the
        # full merged activity afterwards to catch partial updates
        # (e.g. only grade_max sent) that would conflict with the
        # existing stored value.
        if self.grade_min is not None and self.grade_max is not None and self.grade_max < self.grade_min:
            raise ValueError("שכבה מקסימלית חייבת להיות גדולה או שווה לשכבה המינימלית")
        if (
            self.group_size_min is not None
            and self.group_size_max is not None
            and self.group_size_max < self.group_size_min
        ):
            raise ValueError("כמות משתתפים מקסימלית חייבת להיות גדולה או שווה לכמות המינימלית")
        return self


class ActivityOut(BaseModel):
    id: uuid.UUID
    creator_id: uuid.UUID
    creator_name: str
    name: str
    description: str
    activity_type: ActivityType
    grade_min: int | None
    grade_max: int | None
    duration_minutes: int | None
    group_size_min: int | None
    group_size_max: int | None
    location: ActivityLocation | None
    equipment: list[str]
    budget_estimate: float | None
    tags: list[str]
    categories: list[ActivityCategory]
    contact_phone: str | None
    attachments: list[AttachmentOut]
    average_rating: float | None
    usage_count: int
    can_manage: bool
    created_at: datetime


class ActivityListOut(BaseModel):
    """Paginated wrapper for GET /activities -- the repository is
    nationwide and will keep growing, so the client always gets a
    page + total count instead of the full unbounded list."""
    items: list[ActivityOut]
    total: int
    page: int
    page_size: int


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
    reply_to_id: uuid.UUID | None = None

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
    reply_to_id: uuid.UUID | None
    reply_to_user_name: str | None
    created_at: datetime


class ActivityCommentsUnreadCountOut(BaseModel):
    count: int


class ActivityCommentNotificationOut(BaseModel):
    """A single unread comment plus which activity it's on -- the
    compact notification-list shape, not the full comment thread."""
    id: uuid.UUID
    activity_id: uuid.UUID
    activity_name: str
    user_name: str
    body: str
    created_at: datetime
