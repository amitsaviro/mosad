# Business logic for the participant (חניך) roster within a layer.
from sqlalchemy.orm import Session

from app.models.layer import Layer
from app.models.participant import Participant
from app.schemas.participant import ParticipantCreate, ParticipantUpdate


def create_participant(db: Session, layer: Layer, payload: ParticipantCreate) -> Participant:
    participant = Participant(
        layer_id=layer.id,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        guardian_contact=payload.guardian_contact,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def list_participants(db: Session, layer: Layer) -> list[Participant]:
    return db.query(Participant).filter(Participant.layer_id == layer.id).all()


def update_participant(
    db: Session, participant: Participant, payload: ParticipantUpdate
) -> Participant:
    # exclude_unset: only touch fields the client actually sent, so a
    # PATCH with just {"is_active": false} doesn't wipe out full_name etc.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(participant, field, value)
    db.commit()
    db.refresh(participant)
    return participant
