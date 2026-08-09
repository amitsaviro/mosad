# A layer's weekly schedule: pins an existing repository Activity onto
# a recurring day-of-week + time slot for that specific layer. This is
# a *template* week (like "every Sunday at 16:00"), not dated calendar
# events -- simplest thing that actually matches how a youth-movement
# layer's week repeats.
import enum
import uuid
from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import ARRAY, Enum, ForeignKey, Integer, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.activity import Activity
    from app.models.layer import Layer
    from app.models.user import User


class DayOfWeek(str, enum.Enum):
    sunday = "sunday"
    monday = "monday"
    tuesday = "tuesday"
    wednesday = "wednesday"
    thursday = "thursday"
    friday = "friday"
    saturday = "saturday"


class ScheduledActivity(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "scheduled_activities"

    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id", ondelete="CASCADE"), nullable=False
    )
    # If the source activity gets deleted from the repository, the slot
    # referencing it no longer makes sense either -- cascade it away
    # rather than leaving a dangling reference the frontend can't render.
    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"), nullable=False
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    day_of_week: Mapped[DayOfWeek] = mapped_column(Enum(DayOfWeek), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    # Optional override -- defaults to the activity's own duration in
    # the UI, but a layer might run the same activity shorter/longer.
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    # Which of the activity's equipment items THIS layer has confirmed
    # ready for THIS slot -- separate from the activity's own equipment
    # list, since "do we have it" is per scheduled use, not global.
    equipment_checked: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)

    layer: Mapped["Layer"] = relationship()
    activity: Mapped["Activity"] = relationship()
    created_by: Mapped["User"] = relationship()
