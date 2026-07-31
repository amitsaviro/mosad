# Only PATCH lives here (not under /layers/{id}/participants) because
# once you have a participant_id you don't need to also know its
# layer_id in the URL — get_accessible_participant figures out access
# from the participant's own layer internally.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_accessible_participant
from app.database import get_db
from app.models.participant import Participant
from app.schemas.participant import ParticipantOut, ParticipantUpdate
from app.services.participant_service import update_participant

router = APIRouter(prefix="/participants", tags=["participants"])


@router.patch("/{participant_id}", response_model=ParticipantOut)
def update_participant_endpoint(
    payload: ParticipantUpdate,
    participant: Participant = Depends(get_accessible_participant),
    db: Session = Depends(get_db),
):
    return update_participant(db, participant, payload)
