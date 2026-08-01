# A link attached to an activity (presentation, PDF, YouTube song,
# etc). Just a URL for now -- actual file upload/storage would need
# object storage infrastructure we don't have set up yet.
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDPKMixin

if TYPE_CHECKING:
    from app.models.activity import Activity


class ActivityAttachment(UUIDPKMixin, Base):
    __tablename__ = "activity_attachments"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activities.id"), nullable=False
    )
    url: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str | None] = mapped_column(String, nullable=True)

    activity: Mapped["Activity"] = relationship(back_populates="attachments")
