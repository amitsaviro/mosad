# A public Q&A-style comment on an activity ("does this work indoors
# too?") -- visible to everyone, not a private message to the uploader.
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.activity import Activity
    from app.models.user import User


class ActivityComment(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "activity_comments"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activities.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    activity: Mapped["Activity"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship()
