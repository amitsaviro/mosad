# PATCH lives here directly (not under /layers/{id}/participants)
# because once you have a participant_id you don't need to also know
# its layer_id in the URL — get_accessible_participant figures out
# access from the participant's own layer internally. Attendance
# history and notes for a single participant follow the same pattern.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_accessible_participant, get_current_user, get_viewable_participant
from app.database import get_db
from app.models.participant import Participant
from app.models.user import User
from app.schemas.attendance import AttendanceOut, ParticipantAttendanceSummary
from app.schemas.participant import ParticipantOut, ParticipantUpdate
from app.schemas.participant_note import ParticipantNoteCreate, ParticipantNoteOut
from app.services.attendance_service import (
    list_attendance_for_participant,
    summarize_attendance,
    to_attendance_out,
)
from app.services.participant_note_service import create_participant_note, list_participant_notes, to_note_out
from app.services.participant_service import update_participant

router = APIRouter(prefix="/participants", tags=["participants"])


@router.patch("/{participant_id}", response_model=ParticipantOut)
def update_participant_endpoint(
    payload: ParticipantUpdate,
    participant: Participant = Depends(get_accessible_participant),
    db: Session = Depends(get_db),
):
    return update_participant(db, participant, payload)


@router.get("/{participant_id}/attendance", response_model=list[AttendanceOut])
def list_participant_attendance_endpoint(
    participant: Participant = Depends(get_viewable_participant),
    db: Session = Depends(get_db),
):
    records = list_attendance_for_participant(db, participant)
    return [to_attendance_out(r) for r in records]


@router.get("/{participant_id}/attendance-summary", response_model=ParticipantAttendanceSummary)
def participant_attendance_summary_endpoint(
    participant: Participant = Depends(get_viewable_participant),
    db: Session = Depends(get_db),
):
    records = list_attendance_for_participant(db, participant)
    return summarize_attendance(records)


@router.post("/{participant_id}/notes", response_model=ParticipantNoteOut, status_code=201)
def create_note_endpoint(
    payload: ParticipantNoteCreate,
    participant: Participant = Depends(get_accessible_participant),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = create_participant_note(db, current_user, participant, payload)
    return to_note_out(note)


@router.get("/{participant_id}/notes", response_model=list[ParticipantNoteOut])
def list_notes_endpoint(
    participant: Participant = Depends(get_viewable_participant),
    db: Session = Depends(get_db),
):
    return [to_note_out(n) for n in list_participant_notes(db, participant)]
