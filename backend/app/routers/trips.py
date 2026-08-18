# Everything keyed by trip_id (not nested under a layer_id): viewing/
# editing/deleting a trip itself, and every mutation on its nested
# equipment/shopping/documents/schedule/roster -- get_manageable_trip
# covers authorization for all of it in one place.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_deletable_trip, get_manageable_trip, get_viewable_trip
from app.database import get_db
from app.models.trip import Trip
from app.models.user import User
from app.schemas.trip import (
    TripChecklistItemUpdate,
    TripConfirmationSet,
    TripContactCreate,
    TripContactOut,
    TripDocumentCreate,
    TripDocumentOut,
    TripEquipmentItemCreate,
    TripEquipmentItemOut,
    TripMealSet,
    TripOut,
    TripScheduleItemCreate,
    TripScheduleItemOut,
    TripScheduleItemUpdate,
    TripShareLayer,
    TripShoppingItemCreate,
    TripShoppingItemOut,
    TripUpdate,
)
from app.services.trip_service import (
    add_contact,
    add_document,
    add_equipment_item,
    add_schedule_item,
    add_shopping_item,
    delete_contact,
    delete_document,
    delete_equipment_item,
    delete_schedule_item,
    delete_shopping_item,
    delete_trip,
    set_confirmation,
    set_meal,
    share_trip_with_layer,
    to_trip_out,
    toggle_equipment_item,
    toggle_shopping_item,
    unshare_trip_from_layer,
    update_schedule_item,
    update_trip,
)

router = APIRouter(prefix="/trips", tags=["trips"])


@router.get("/{trip_id}", response_model=TripOut)
def get_trip_endpoint(
    trip: Trip = Depends(get_viewable_trip),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return to_trip_out(db, current_user, trip)


@router.patch("/{trip_id}", response_model=TripOut)
def update_trip_endpoint(
    payload: TripUpdate,
    trip: Trip = Depends(get_manageable_trip),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = update_trip(db, trip, payload)
    return to_trip_out(db, current_user, updated)


@router.delete("/{trip_id}", status_code=204)
def delete_trip_endpoint(trip: Trip = Depends(get_deletable_trip), db: Session = Depends(get_db)):
    delete_trip(db, trip)


@router.post("/{trip_id}/share", status_code=204)
def share_trip_endpoint(
    payload: TripShareLayer,
    trip: Trip = Depends(get_manageable_trip),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    share_trip_with_layer(db, current_user, trip, payload.layer_id)


@router.delete("/{trip_id}/share/{layer_id}", status_code=204)
def unshare_trip_endpoint(
    layer_id: uuid.UUID, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    unshare_trip_from_layer(db, trip, layer_id)


@router.post("/{trip_id}/equipment", response_model=TripEquipmentItemOut, status_code=201)
def add_equipment_item_endpoint(
    payload: TripEquipmentItemCreate, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    item = add_equipment_item(db, trip, payload)
    return TripEquipmentItemOut(id=item.id, label=item.label, checked=item.checked)


@router.patch("/{trip_id}/equipment/{item_id}", response_model=TripEquipmentItemOut)
def toggle_equipment_item_endpoint(
    item_id: uuid.UUID,
    payload: TripChecklistItemUpdate,
    trip: Trip = Depends(get_manageable_trip),
    db: Session = Depends(get_db),
):
    item = toggle_equipment_item(db, trip, item_id, payload.checked)
    return TripEquipmentItemOut(id=item.id, label=item.label, checked=item.checked)


@router.delete("/{trip_id}/equipment/{item_id}", status_code=204)
def delete_equipment_item_endpoint(
    item_id: uuid.UUID, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    delete_equipment_item(db, trip, item_id)


@router.post("/{trip_id}/shopping", response_model=TripShoppingItemOut, status_code=201)
def add_shopping_item_endpoint(
    payload: TripShoppingItemCreate, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    item = add_shopping_item(db, trip, payload)
    return TripShoppingItemOut(id=item.id, label=item.label, checked=item.checked)


@router.patch("/{trip_id}/shopping/{item_id}", response_model=TripShoppingItemOut)
def toggle_shopping_item_endpoint(
    item_id: uuid.UUID,
    payload: TripChecklistItemUpdate,
    trip: Trip = Depends(get_manageable_trip),
    db: Session = Depends(get_db),
):
    item = toggle_shopping_item(db, trip, item_id, payload.checked)
    return TripShoppingItemOut(id=item.id, label=item.label, checked=item.checked)


@router.delete("/{trip_id}/shopping/{item_id}", status_code=204)
def delete_shopping_item_endpoint(
    item_id: uuid.UUID, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    delete_shopping_item(db, trip, item_id)


@router.post("/{trip_id}/documents", response_model=TripDocumentOut, status_code=201)
def add_document_endpoint(
    payload: TripDocumentCreate, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    document = add_document(db, trip, payload)
    return TripDocumentOut(id=document.id, label=document.label, url=document.url)


@router.delete("/{trip_id}/documents/{document_id}", status_code=204)
def delete_document_endpoint(
    document_id: uuid.UUID, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    delete_document(db, trip, document_id)


@router.post("/{trip_id}/schedule", response_model=TripScheduleItemOut, status_code=201)
def add_schedule_item_endpoint(
    payload: TripScheduleItemCreate, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    item = add_schedule_item(db, trip, payload)
    return TripScheduleItemOut(id=item.id, time=item.time, title=item.title, notes=item.notes)


@router.patch("/{trip_id}/schedule/{item_id}", response_model=TripScheduleItemOut)
def update_schedule_item_endpoint(
    item_id: uuid.UUID,
    payload: TripScheduleItemUpdate,
    trip: Trip = Depends(get_manageable_trip),
    db: Session = Depends(get_db),
):
    item = update_schedule_item(db, trip, item_id, payload)
    return TripScheduleItemOut(id=item.id, time=item.time, title=item.title, notes=item.notes)


@router.delete("/{trip_id}/schedule/{item_id}", status_code=204)
def delete_schedule_item_endpoint(
    item_id: uuid.UUID, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    delete_schedule_item(db, trip, item_id)


@router.patch("/{trip_id}/confirmations/{participant_id}", status_code=204)
def set_confirmation_endpoint(
    participant_id: uuid.UUID,
    payload: TripConfirmationSet,
    trip: Trip = Depends(get_manageable_trip),
    db: Session = Depends(get_db),
):
    set_confirmation(db, trip, participant_id, payload.confirmed)


@router.post("/{trip_id}/contacts", response_model=TripContactOut, status_code=201)
def add_contact_endpoint(
    payload: TripContactCreate, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    contact = add_contact(db, trip, payload)
    return TripContactOut(id=contact.id, label=contact.label, phone=contact.phone)


@router.delete("/{trip_id}/contacts/{contact_id}", status_code=204)
def delete_contact_endpoint(
    contact_id: uuid.UUID, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    delete_contact(db, trip, contact_id)


@router.put("/{trip_id}/meals", status_code=204)
def set_meal_endpoint(
    payload: TripMealSet, trip: Trip = Depends(get_manageable_trip), db: Session = Depends(get_db)
):
    set_meal(db, trip, payload.date, payload.meal_type, payload.description)
