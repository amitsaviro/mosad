# Institution-wide read + delete for dated calendar activities -- same
# split as routers/schedule.py: creation is nested under
# /layers/{layer_id}/calendar-activities (needs a layer to attach to),
# but once you have an entry_id you don't need the layer_id in the URL.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_manageable_calendar_activity
from app.database import get_db
from app.models.calendar_activity import CalendarActivity
from app.models.user import User
from app.schemas.calendar_activity import CalendarActivityOut, CalendarActivityUpdate
from app.services.calendar_activity_service import (
    delete_calendar_activity,
    list_calendar_activities_for_institution,
    to_calendar_activity_out,
    update_calendar_activity,
)

router = APIRouter(prefix="/calendar-activities", tags=["calendar-activities"])


@router.get("", response_model=list[CalendarActivityOut])
def list_calendar_activities_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.institution_id is None:
        return []
    entries = list_calendar_activities_for_institution(db, current_user.institution_id)
    return [to_calendar_activity_out(db, current_user, e) for e in entries]


@router.patch("/{entry_id}", response_model=CalendarActivityOut)
def update_calendar_activity_endpoint(
    payload: CalendarActivityUpdate,
    entry: CalendarActivity = Depends(get_manageable_calendar_activity),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = update_calendar_activity(db, entry, payload)
    return to_calendar_activity_out(db, current_user, updated)


@router.delete("/{entry_id}", status_code=204)
def delete_calendar_activity_endpoint(
    entry: CalendarActivity = Depends(get_manageable_calendar_activity),
    db: Session = Depends(get_db),
):
    delete_calendar_activity(db, entry)
