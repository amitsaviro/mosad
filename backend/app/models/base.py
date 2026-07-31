# Shared building blocks ("mixins") reused by every table, so we don't
# repeat the same id/timestamp columns in every model file.
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPKMixin:
    """Gives a table a random UUID primary key instead of 1, 2, 3...
    Reason: a plain counter leaks info (e.g. "user #4" = 4th signup ever)
    and makes it easy to guess other rows' IDs. UUIDs don't."""
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    """Adds created_at / updated_at columns, filled in automatically
    by Postgres itself (server_default=func.now()) — not by Python —
    so every row always has accurate timestamps."""
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
