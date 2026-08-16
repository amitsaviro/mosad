# A public Q&A-style comment on an activity ("does this work indoors
# too?") -- visible to everyone, not a private message to the uploader.
# reply_to_id lets any comment target a specific earlier one (most
# often the creator answering a specific asker), so a single public
# thread still supports a direct back-and-forth instead of a flat wall.
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
    reply_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activity_comments.id", ondelete="SET NULL"), nullable=True
    )

    activity: Mapped["Activity"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship()
    reply_to: Mapped["ActivityComment | None"] = relationship(remote_side="ActivityComment.id")
