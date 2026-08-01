# "Institution" is the umbrella that groups Layers (groups) and Users
# together. There's no login/password on Institution itself — users log
# in individually, and each user belongs to (at most) one institution.
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

# TYPE_CHECKING imports are only used by type checkers/IDEs, never at
# runtime. This avoids circular imports (Layer imports Institution too).
if TYPE_CHECKING:
    from app.models.layer import Layer
    from app.models.user import User


class Institution(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "institutions"   # actual table name in Postgres

    # Unique institution-wide: two different institutions with the exact
    # same name would be confusing (which "חינוך בית קמה" is this?).
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # "relationship" doesn't create a DB column — it lets Python code do
    # institution.users / institution.layers and get the related rows,
    # by following the foreign keys defined on User/Layer.
    users: Mapped[list["User"]] = relationship(back_populates="institution")
    layers: Mapped[list["Layer"]] = relationship(back_populates="institution")
