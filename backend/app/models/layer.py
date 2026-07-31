import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.counselor_layer_assignment import CounselorLayerAssignment
    from app.models.institution import Institution
    from app.models.participant import Participant


class Layer(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "layers"
    __table_args__ = (UniqueConstraint("institution_id", "name"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    join_code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    institution: Mapped["Institution"] = relationship(back_populates="layers")
    assignments: Mapped[list["CounselorLayerAssignment"]] = relationship(
        back_populates="layer"
    )
    participants: Mapped[list["Participant"]] = relationship(back_populates="layer")
