# Business logic for a layer's trip file (תיק טיול): the trip itself,
# its equipment/shopping checklists, document links, itinerary, and the
# per-participant "confirmed for the bus" roster.
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.layer import Layer
from app.models.participant import Participant
from app.models.trip import (
    Trip,
    TripDocument,
    TripEquipmentItem,
    TripParticipantConfirmation,
    TripScheduleItem,
    TripShoppingItem,
)
from app.models.user import User
from app.schemas.trip import (
    TripConfirmationOut,
    TripCreate,
    TripDocumentCreate,
    TripDocumentOut,
    TripEquipmentItemCreate,
    TripEquipmentItemOut,
    TripOut,
    TripScheduleItemCreate,
    TripScheduleItemOut,
    TripScheduleItemUpdate,
    TripShoppingItemCreate,
    TripShoppingItemOut,
    TripSummaryOut,
    TripUpdate,
)
from app.services.layer_service import user_can_manage_layer
from app.services.participant_service import list_participants


def create_trip(db: Session, user: User, layer: Layer, payload: TripCreate) -> Trip:
    end_date = payload.end_date or payload.start_date
    if end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="תאריך הסיום חייב להיות אחרי תאריך ההתחלה")

    trip = Trip(
        layer_id=layer.id,
        created_by_id=user.id,
        name=payload.name,
        destination=payload.destination,
        start_date=payload.start_date,
        end_date=end_date,
        notes=payload.notes,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return trip


def list_trips_for_layer(db: Session, layer: Layer) -> list[Trip]:
    return db.query(Trip).filter(Trip.layer_id == layer.id).order_by(Trip.start_date.desc()).all()


def update_trip(db: Session, trip: Trip, payload: TripUpdate) -> Trip:
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(trip, field, value)

    if trip.end_date < trip.start_date:
        raise HTTPException(status_code=422, detail="תאריך הסיום חייב להיות אחרי תאריך ההתחלה")

    db.commit()
    db.refresh(trip)
    return trip


def delete_trip(db: Session, trip: Trip) -> None:
    db.delete(trip)
    db.commit()


def _get_trip_item_or_404(db: Session, model_cls, item_id: uuid.UUID, trip_id: uuid.UUID, message: str):
    item = db.get(model_cls, item_id)
    if item is None or item.trip_id != trip_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return item


def add_equipment_item(db: Session, trip: Trip, payload: TripEquipmentItemCreate) -> TripEquipmentItem:
    item = TripEquipmentItem(trip_id=trip.id, label=payload.label.strip())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def toggle_equipment_item(db: Session, trip: Trip, item_id: uuid.UUID, checked: bool) -> TripEquipmentItem:
    item = _get_trip_item_or_404(db, TripEquipmentItem, item_id, trip.id, "פריט הציוד לא נמצא")
    item.checked = checked
    db.commit()
    db.refresh(item)
    return item


def delete_equipment_item(db: Session, trip: Trip, item_id: uuid.UUID) -> None:
    item = _get_trip_item_or_404(db, TripEquipmentItem, item_id, trip.id, "פריט הציוד לא נמצא")
    db.delete(item)
    db.commit()


def add_shopping_item(db: Session, trip: Trip, payload: TripShoppingItemCreate) -> TripShoppingItem:
    item = TripShoppingItem(trip_id=trip.id, label=payload.label.strip())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def toggle_shopping_item(db: Session, trip: Trip, item_id: uuid.UUID, checked: bool) -> TripShoppingItem:
    item = _get_trip_item_or_404(db, TripShoppingItem, item_id, trip.id, "הפריט לא נמצא ברשימת הקניות")
    item.checked = checked
    db.commit()
    db.refresh(item)
    return item


def delete_shopping_item(db: Session, trip: Trip, item_id: uuid.UUID) -> None:
    item = _get_trip_item_or_404(db, TripShoppingItem, item_id, trip.id, "הפריט לא נמצא ברשימת הקניות")
    db.delete(item)
    db.commit()


def add_document(db: Session, trip: Trip, payload: TripDocumentCreate) -> TripDocument:
    document = TripDocument(trip_id=trip.id, label=payload.label.strip(), url=payload.url.strip())
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def delete_document(db: Session, trip: Trip, document_id: uuid.UUID) -> None:
    document = _get_trip_item_or_404(db, TripDocument, document_id, trip.id, "המסמך לא נמצא")
    db.delete(document)
    db.commit()


def add_schedule_item(db: Session, trip: Trip, payload: TripScheduleItemCreate) -> TripScheduleItem:
    item = TripScheduleItem(trip_id=trip.id, time=payload.time, title=payload.title.strip(), notes=payload.notes)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_schedule_item(
    db: Session, trip: Trip, item_id: uuid.UUID, payload: TripScheduleItemUpdate
) -> TripScheduleItem:
    item = _get_trip_item_or_404(db, TripScheduleItem, item_id, trip.id, "פריט הלו״ז לא נמצא")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def delete_schedule_item(db: Session, trip: Trip, item_id: uuid.UUID) -> None:
    item = _get_trip_item_or_404(db, TripScheduleItem, item_id, trip.id, "פריט הלו״ז לא נמצא")
    db.delete(item)
    db.commit()


def set_confirmation(db: Session, trip: Trip, participant_id: uuid.UUID, confirmed: bool) -> TripParticipantConfirmation:
    participant = db.get(Participant, participant_id)
    if participant is None or participant.layer_id != trip.layer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="החניך לא נמצא בשכבה זו")

    row = (
        db.query(TripParticipantConfirmation)
        .filter(
            TripParticipantConfirmation.trip_id == trip.id,
            TripParticipantConfirmation.participant_id == participant_id,
        )
        .first()
    )
    if row is None:
        row = TripParticipantConfirmation(trip_id=trip.id, participant_id=participant_id, confirmed=confirmed)
        db.add(row)
    else:
        row.confirmed = confirmed
    db.commit()
    db.refresh(row)
    return row


def _confirmations_out(db: Session, trip: Trip) -> list[TripConfirmationOut]:
    # Every active participant shows up, confirmed or not -- the whole
    # point is a complete headcount, not just who's already checked in.
    active_participants = [p for p in list_participants(db, trip.layer) if p.is_active]
    confirmed_ids = {
        row.participant_id
        for row in db.query(TripParticipantConfirmation).filter(
            TripParticipantConfirmation.trip_id == trip.id, TripParticipantConfirmation.confirmed.is_(True)
        )
    }
    return [
        TripConfirmationOut(participant_id=p.id, participant_name=p.full_name, confirmed=p.id in confirmed_ids)
        for p in active_participants
    ]


def to_trip_summary_out(db: Session, user: User, trip: Trip) -> TripSummaryOut:
    return TripSummaryOut(
        id=trip.id,
        layer_id=trip.layer_id,
        name=trip.name,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        can_manage=user_can_manage_layer(db, user, trip.layer),
        created_at=trip.created_at,
    )


def to_trip_out(db: Session, user: User, trip: Trip) -> TripOut:
    return TripOut(
        id=trip.id,
        layer_id=trip.layer_id,
        layer_name=trip.layer.name,
        name=trip.name,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        notes=trip.notes,
        created_by_name=trip.created_by.full_name,
        can_manage=user_can_manage_layer(db, user, trip.layer),
        created_at=trip.created_at,
        equipment=[TripEquipmentItemOut(id=i.id, label=i.label, checked=i.checked) for i in trip.equipment_items],
        shopping=[TripShoppingItemOut(id=i.id, label=i.label, checked=i.checked) for i in trip.shopping_items],
        documents=[TripDocumentOut(id=d.id, label=d.label, url=d.url) for d in trip.documents],
        schedule=[
            TripScheduleItemOut(id=s.id, time=s.time, title=s.title, notes=s.notes) for s in trip.schedule_items
        ],
        confirmations=_confirmations_out(db, trip),
    )
