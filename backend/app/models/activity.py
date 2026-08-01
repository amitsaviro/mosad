# "Activity" is nationwide, not scoped to any institution — any
# registered user can upload one, and every user can browse/search all
# of them. Only the creator can edit or delete their own activity.
import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ARRAY, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.activity_attachment import ActivityAttachment
    from app.models.activity_comment import ActivityComment
    from app.models.activity_rating import ActivityRating
    from app.models.user import User


class ActivityType(str, enum.Enum):
    opener = "opener"       # משחק פתיחה, usually short
    main = "main"           # הפעילות המרכזית
    closing = "closing"     # סיכום/נעילה


class Activity(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "activities"

    creator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    activity_type: Mapped[ActivityType] = mapped_column(Enum(ActivityType), nullable=False)

    # All optional: a counselor filling this in shouldn't be blocked by
    # fields that genuinely don't apply to every activity.
    age_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    age_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_size_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_size_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    required_equipment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Estimated cost per participant, in ILS -- helps with trip/budget
    # planning later without forcing every activity to have a cost.
    budget_estimate: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Free-form keywords (holiday/season/theme, e.g. "חנוכה", "קיץ",
    # "ספורט") -- a plain array instead of a rigid enum, since the set
    # of holidays/themes isn't fixed and shouldn't require a migration
    # every time someone wants a new tag.
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)

    creator: Mapped["User"] = relationship()
    attachments: Mapped[list["ActivityAttachment"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    ratings: Mapped[list["ActivityRating"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    comments: Mapped[list["ActivityComment"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
