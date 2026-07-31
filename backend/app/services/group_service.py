import secrets
import string

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.counselor_layer_assignment import CounselorLayerAssignment
from app.models.institution import Institution
from app.models.layer import Layer
from app.models.user import User, UserRole
from app.schemas.layer import LayerCreate

_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_join_code(db: Session, length: int = 6) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))
        if not db.query(Layer).filter(Layer.join_code == code).first():
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a unique join code, please retry",
    )


def create_layer(db: Session, user: User, payload: LayerCreate) -> Layer:
    if user.institution_id is not None and user.role != UserRole.institution_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an institution admin can create additional layers",
        )

    if user.institution_id is None:
        institution = Institution(name=f"{user.full_name}'s institution", slug=str(user.id))
        db.add(institution)
        db.flush()
        user.institution_id = institution.id
        user.role = UserRole.institution_admin

    layer = Layer(
        institution_id=user.institution_id,
        name=payload.name,
        description=payload.description,
        join_code=_generate_join_code(db),
    )
    db.add(layer)
    db.flush()

    db.add(CounselorLayerAssignment(user_id=user.id, layer_id=layer.id))
    db.commit()
    db.refresh(layer)
    return layer


def join_layer(db: Session, user: User, join_code: str) -> Layer:
    layer = db.query(Layer).filter(Layer.join_code == join_code).first()
    if layer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid join code"
        )

    if user.institution_id is not None and user.institution_id != layer.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You already belong to a different institution",
        )

    if user.institution_id is None:
        user.institution_id = layer.institution_id
        user.role = UserRole.counselor

    existing = (
        db.query(CounselorLayerAssignment)
        .filter(
            CounselorLayerAssignment.user_id == user.id,
            CounselorLayerAssignment.layer_id == layer.id,
        )
        .first()
    )
    if existing is None:
        db.add(CounselorLayerAssignment(user_id=user.id, layer_id=layer.id))

    db.commit()
    db.refresh(layer)
    return layer
