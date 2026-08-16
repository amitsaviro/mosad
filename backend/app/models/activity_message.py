# A private thread asking the creator of a repository Activity a
# question about it (how it went, what equipment they actually used,
# etc). Scoped to (activity, the two people talking) rather than a
# public comment -- app/models/activity_comment.py already covers the
# "visible to everyone" case, this is the 1:1 case.
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.activity import Activity
    from app.models.user import User


class ActivityMessage(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "activity_messages"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(String, nullable=False)

    activity: Mapped["Activity"] = relationship()
    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])
    recipient: Mapped["User"] = relationship(foreign_keys=[recipient_id])
