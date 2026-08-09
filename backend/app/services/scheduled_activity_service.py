# Business logic for a layer's weekly schedule: pinning repository
# activities onto day/time slots, editing/removing them, and toggling
# the per-slot "do we have this equipment" checklist.
import uuid
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.layer import Layer
from app.models.scheduled_activity import DayOfWeek, ScheduledActivity
from app.models.user import User
from app.schemas.scheduled_activity import ScheduledActivityCreate, ScheduledActivityOut, ScheduledActivityUpdate
from app.services.layer_service import user_can_manage_layer


def _end_time(start: time, duration_minutes: int) -> time:
    return (datetime.combine(date.today(), start) + timedelta(minutes=duration_minutes)).time()


def _effective_duration(entry_duration: int | None, activity: Activity) -> int | None:
    return entry_duration if entry_duration is not None else activity.duration_minutes


def _check_no_overlap(
    db: Session,
    layer_id: uuid.UUID,
    day_of_week: DayOfWeek,
    start_time: time,
    duration_minutes: int | None,
    exclude_id: uuid.UUID | None = None,
) -> None:
    if duration_minutes is None:
        # Unknown length -- nothing meaningful to compare against, so
        # skip the check rather than block on a guess.
        return
    new_end = _end_time(start_time, duration_minutes)

    same_day = db.query(ScheduledActivity).filter(
        ScheduledActivity.layer_id == layer_id, ScheduledActivity.day_of_week == day_of_week
    )
    if exclude_id is not None:
        same_day = same_day.filter(ScheduledActivity.id != exclude_id)

    for other in same_day.all():
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


def create_scheduled_activity(
    db: Session, user: User, layer: Layer, payload: ScheduledActivityCreate
) -> ScheduledActivity:
    activity = db.get(Activity, payload.activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפעילות לא נמצאה")

    _check_no_overlap(
        db, layer.id, payload.day_of_week, payload.start_time,
        _effective_duration(payload.duration_minutes, activity),
    )

    entry = ScheduledActivity(
        layer_id=layer.id,
        activity_id=activity.id,
        created_by_id=user.id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_scheduled_activities(db: Session, layer: Layer) -> list[ScheduledActivity]:
    return (
        db.query(ScheduledActivity)
        .filter(ScheduledActivity.layer_id == layer.id)
        .order_by(ScheduledActivity.day_of_week, ScheduledActivity.start_time)
        .all()
    )


def update_scheduled_activity(
    db: Session, entry: ScheduledActivity, payload: ScheduledActivityUpdate
) -> ScheduledActivity:
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(entry, field, value)

    day_of_week = changes.get("day_of_week", entry.day_of_week)
    start_time = changes.get("start_time", entry.start_time)
    duration_minutes = changes.get("duration_minutes", entry.duration_minutes)
    if {"day_of_week", "start_time", "duration_minutes"} & changes.keys():
        _check_no_overlap(
            db, entry.layer_id, day_of_week, start_time,
            _effective_duration(duration_minutes, entry.activity),
            exclude_id=entry.id,
        )

    db.commit()
    db.refresh(entry)
    return entry


def delete_scheduled_activity(db: Session, entry: ScheduledActivity) -> None:
    db.delete(entry)
    db.commit()


def to_scheduled_activity_out(db: Session, user: User, entry: ScheduledActivity) -> ScheduledActivityOut:
    return ScheduledActivityOut(
        id=entry.id,
        layer_id=entry.layer_id,
        activity_id=entry.activity_id,
        activity_name=entry.activity.name,
        activity_type=entry.activity.activity_type.value,
        day_of_week=entry.day_of_week,
        start_time=entry.start_time,
        duration_minutes=_effective_duration(entry.duration_minutes, entry.activity),
        notes=entry.notes,
        equipment=entry.activity.equipment,
        equipment_checked=entry.equipment_checked,
        created_by_name=entry.created_by.full_name,
        can_manage=user_can_manage_layer(db, user, entry.layer),
        created_at=entry.created_at,
    )
