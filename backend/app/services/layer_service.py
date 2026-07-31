# Business logic for listing layers and managing which counselors
# belong to which layer (separate from group_service.py, which only
# handles CREATING a layer and joining-by-code).
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.counselor_layer_assignment import CounselorLayerAssignment
from app.models.layer import Layer
from app.models.user import User, UserRole


def list_layers_for_user(db: Session, user: User) -> list[Layer]:
    """Admins see every layer in their institution. Counselors only see
    the layers they've actually been assigned to."""
    if user.role == UserRole.institution_admin:
        return db.query(Layer).filter(Layer.institution_id == user.institution_id).all()

    # .join(...) here means a SQL JOIN, not our CounselorLayerAssignment
    # model — walks: Layer <- CounselorLayerAssignment, then keeps only
    # the rows where that assignment belongs to this user.
    return (
        db.query(Layer)
        .join(CounselorLayerAssignment, CounselorLayerAssignment.layer_id == Layer.id)
        .filter(CounselorLayerAssignment.user_id == user.id)
        .all()
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
            status_code=status.HTTP_404_NOT_FOUND, detail="Layer not found"
        )

    target_user = db.get(User, counselor_user_id)
    if target_user is None or target_user.institution_id != admin.institution_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No such user in your institution",
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
            status_code=status.HTTP_404_NOT_FOUND, detail="Layer not found"
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
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )
    db.delete(assignment)
    db.commit()
