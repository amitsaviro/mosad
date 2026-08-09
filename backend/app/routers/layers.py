# Layer (group/cohort) endpoints: create, join-by-code, list, detail,
# counselor assignment, and the participant roster nested under a layer.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_manageable_layer, get_viewable_layer, require_institution_admin
from app.database import get_db
from app.models.layer import Layer
from app.models.user import User
from app.schemas.calendar_activity import CalendarActivityCreate, CalendarActivityOut
from app.schemas.layer import LayerAssignCounselor, LayerCreate, LayerJoin, LayerOut, LayerUpdate
from app.schemas.participant import ParticipantCreate, ParticipantOut
from app.schemas.scheduled_activity import ScheduledActivityCreate, ScheduledActivityOut
from app.schemas.user import UserOut
from app.services.auth_service import build_user_out
from app.services.calendar_activity_service import create_calendar_activity, to_calendar_activity_out
from app.services.group_service import create_layer, join_layer
from app.services.layer_service import (
    assign_counselor,
    delete_layer,
    leave_layer,
    list_assigned_counselors,
    list_layers_for_user,
    to_layer_out,
    unassign_counselor,
    update_layer,
)
from app.services.participant_service import create_participant, list_participants
from app.services.scheduled_activity_service import (
    create_scheduled_activity,
    list_scheduled_activities,
    to_scheduled_activity_out,
)

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


@router.patch("/{layer_id}", response_model=LayerOut)
def update_layer_endpoint(
    payload: LayerUpdate,
    layer: Layer = Depends(get_manageable_layer),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = update_layer(db, layer, payload)
    return to_layer_out(db, current_user, updated)


@router.delete("/{layer_id}", status_code=204)
def delete_layer_endpoint(
    layer: Layer = Depends(get_manageable_layer),
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    delete_layer(db, layer)


@router.post("/{layer_id}/leave", status_code=204)
def leave_layer_endpoint(
    layer: Layer = Depends(get_viewable_layer),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    leave_layer(db, current_user, layer)


@router.get("/{layer_id}/counselors", response_model=list[UserOut])
def list_layer_counselors_endpoint(
    layer: Layer = Depends(get_viewable_layer),
    db: Session = Depends(get_db),
):
    return [build_user_out(user) for user in list_assigned_counselors(db, layer)]


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


@router.post("/{layer_id}/schedule", response_model=ScheduledActivityOut, status_code=201)
def create_scheduled_activity_endpoint(
    payload: ScheduledActivityCreate,
    layer: Layer = Depends(get_manageable_layer),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = create_scheduled_activity(db, current_user, layer, payload)
    return to_scheduled_activity_out(db, current_user, entry)


@router.get("/{layer_id}/schedule", response_model=list[ScheduledActivityOut])
def list_scheduled_activities_endpoint(
    layer: Layer = Depends(get_viewable_layer),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = list_scheduled_activities(db, layer)
    return [to_scheduled_activity_out(db, current_user, e) for e in entries]


@router.post("/{layer_id}/calendar-activities", response_model=CalendarActivityOut, status_code=201)
def create_calendar_activity_endpoint(
    payload: CalendarActivityCreate,
    layer: Layer = Depends(get_manageable_layer),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = create_calendar_activity(db, current_user, layer, payload)
    return to_calendar_activity_out(db, current_user, entry)
