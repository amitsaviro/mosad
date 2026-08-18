# A layer's recurring weekly meeting pattern and a free-text
# description of the group's character/vibe -- both feed the AI
# scheduling agent (ai_schedule_agent.py), which needs to know WHEN
# the layer meets and WHAT kind of activities suit it, without a
# counselor having to describe that from scratch on every request.
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.layer import Layer


class LayerScheduleProfile(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "layer_schedule_profiles"

    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Comma-separated DayOfWeek values (e.g. "tuesday,thursday") --
    # plain string instead of a Postgres array, since this row is
    # always read/written as one whole settings blob, never queried
    # per-day.
    meeting_days: Mapped[str] = mapped_column(String, nullable=False, default="")
    group_character: Mapped[str | None] = mapped_column(Text, nullable=True)

    layer: Mapped["Layer"] = relationship()
