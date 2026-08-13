# Pins an existing repository Activity onto a *specific real date* for
# a specific layer -- e.g. "the Hanukkah party is on Dec 10th for שכבה
# ז'". This is the only scheduling primitive in the app: both the
# weekly grid (grouped by the real dates of whichever week is being
# viewed) and the year calendar render off the same dated rows, so
# paging to a week/date with nothing pinned to it is naturally empty
# instead of a recurring template repeating forever.
import uuid
from datetime import date as date_type
from datetime import time as time_type
from typing import TYPE_CHECKING

from sqlalchemy import ARRAY, Date, ForeignKey, Integer, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.activity import Activity
    from app.models.layer import Layer
    from app.models.user import User


class CalendarActivity(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "calendar_activities"

    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id", ondelete="CASCADE"), nullable=False
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"), nullable=False
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    # Optional -- a dated one-off event (e.g. a trip) may not need a
    # specific time, but a weekly-grid slot ("Sunday 16:00") does.
    start_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    # Which of the activity's equipment items THIS pinned use has
    # confirmed ready -- separate from the activity's own equipment
    # list, since "do we have it" is per dated use, not global.
    equipment_checked: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)

    layer: Mapped["Layer"] = relationship()
    activity: Mapped["Activity"] = relationship()
    created_by: Mapped["User"] = relationship()
