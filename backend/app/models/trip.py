# A trip/day-out file (תיק טיול) for a layer -- everything a counselor
# needs to actually run one: an itinerary, an equipment checklist, a
# shopping list, uploaded permission-slip/document links, and a
# per-participant "confirmed for the bus" roster. Kept as one file
# since all five sub-tables live and die with their parent Trip
# (cascade-deleted together) and none is complex enough to earn its
# own module.
import uuid
from datetime import date as date_type
from datetime import time as time_type
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.layer import Layer
    from app.models.participant import Participant
    from app.models.user import User


class Trip(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "trips"

    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id", ondelete="CASCADE"), nullable=False
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    destination: Mapped[str | None] = mapped_column(String, nullable=True)
    start_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    end_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    layer: Mapped["Layer"] = relationship()
    created_by: Mapped["User"] = relationship()
    equipment_items: Mapped[list["TripEquipmentItem"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", order_by="TripEquipmentItem.created_at"
    )
    shopping_items: Mapped[list["TripShoppingItem"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", order_by="TripShoppingItem.created_at"
    )
    documents: Mapped[list["TripDocument"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", order_by="TripDocument.created_at"
    )
    schedule_items: Mapped[list["TripScheduleItem"]] = relationship(
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="TripScheduleItem.time.nulls_last(), TripScheduleItem.created_at",
    )
    confirmations: Mapped[list["TripParticipantConfirmation"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )
    # Additional layers this trip is shared with, beyond its home
    # layer_id above -- a trip for a multi-layer outing (e.g. two
    # שכבות going on the same bus) without duplicating its equipment/
    # shopping/documents/schedule per layer the way CalendarActivity
    # sharing does (that works there because it has no nested data).
    shared_layers: Mapped[list["TripLayer"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )
    contacts: Mapped[list["TripContact"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", order_by="TripContact.created_at"
    )
    meals: Mapped[list["TripMeal"]] = relationship(back_populates="trip", cascade="all, delete-orphan")


class TripEquipmentItem(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "trip_equipment_items"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String, nullable=False)
    checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    trip: Mapped["Trip"] = relationship(back_populates="equipment_items")


class TripShoppingItem(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "trip_shopping_items"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String, nullable=False)
    checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    trip: Mapped["Trip"] = relationship(back_populates="shopping_items")


class TripDocument(UUIDPKMixin, TimestampMixin, Base):
    """A link to an uploaded permission slip / insurance doc / map --
    same url+label shape as ActivityAttachment, since this app has no
    binary file storage of its own; documents live wherever the
    counselor already put them (Drive, etc.) and this just links there."""
    __tablename__ = "trip_documents"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)

    trip: Mapped["Trip"] = relationship(back_populates="documents")


class TripScheduleItem(UUIDPKMixin, TimestampMixin, Base):
    """One line of the trip's itinerary (לוז) -- time is optional since
    not every stop has an exact time ("along the way")."""
    __tablename__ = "trip_schedule_items"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    time: Mapped[time_type | None] = mapped_column(Time, nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="schedule_items")


class TripParticipantConfirmation(UUIDPKMixin, TimestampMixin, Base):
    """Pre-trip headcount: "is this חניך confirmed for the bus" --
    separate from the day-to-day Attendance table, which is about
    regular activities on a normal schedule, not a one-off trip roster."""
    __tablename__ = "trip_participant_confirmations"
    __table_args__ = (UniqueConstraint("trip_id", "participant_id", name="uq_trip_confirmation_participant"),)

    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False
    )
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    trip: Mapped["Trip"] = relationship(back_populates="confirmations")
    participant: Mapped["Participant"] = relationship()


class TripLayer(UUIDPKMixin, TimestampMixin, Base):
    """A layer this trip is shared with, beyond its home layer -- lets
    e.g. two שכבות going on the same trip see and manage one shared
    trip file instead of each having their own duplicate copy."""
    __tablename__ = "trip_layers"
    __table_args__ = (UniqueConstraint("trip_id", "layer_id", name="uq_trip_layer"),)

    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("layers.id", ondelete="CASCADE"), nullable=False
    )

    trip: Mapped["Trip"] = relationship(back_populates="shared_layers")
    layer: Mapped["Layer"] = relationship()


class TripContact(UUIDPKMixin, TimestampMixin, Base):
    """An important phone number for the trip -- attraction manager,
    bus driver, etc. Just a label+phone pair, nothing fancier."""
    __tablename__ = "trip_contacts"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)

    trip: Mapped["Trip"] = relationship(back_populates="contacts")


class TripMeal(UUIDPKMixin, TimestampMixin, Base):
    """One meal slot (breakfast/lunch/dinner) on one date of the trip --
    one row per date+meal_type that actually has a menu set, so a
    multi-day trip just gets more rows instead of needing its days
    modeled anywhere; the date range is already on Trip itself."""
    __tablename__ = "trip_meals"
    __table_args__ = (UniqueConstraint("trip_id", "date", "meal_type", name="uq_trip_meal_slot"),)

    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    meal_type: Mapped[str] = mapped_column(String, nullable=False)  # 'breakfast' | 'lunch' | 'dinner'
    description: Mapped[str] = mapped_column(Text, nullable=False)

    trip: Mapped["Trip"] = relationship(back_populates="meals")
