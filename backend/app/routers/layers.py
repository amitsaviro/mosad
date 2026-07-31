# Layer (group/cohort) endpoints: create, join-by-code, list, detail,
# counselor assignment, and the participant roster nested under a layer.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_accessible_layer, get_current_user, require_institution_admin
from app.database import get_db
from app.models.layer import Layer
from app.models.user import User
from app.schemas.layer import LayerAssignCounselor, LayerCreate, LayerJoin, LayerOut
from app.schemas.participant import ParticipantCreate, ParticipantOut
from app.services.group_service import create_layer, join_layer
from app.services.layer_service import assign_counselor, list_layers_for_user, unassign_counselor
from app.services.participant_service import create_participant, list_participants

router = APIRouter(prefix="/layers", tags=["layers"])


@router.post("", response_model=LayerOut, status_code=201)
def create_layer_endpoint(
    payload: LayerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_layer(db, current_user, payload)


@router.post("/join", response_model=LayerOut)
def join_layer_endpoint(
    payload: LayerJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return join_layer(db, current_user, payload.join_code)


@router.get("", response_model=list[LayerOut])
def list_layers_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admins get every layer in their institution; counselors only
    get the layers they've been assigned to."""
    return list_layers_for_user(db, current_user)


@router.get("/{layer_id}", response_model=LayerOut)
def get_layer_endpoint(layer: Layer = Depends(get_accessible_layer)):
    # get_accessible_layer already did the 404-if-no-access check —
    # if we got here, `layer` is guaranteed to be visible to the caller.
    return layer


@router.post("/{layer_id}/assign-counselor", status_code=204)
def assign_counselor_endpoint(
    payload: LayerAssignCounselor,
    # Both dependencies run: get_accessible_layer 404s if this layer
    # isn't even visible to the caller; require_institution_admin then
    # 403s if they can see it (e.g. as a counselor) but aren't an admin.
    layer: Layer = Depends(get_accessible_layer),
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    assign_counselor(db, admin, layer, payload.user_id)


@router.delete("/{layer_id}/assign-counselor/{user_id}", status_code=204)
def unassign_counselor_endpoint(
    user_id: uuid.UUID,
    layer: Layer = Depends(get_accessible_layer),
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    unassign_counselor(db, admin, layer, user_id)


@router.post("/{layer_id}/participants", response_model=ParticipantOut, status_code=201)
def create_participant_endpoint(
    payload: ParticipantCreate,
    layer: Layer = Depends(get_accessible_layer),
    db: Session = Depends(get_db),
):
    return create_participant(db, layer, payload)


@router.get("/{layer_id}/participants", response_model=list[ParticipantOut])
def list_participants_endpoint(
    layer: Layer = Depends(get_accessible_layer),
    db: Session = Depends(get_db),
):
    return list_participants(db, layer)
