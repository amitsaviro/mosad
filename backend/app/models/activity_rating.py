# A single "we used this activity, here's how it went" entry. Each use
# gets its own rating row (not one rating per user per activity), so
# the same counselor can rate the same activity again next time they
# use it with a different (or the same) group -- that's what makes
# "used 4 times, avg rating 4.5" meaningful.
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.activity import Activity
    from app.models.layer import Layer
    from app.models.user import User


class ActivityRating(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "activity_ratings"
    __table_args__ = (CheckConstraint("rating >= 1 AND rating <= 5", name="rating_range"),)

    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activities.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    # Which layer/group actually used it -- required, since "per-group
    # history" (has my group done this before?) is the whole point.
    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id"), nullable=False
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    activity: Mapped["Activity"] = relationship(back_populates="ratings")
    user: Mapped["User"] = relationship()
    layer: Mapped["Layer"] = relationship()
