# Business logic for a layer's trip file (תיק טיול): the trip itself,
# its equipment/shopping checklists, document links, itinerary, meal
# plan, important contacts, the per-participant "confirmed for the
# bus" roster, and sharing a trip across more than one layer.
import uuid
from datetime import date as date_type

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.layer import Layer
from app.models.participant import Participant
from app.models.trip import (
    Trip,
    TripContact,
    TripDocument,
    TripEquipmentItem,
    TripLayer,
    TripMeal,
    TripParticipantConfirmation,
    TripScheduleItem,
    TripShoppingItem,
)
from app.models.user import User
from app.schemas.trip import (
    TripConfirmationOut,
    TripContactCreate,
    TripContactOut,
    TripCreate,
    TripDocumentCreate,
    TripDocumentOut,
    TripEquipmentItemCreate,
    TripEquipmentItemOut,
    TripLayerSummary,
    TripMealOut,
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

_MEAL_ORDER = {"breakfast": 0, "lunch": 1, "dinner": 2}


def get_trip_associated_layers(db: Session, trip: Trip) -> list[Layer]:
    """Every layer this trip is visible/manageable from: its home layer
    plus everything it's been shared with. Used for every permission
    check on the trip (view/manage) and for building the roster from
    all the layers' participants combined."""
    layer_ids = {trip.layer_id} | {tl.layer_id for tl in trip.shared_layers}
    return db.query(Layer).filter(Layer.id.in_(layer_ids)).all()


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
    db.flush()  # assigns trip.id, needed for the TripLayer rows below

    for share_layer_id in dict.fromkeys(payload.share_layer_ids):  # dedupe, keep order
        if share_layer_id == layer.id:
            continue
        share_layer = db.get(Layer, share_layer_id)
        if share_layer is None or not user_can_manage_layer(db, user, share_layer):
            raise HTTPException(status_code=404, detail="אחת השכבות שנבחרו לשיתוף לא נמצאה")
        db.add(TripLayer(trip_id=trip.id, layer_id=share_layer_id))

    db.commit()
    db.refresh(trip)
    return trip


def list_trips_for_layer(db: Session, layer: Layer) -> list[Trip]:
    """A trip shows up in a layer's list if it's that layer's home trip
    OR it's been shared with that layer."""
    shared_trip_ids = db.query(TripLayer.trip_id).filter(TripLayer.layer_id == layer.id)
    return (
        db.query(Trip)
        .filter(or_(Trip.layer_id == layer.id, Trip.id.in_(shared_trip_ids)))
        .order_by(Trip.start_date.desc())
        .all()
    )


def share_trip_with_layer(db: Session, user: User, trip: Trip, layer_id: uuid.UUID) -> None:
    layer = db.get(Layer, layer_id)
    if layer is None or not user_can_manage_layer(db, user, layer):
        raise HTTPException(status_code=404, detail="השכבה לא נמצאה")
    if layer.id == trip.layer_id:
        return  # already the home layer
    existing = (
        db.query(TripLayer).filter(TripLayer.trip_id == trip.id, TripLayer.layer_id == layer.id).first()
    )
    if existing is not None:
        return
    db.add(TripLayer(trip_id=trip.id, layer_id=layer.id))
    db.commit()


def unshare_trip_from_layer(db: Session, trip: Trip, layer_id: uuid.UUID) -> None:
    if layer_id == trip.layer_id:
        raise HTTPException(status_code=400, detail="לא ניתן להסיר את השכבה הראשית של תיק הטיול")
    row = db.query(TripLayer).filter(TripLayer.trip_id == trip.id, TripLayer.layer_id == layer_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="השכבה אינה משותפת בתיק הטיול")
    db.delete(row)
    db.commit()


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


def add_contact(db: Session, trip: Trip, payload: TripContactCreate) -> TripContact:
    contact = TripContact(trip_id=trip.id, label=payload.label.strip(), phone=payload.phone.strip())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def delete_contact(db: Session, trip: Trip, contact_id: uuid.UUID) -> None:
    contact = _get_trip_item_or_404(db, TripContact, contact_id, trip.id, "איש הקשר לא נמצא")
    db.delete(contact)
    db.commit()


def set_meal(db: Session, trip: Trip, meal_date: date_type, meal_type: str, description: str) -> None:
    row = (
        db.query(TripMeal)
        .filter(TripMeal.trip_id == trip.id, TripMeal.date == meal_date, TripMeal.meal_type == meal_type)
        .first()
    )
    stripped = description.strip()
    if not stripped:
        if row is not None:
            db.delete(row)
            db.commit()
        return
    if row is None:
        db.add(TripMeal(trip_id=trip.id, date=meal_date, meal_type=meal_type, description=stripped))
    else:
        row.description = stripped
    db.commit()


def _meals_out(trip: Trip) -> list[TripMealOut]:
    ordered = sorted(trip.meals, key=lambda m: (m.date, _MEAL_ORDER.get(m.meal_type, 99)))
    return [TripMealOut(id=m.id, date=m.date, meal_type=m.meal_type, description=m.description) for m in ordered]


def set_confirmation(db: Session, trip: Trip, participant_id: uuid.UUID, confirmed: bool) -> TripParticipantConfirmation:
    associated_layer_ids = {layer.id for layer in get_trip_associated_layers(db, trip)}
    participant = db.get(Participant, participant_id)
    if participant is None or participant.layer_id not in associated_layer_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="החניך לא נמצא באחת השכבות של תיק הטיול")

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


def _confirmations_out(db: Session, trip: Trip, layers: list[Layer]) -> list[TripConfirmationOut]:
    # Every active participant of every associated layer shows up,
    # confirmed or not -- the whole point is a complete headcount, not
    # just who's already checked in.
    active_participants: list[Participant] = []
    seen_ids: set[uuid.UUID] = set()
    for layer in layers:
        for p in list_participants(db, layer):
            if p.is_active and p.id not in seen_ids:
                seen_ids.add(p.id)
                active_participants.append(p)

    confirmed_ids = {
        row.participant_id
        for row in db.query(TripParticipantConfirmation).filter(
            TripParticipantConfirmation.trip_id == trip.id, TripParticipantConfirmation.confirmed.is_(True)
        )
    }
    return [
        TripConfirmationOut(
            participant_id=p.id,
            participant_name=p.full_name,
            confirmed=p.id in confirmed_ids,
            allergies=p.allergies,
        )
        for p in active_participants
    ]


def to_trip_summary_out(db: Session, user: User, trip: Trip) -> TripSummaryOut:
    layers = get_trip_associated_layers(db, trip)
    return TripSummaryOut(
        id=trip.id,
        layer_id=trip.layer_id,
        name=trip.name,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        can_manage=any(user_can_manage_layer(db, user, layer) for layer in layers),
        is_shared=len(layers) > 1,
        created_at=trip.created_at,
    )


def to_trip_out(db: Session, user: User, trip: Trip) -> TripOut:
    layers = get_trip_associated_layers(db, trip)
    shared_layers = [TripLayerSummary(id=layer.id, name=layer.name) for layer in layers if layer.id != trip.layer_id]
    return TripOut(
        id=trip.id,
        layer_id=trip.layer_id,
        layer_name=trip.layer.name,
        shared_layers=shared_layers,
        name=trip.name,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        notes=trip.notes,
        created_by_name=trip.created_by.full_name,
        can_manage=any(user_can_manage_layer(db, user, layer) for layer in layers),
        can_delete=trip.created_by_id == user.id,
        created_at=trip.created_at,
        equipment=[TripEquipmentItemOut(id=i.id, label=i.label, checked=i.checked) for i in trip.equipment_items],
        shopping=[TripShoppingItemOut(id=i.id, label=i.label, checked=i.checked) for i in trip.shopping_items],
        documents=[TripDocumentOut(id=d.id, label=d.label, url=d.url) for d in trip.documents],
        schedule=[
            TripScheduleItemOut(id=s.id, time=s.time, title=s.title, notes=s.notes) for s in trip.schedule_items
        ],
        confirmations=_confirmations_out(db, trip, layers),
        contacts=[TripContactOut(id=c.id, label=c.label, phone=c.phone) for c in trip.contacts],
        meals=_meals_out(trip),
    )
