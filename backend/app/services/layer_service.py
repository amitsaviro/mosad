# Business logic for listing layers and managing which counselors
# belong to which layer (separate from group_service.py, which only
# handles CREATING a layer and joining-by-code).
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.counselor_layer_assignment import CounselorLayerAssignment
from app.models.layer import Layer
from app.models.user import User, UserRole
from app.schemas.layer import LayerOut


def list_layers_for_user(db: Session, user: User) -> list[Layer]:
    """Everyone in an institution sees every layer in it — an admin AND
    a counselor. What differs is what they're allowed to DO with each
    layer (see user_can_manage_layer): a counselor sees other layers
    read-only, "view-only" from the frontend's perspective."""
    return db.query(Layer).filter(Layer.institution_id == user.institution_id).all()


def user_can_view_layer(user: User, layer: Layer) -> bool:
    """Read access: anyone in the same institution, regardless of role
    or assignment. Used for viewing layer details and the participant
    roster."""
    return user.institution_id is not None and user.institution_id == layer.institution_id


def user_can_manage_layer(db: Session, user: User, layer: Layer) -> bool:
    """Write access: an institution admin (over their whole institution)
    or a counselor specifically assigned to this exact layer. Used for
    adding/editing participants, and for assigning other counselors."""
    is_admin_of_this_institution = (
        user.role == UserRole.institution_admin
        and user.institution_id == layer.institution_id
    )
    if is_admin_of_this_institution:
        return True

    return (
        db.query(CounselorLayerAssignment)
        .filter(
            CounselorLayerAssignment.user_id == user.id,
            CounselorLayerAssignment.layer_id == layer.id,
        )
        .first()
        is not None
    )


def to_layer_out(db: Session, user: User, layer: Layer) -> LayerOut:
    """Builds the API response for a layer. can_manage is per-viewer (not
    a property of the layer itself), so it can't come from a plain
    ORM-to-schema auto-conversion — it has to be computed here, for the
    specific user making the request."""
    return LayerOut(
        id=layer.id,
        institution_id=layer.institution_id,
        name=layer.name,
        description=layer.description,
        join_code=layer.join_code,
        is_active=layer.is_active,
        can_manage=user_can_manage_layer(db, user, layer),
    )


def assign_counselor(db: Session, admin: User, layer: Layer, counselor_user_id: uuid.UUID) -> None:
    """Admin adds an existing user (already in their institution) as a
    counselor on this layer. Doesn't create the user account — that
    happens separately via register + join-by-code."""
    # Defense in depth: the router already restricts this to admins via
    # get_accessible_layer + require_institution_admin, but checking
    # again here means this function is safe to call from anywhere.
    if layer.institution_id != admin.institution_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="השכבה לא נמצאה"
        )

    target_user = db.get(User, counselor_user_id)
    if target_user is None or target_user.institution_id != admin.institution_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="לא נמצא משתמש כזה במוסד שלך",
        )

    existing = (
        db.query(CounselorLayerAssignment)
        .filter(
            CounselorLayerAssignment.user_id == target_user.id,
            CounselorLayerAssignment.layer_id == layer.id,
        )
        .first()
    )
    if existing is not None:
        return   # already assigned — treat as a no-op, not an error

    db.add(CounselorLayerAssignment(user_id=target_user.id, layer_id=layer.id))
    db.commit()


def unassign_counselor(db: Session, admin: User, layer: Layer, counselor_user_id: uuid.UUID) -> None:
    if layer.institution_id != admin.institution_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="השכבה לא נמצאה"
        )

    assignment = (
        db.query(CounselorLayerAssignment)
        .filter(
            CounselorLayerAssignment.user_id == counselor_user_id,
            CounselorLayerAssignment.layer_id == layer.id,
        )
        .first()
    )
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="השיוך לא נמצא"
        )
    db.delete(assignment)
    db.commit()
