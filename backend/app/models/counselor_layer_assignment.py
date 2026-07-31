import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDPKMixin

if TYPE_CHECKING:
    from app.models.layer import Layer
    from app.models.user import User


class CounselorLayerAssignment(UUIDPKMixin, Base):
    __tablename__ = "counselor_layer_assignments"
    __table_args__ = (UniqueConstraint("user_id", "layer_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="layer_assignments")
    layer: Mapped["Layer"] = relationship(back_populates="assignments")
