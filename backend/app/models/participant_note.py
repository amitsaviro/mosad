# A single dated note about a participant (חניך) -- e.g. "התקשה
# בפעילות היום, כדאי לעקוב". Its own table (not a free-text column on
# Participant) so a history of notes with author+timestamp survives as
# new ones get added, instead of one note overwriting the last.
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.participant import Participant
    from app.models.user import User


class ParticipantNote(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "participant_notes"

    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    participant: Mapped["Participant"] = relationship()
    author: Mapped["User"] = relationship()
