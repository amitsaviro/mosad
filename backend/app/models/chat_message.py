# A per-layer team chat -- one channel per layer (שכבה), for the
# counselors actually coordinating that group's day-to-day, rather than
# one institution-wide firehose everyone has to filter through.
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.layer import Layer
    from app.models.user import User


class ChatMessage(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "chat_messages"

    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(String, nullable=False)

    layer: Mapped["Layer"] = relationship()
    author: Mapped["User"] = relationship()


class LayerChatRead(UUIDPKMixin, Base):
    """One row per (user, layer) -- when that user last opened that
    layer's chat, so unread counts don't need a read-receipt row per
    message per member."""
    __tablename__ = "layer_chat_reads"
    __table_args__ = (UniqueConstraint("user_id", "layer_id", name="uq_layer_chat_reads_user_layer"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id", ondelete="CASCADE"), nullable=False
    )
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
