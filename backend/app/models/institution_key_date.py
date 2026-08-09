# A single institution-wide landmark date (holiday, trip, assembly...)
# shown on the shared year overview alongside every layer's own weekly
# schedule. Deliberately just name+date -- no day-of-week/time -- since
# these are one-off dated events, not a recurring slot. Institution-wide
# (not per-layer) because a holiday affects every layer the same way.
import uuid
from datetime import date as date_type
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.institution import Institution


class InstitutionKeyDate(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "institution_key_dates"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String, nullable=True)

    institution: Mapped["Institution"] = relationship()
