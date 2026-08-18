# A "Participant" is a child/teen (חניך) belonging to one Layer.
# Kept minimal for now — attendance, notes and birthday alerts (phase 9)
# will hang additional tables off of participant_id later, so this
# table stays simple and doesn't need reworking then.
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.layer import Layer


class Participant(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "participants"

    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id"), nullable=False
    )
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    guardian_contact: Mapped[str | None] = mapped_column(String, nullable=True)
    allergies: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "soft delete": mark inactive instead of removing the row, so
    # attendance/notes history from past years is never lost.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    layer: Mapped["Layer"] = relationship(back_populates="participants")
