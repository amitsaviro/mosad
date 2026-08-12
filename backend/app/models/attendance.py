# Per-participant present/absent record for a real calendar date --
# one row per (participant, date), so re-marking a day just updates
# the same row instead of piling up duplicates.
import uuid
from datetime import date as date_type
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.participant import Participant
    from app.models.user import User


class Attendance(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("participant_id", "date", name="uq_attendance_participant_date"),)

    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    present: Mapped[bool] = mapped_column(Boolean, nullable=False)
    marked_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    participant: Mapped["Participant"] = relationship()
    marked_by: Mapped["User"] = relationship()
