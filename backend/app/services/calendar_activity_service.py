# Business logic for pinning a repository activity onto a real date for
# a specific layer -- listing is institution-wide (shown on the shared
# year overview, same visibility rule as key dates and layer rosters),
# creating/deleting requires managing the specific layer. Also the
# backing store for the weekly grid view: a slot with a start_time is
# just a dated activity grouped by weekday client-side.
import uuid
from datetime import date as date_type
from datetime import datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.calendar_activity import CalendarActivity
from app.models.layer import Layer
from app.models.user import User
from app.schemas.calendar_activity import CalendarActivityCreate, CalendarActivityOut, CalendarActivityUpdate
from app.services.layer_service import user_can_manage_layer


def _end_time(start: time, duration_minutes: int) -> time:
    return (datetime.combine(date_type.today(), start) + timedelta(minutes=duration_minutes)).time()


def _effective_duration(entry_duration: int | None, activity: Activity) -> int | None:
    return entry_duration if entry_duration is not None else activity.duration_minutes


def _check_no_overlap(
    db: Session,
    layer_id: uuid.UUID,
    on_date: date_type,
    start_time: time | None,
    duration_minutes: int | None,
    exclude_id: uuid.UUID | None = None,
) -> None:
    if start_time is None or duration_minutes is None:
        # Untimed entry, or unknown length -- nothing meaningful to
        # compare against, so skip the check rather than block on a guess.
        return
    new_end = _end_time(start_time, duration_minutes)

    same_day = db.query(CalendarActivity).filter(
        CalendarActivity.layer_id == layer_id, CalendarActivity.date == on_date
    )
    if exclude_id is not None:
        same_day = same_day.filter(CalendarActivity.id != exclude_id)

    for other in same_day.all():
        if other.start_time is None:
            continue
        if other.start_time == start_time:
            # Same exact start time = an intentional composite block
            # (e.g. an opener activity followed immediately by a main
            # activity, both "at 16:00") -- not a double-booking.
            continue
        other_duration = _effective_duration(other.duration_minutes, other.activity)
        if other_duration is None:
            continue
        other_end = _end_time(other.start_time, other_duration)
        # Two half-open intervals [start, end) overlap iff each starts
        # before the other ends.
        if start_time < other_end and other.start_time < new_end:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"כבר יש פעילות משובצת בשעה זו ({other.activity.name})",
            )


def create_calendar_activity(
    db: Session, user: User, layer: Layer, payload: CalendarActivityCreate
) -> CalendarActivity:
    activity = db.get(Activity, payload.activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפעילות לא נמצאה")

    _check_no_overlap(
        db, layer.id, payload.date, payload.start_time,
        _effective_duration(payload.duration_minutes, activity),
    )

    entry = CalendarActivity(
        layer_id=layer.id,
        activity_id=activity.id,
        created_by_id=user.id,
        date=payload.date,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
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
        .order_by(CalendarActivity.date, CalendarActivity.start_time)
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

    if {"start_time", "duration_minutes"} & changes.keys():
        _check_no_overlap(
            db, entry.layer_id, entry.date, entry.start_time,
            _effective_duration(entry.duration_minutes, entry.activity),
            exclude_id=entry.id,
        )

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
        start_time=entry.start_time,
        duration_minutes=_effective_duration(entry.duration_minutes, entry.activity),
        notes=entry.notes,
        equipment=entry.activity.equipment,
        equipment_checked=entry.equipment_checked,
        created_by_name=entry.created_by.full_name,
        can_manage=user_can_manage_layer(db, user, entry.layer),
        is_past=entry.date < date_type.today(),
        created_at=entry.created_at,
    )
