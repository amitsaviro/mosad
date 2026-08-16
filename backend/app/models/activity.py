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


class ActivityCategory(str, enum.Enum):
    """Content genre -- independent of ActivityType (the session-role
    of opener/main/closing). An activity can belong to several of
    these at once (e.g. a game that's also team-building)."""
    game = "game"                     # משחק
    workshop = "workshop"             # סדנה
    discussion = "discussion"         # שיח ודיון
    team_building = "team_building"   # גיבוש
    sports = "sports"                 # ספורט ותנועה
    arts = "arts"                     # אומנות ויצירה
    trip = "trip"                     # טיול ושטח
    ceremony = "ceremony"             # טקס
    boys_evening = "boys_evening"     # ערב בנים
    girls_evening = "girls_evening"   # ערב בנות


class ActivityLocation(str, enum.Enum):
    """A closed vocabulary rather than free text, so counselors can
    filter by location reliably instead of matching arbitrary strings
    like 'בחוץ' vs 'בחוץ בשלג'."""
    outdoor = "outdoor"               # בחוץ
    indoor_room = "indoor_room"       # חדר סגור
    sports_hall = "sports_hall"       # אולם ספורט
    classroom = "classroom"           # כיתה
    dining_hall = "dining_hall"       # חדר אוכל
    field_trip = "field_trip"         # שטח / טבע
    other = "other"                   # אחר


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
    # School-grade range (1 = א, ..., 12 = יב) -- this app organizes
    # everything around school-grade "layers" (e.g. "שכבה ז'"), so
    # matching an activity to grades is more useful than raw ages.
    grade_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_size_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_size_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    location: Mapped[ActivityLocation | None] = mapped_column(Enum(ActivityLocation), nullable=True)
    # Optional contact number for an external facilitator (e.g. someone
    # running a specific workshop) so another counselor browsing the
    # repository can reach out to book them.
    contact_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    # A structured checklist rather than free text, so the UI can show
    # it as tick-able items (and later, phase 8's calendar can attach
    # a per-scheduled-use "do we have this?" state to each item). An
    # empty list means the activity genuinely needs no equipment.
    equipment: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    # Estimated cost per participant, in ILS -- helps with trip/budget
    # planning later without forcing every activity to have a cost.
    budget_estimate: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Free-form keywords (holiday/season/theme, e.g. "חנוכה", "קיץ",
    # "ספורט") -- a plain array instead of a rigid enum, since the set
    # of holidays/themes isn't fixed and shouldn't require a migration
    # every time someone wants a new tag.
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    # Controlled vocabulary (ActivityCategory), unlike tags -- an
    # activity can have zero, one, or several. Stored as strings (not
    # a Postgres array-of-enum) so validation lives in the Pydantic
    # schema layer, same pattern as tags.
    categories: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)

    creator: Mapped["User"] = relationship()
    attachments: Mapped[list["ActivityAttachment"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    ratings: Mapped[list["ActivityRating"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    comments: Mapped[list["ActivityComment"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan", order_by="ActivityComment.created_at"
    )
