# Business logic for pinning a repository activity onto a real date for
# a specific layer -- listing is institution-wide (shown on the shared
# year overview, same visibility rule as key dates and layer rosters),
# creating/deleting requires managing the specific layer.
import uuid
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.calendar_activity import CalendarActivity
from app.models.layer import Layer
from app.models.user import User
from app.schemas.calendar_activity import CalendarActivityCreate, CalendarActivityOut, CalendarActivityUpdate
from app.services.layer_service import user_can_manage_layer


def create_calendar_activity(
    db: Session, user: User, layer: Layer, payload: CalendarActivityCreate
) -> CalendarActivity:
    activity = db.get(Activity, payload.activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפעילות לא נמצאה")

    entry = CalendarActivity(
        layer_id=layer.id,
        activity_id=activity.id,
        created_by_id=user.id,
        date=payload.date,
        notes=payload.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_calendar_activities_for_institution(db: Session, institution_id: uuid.UUID) -> list[CalendarActivity]:
    return (
        db.query(CalendarActivity)
        .join(Layer, CalendarActivity.layer_id == Layer.id)
        .filter(Layer.institution_id == institution_id)
        .order_by(CalendarActivity.date)
        .all()
    )


def get_calendar_activity_or_404(db: Session, entry_id: uuid.UUID) -> CalendarActivity:
    entry = db.get(CalendarActivity, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפעילות בלוח השנה לא נמצאה")
    return entry


def update_calendar_activity(db: Session, entry: CalendarActivity, payload: CalendarActivityUpdate) -> CalendarActivity:
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_calendar_activity(db: Session, entry: CalendarActivity) -> None:
    db.delete(entry)
    db.commit()


def to_calendar_activity_out(db: Session, user: User, entry: CalendarActivity) -> CalendarActivityOut:
    return CalendarActivityOut(
        id=entry.id,
        layer_id=entry.layer_id,
        layer_name=entry.layer.name,
        activity_id=entry.activity_id,
        activity_name=entry.activity.name,
        activity_type=entry.activity.activity_type.value,
        date=entry.date,
        notes=entry.notes,
        equipment=entry.activity.equipment,
        equipment_checked=entry.equipment_checked,
        created_by_name=entry.created_by.full_name,
        can_manage=user_can_manage_layer(db, user, entry.layer),
        is_past=entry.date < date.today(),
        created_at=entry.created_at,
    )
