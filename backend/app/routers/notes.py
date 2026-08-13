# Only DELETE lives here (not under /participants/{id}/notes) -- same
# split as routers/calendar_activities.py: once you have a note_id you
# don't need its participant_id in the URL, since get_manageable_note
# resolves access from the note's own participant/layer internally.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_manageable_note
from app.database import get_db
from app.models.participant_note import ParticipantNote
from app.services.participant_note_service import delete_participant_note

router = APIRouter(prefix="/notes", tags=["participant-notes"])


@router.delete("/{note_id}", status_code=204)
def delete_note_endpoint(
    note: ParticipantNote = Depends(get_manageable_note),
    db: Session = Depends(get_db),
):
    delete_participant_note(db, note)
