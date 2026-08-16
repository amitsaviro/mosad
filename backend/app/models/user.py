# A registered account. Can exist with no institution/role yet (right
# after signup) — it gets one the moment the user creates or joins a group.
import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.counselor_layer_assignment import CounselorLayerAssignment
    from app.models.institution import Institution


class UserRole(str, enum.Enum):
    """Inherits from str too, so it's stored/serialized as a plain
    string ("institution_admin") instead of a Python-specific object."""
    institution_admin = "institution_admin"   # sees/manages every layer in their institution
    counselor = "counselor"                    # only sees layers they're assigned to


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "users"

    # nullable=True: a brand-new user has no institution until they
    # create their first group (become admin) or join one via code
    # (become counselor).
    institution_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id"), nullable=True
    )
    # Globally unique (not per-institution) so login only needs email+password,
    # no need to also ask "which institution do you belong to".
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)  # never the plain password
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[UserRole | None] = mapped_column(Enum(UserRole), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)  # soft-disable flag
    # Null until they open one of their own activities for the first
    # time -- comments from others on activities they created, after
    # this point, count as unread.
    activity_comments_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    institution: Mapped["Institution"] = relationship(back_populates="users")
    # All the (layer, assignment) rows connecting this user to layers they counsel.
    layer_assignments: Mapped[list["CounselorLayerAssignment"]] = relationship(
        back_populates="user"
    )
