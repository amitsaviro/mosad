from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.layer import Layer
    from app.models.user import User


class Institution(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "institutions"

    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="institution")
    layers: Mapped[list["Layer"]] = relationship(back_populates="institution")
