# The core business logic for creating and joining layers (groups).
# This is where the "auto-create an institution behind the scenes"
# idea actually happens.
import secrets
import string

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.counselor_layer_assignment import CounselorLayerAssignment
from app.models.institution import Institution
from app.models.layer import Layer
from app.models.user import User, UserRole
from app.schemas.layer import LayerCreate

# Letters+digits only (no lowercase) so a join code is easy to read
# aloud/type, e.g. "XIMBSI" instead of something with ambiguous chars.
_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_join_code(db: Session, length: int = 6) -> str:
    """Keeps generating random 6-char codes until it finds one that
    isn't already used by another layer. `secrets` (not `random`) is
    used because it's cryptographically secure — codes can't be
    predicted/guessed by an attacker."""
    for _ in range(10):   # give up after 10 tries rather than looping forever
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))
        if not db.query(Layer).filter(Layer.join_code == code).first():
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a unique join code, please retry",
    )


def create_layer(db: Session, user: User, payload: LayerCreate) -> Layer:
    """Creates a new layer/group. Two different situations:
    1) User has no institution yet -> this is their FIRST layer ever,
       so we silently create an Institution for them and make them its admin.
    2) User already belongs to an institution -> they must already be
       an admin to add more layers (a plain counselor can't spawn new
       layers under someone else's institution)."""
    if user.institution_id is not None and user.role != UserRole.institution_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an institution admin can create additional layers",
        )

    if user.institution_id is None:
        # First layer ever for this user -> becomes an institution admin automatically.
        institution = Institution(name=f"{user.full_name}'s institution", slug=str(user.id))
        db.add(institution)
        db.flush()   # sends the INSERT so institution.id exists, without committing yet
        user.institution_id = institution.id
        user.role = UserRole.institution_admin

    layer = Layer(
        institution_id=user.institution_id,
        name=payload.name,
        description=payload.description,
        join_code=_generate_join_code(db),
    )
    db.add(layer)

    try:
        db.flush()   # need layer.id before we can reference it below
    except IntegrityError:
        # Hits the (institution_id, name) unique constraint — this
        # institution already has a layer with this exact name.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A layer with this name already exists in your institution",
        )

    # The creator is also counted as a counselor on their own layer,
    # since in real life "the manager is sometimes also a counselor".
    db.add(CounselorLayerAssignment(user_id=user.id, layer_id=layer.id))
    db.commit()   # all the above happens in one transaction: either all saved, or none
    db.refresh(layer)
    return layer


def join_layer(db: Session, user: User, join_code: str) -> Layer:
    """Lets a user join an existing layer by typing its code."""
    layer = db.query(Layer).filter(Layer.join_code == join_code).first()
    if layer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid join code"
        )

    # A user can only ever belong to ONE institution (kept simple for now).
    # If they already belong to a different one, block joining this layer.
    if user.institution_id is not None and user.institution_id != layer.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You already belong to a different institution",
        )

    if user.institution_id is None:
        # This is the user's first group ever -> joining makes them a counselor.
        user.institution_id = layer.institution_id
        user.role = UserRole.counselor

    # Don't create a duplicate assignment if they already joined this layer before.
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
