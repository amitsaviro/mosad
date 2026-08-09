# Only PATCH/DELETE live here (not under /layers/{id}/schedule) --
# same reasoning as routers/participants.py: once you have an entry_id
# you don't also need its layer_id in the URL, since
# get_manageable_schedule_entry resolves access from the entry itself.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_manageable_schedule_entry
from app.database import get_db
from app.models.scheduled_activity import ScheduledActivity
from app.models.user import User
from app.schemas.scheduled_activity import ScheduledActivityOut, ScheduledActivityUpdate
from app.services.scheduled_activity_service import (
    delete_scheduled_activity,
    to_scheduled_activity_out,
    update_scheduled_activity,
)

router = APIRouter(prefix="/schedule", tags=["schedule"])


@router.patch("/{entry_id}", response_model=ScheduledActivityOut)
def update_scheduled_activity_endpoint(
    payload: ScheduledActivityUpdate,
    entry: ScheduledActivity = Depends(get_manageable_schedule_entry),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = update_scheduled_activity(db, entry, payload)
    return to_scheduled_activity_out(db, current_user, updated)


@router.delete("/{entry_id}", status_code=204)
def delete_scheduled_activity_endpoint(
    entry: ScheduledActivity = Depends(get_manageable_schedule_entry),
    db: Session = Depends(get_db),
):
    delete_scheduled_activity(db, entry)
