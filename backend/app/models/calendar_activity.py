# Pins an existing repository Activity onto a *specific real date* for
# a specific layer -- e.g. "the Hanukkah party is on Dec 10th for שכבה
# ז'". Separate from ScheduledActivity (which is a recurring weekly
# template, no real date): this is a one-off dated event, shown on the
# shared year overview, and the natural place to rate the activity once
# that date has actually passed.
import uuid
from datetime import date as date_type
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String
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
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    layer: Mapped["Layer"] = relationship()
    activity: Mapped["Activity"] = relationship()
    created_by: Mapped["User"] = relationship()
