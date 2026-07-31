# This is a "join table": it's the standard SQL way to model a
# many-to-many relationship. One counselor can be assigned to several
# layers, and one layer can have several counselors — a plain foreign
# key on either side couldn't express that, so we need this middle table.
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
    # Prevents the same user being assigned to the same layer twice.
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

    # Note: an institution_admin does NOT need a row here to see every
    # layer in their institution — that's checked via role, not via
    # this table. Rows here only represent "is a counselor on this layer".
    user: Mapped["User"] = relationship(back_populates="layer_assignments")
    layer: Mapped["Layer"] = relationship(back_populates="assignments")
