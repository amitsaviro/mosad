# Layer (group/cohort) endpoints: create, join-by-code, list, detail,
# counselor assignment, and the participant roster nested under a layer.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_manageable_layer, get_viewable_layer, require_institution_admin
from app.database import get_db
from app.models.layer import Layer
from app.models.user import User
from app.schemas.layer import LayerAssignCounselor, LayerCreate, LayerJoin, LayerOut
from app.schemas.participant import ParticipantCreate, ParticipantOut
from app.services.group_service import create_layer, join_layer
from app.services.layer_service import (
    assign_counselor,
    list_layers_for_user,
    to_layer_out,
    unassign_counselor,
)
from app.services.participant_service import create_participant, list_participants

router = APIRouter(prefix="/layers", tags=["layers"])


@router.post("", response_model=LayerOut, status_code=201)
def create_layer_endpoint(
    payload: LayerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    layer = create_layer(db, current_user, payload)
    return to_layer_out(db, current_user, layer)


@router.post("/join", response_model=LayerOut)
def join_layer_endpoint(
    payload: LayerJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    layer = join_layer(db, current_user, payload.join_code)
    return to_layer_out(db, current_user, layer)


@router.get("", response_model=list[LayerOut])
def list_layers_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Everyone in an institution sees every layer in it; can_manage on
    each one tells the frontend whether to show it as editable or
    view-only for this particular user."""
    layers = list_layers_for_user(db, current_user)
    return [to_layer_out(db, current_user, layer) for layer in layers]


@router.get("/{layer_id}", response_model=LayerOut)
def get_layer_endpoint(
    layer: Layer = Depends(get_viewable_layer),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return to_layer_out(db, current_user, layer)


@router.post("/{layer_id}/assign-counselor", status_code=204)
def assign_counselor_endpoint(
    payload: LayerAssignCounselor,
    # Both dependencies run: get_manageable_layer 404s if this layer
    # isn't manageable by the caller; require_institution_admin then
    # 403s if they can manage it as an assigned counselor but aren't
    # actually an admin (only admins may assign other counselors).
    layer: Layer = Depends(get_manageable_layer),
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    assign_counselor(db, admin, layer, payload.user_id)


@router.delete("/{layer_id}/assign-counselor/{user_id}", status_code=204)
def unassign_counselor_endpoint(
    user_id: uuid.UUID,
    layer: Layer = Depends(get_manageable_layer),
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    unassign_counselor(db, admin, layer, user_id)


@router.post("/{layer_id}/participants", response_model=ParticipantOut, status_code=201)
def create_participant_endpoint(
    payload: ParticipantCreate,
    layer: Layer = Depends(get_manageable_layer),
    db: Session = Depends(get_db),
):
    return create_participant(db, layer, payload)


@router.get("/{layer_id}/participants", response_model=list[ParticipantOut])
def list_participants_endpoint(
    layer: Layer = Depends(get_viewable_layer),
    db: Session = Depends(get_db),
):
    """Read-only viewing of another institution layer's roster is
    allowed (get_viewable_layer), even though editing it is not."""
    return list_participants(db, layer)
