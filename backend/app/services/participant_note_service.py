# Business logic for the note history on a participant (חניך) profile.
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.participant import Participant
from app.models.participant_note import ParticipantNote
from app.models.user import User
from app.schemas.participant_note import ParticipantNoteCreate, ParticipantNoteOut


def create_participant_note(
    db: Session, user: User, participant: Participant, payload: ParticipantNoteCreate
) -> ParticipantNote:
    note = ParticipantNote(participant_id=participant.id, author_id=user.id, body=payload.body)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def list_participant_notes(db: Session, participant: Participant) -> list[ParticipantNote]:
    return (
        db.query(ParticipantNote)
        .filter(ParticipantNote.participant_id == participant.id)
        .order_by(ParticipantNote.created_at.desc())
        .all()
    )


def delete_participant_note(db: Session, note: ParticipantNote) -> None:
    db.delete(note)
    db.commit()


def to_note_out(note: ParticipantNote) -> ParticipantNoteOut:
    return ParticipantNoteOut(
        id=note.id,
        participant_id=note.participant_id,
        author_id=note.author_id,
        author_name=note.author.full_name,
        body=note.body,
        created_at=note.created_at,
    )
