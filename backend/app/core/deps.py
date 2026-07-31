# FastAPI "dependencies": reusable pieces of logic that route functions
# ask for as function parameters. Every protected endpoint will use
# get_current_user the same way get_db is used for a DB session.
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.models.counselor_layer_assignment import CounselorLayerAssignment
from app.models.layer import Layer
from app.models.participant import Participant
from app.models.user import User, UserRole

# This tells FastAPI's auto-generated /docs page how to collect the
# token from clients (as a header), and where "login" conceptually lives.
# It does NOT enforce anything by itself — get_current_user does.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """Runs before any route that depends on it. Reads the
    "Authorization: Bearer <token>" header, decodes it, and loads the
    matching User row from the database. Any protected route just adds
    `current_user: User = Depends(get_current_user)` as a parameter."""
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        # Bad signature, expired token, or malformed payload — all treated the same.
        raise credentials_error

    # Re-fetch from the DB instead of trusting the token's data: the
    # user might have been deactivated *after* the token was issued.
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_error
    return user


def require_institution_admin(current_user: User = Depends(get_current_user)) -> User:
    """For endpoints only an institution admin may call (e.g. assigning
    counselors). 403, not 404 — the caller IS a real logged-in user,
    they just aren't allowed to do this particular action."""
    if current_user.role != UserRole.institution_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an institution admin can perform this action",
        )
    return current_user


def _can_access_layer(db: Session, user: User, layer: Layer) -> bool:
    """The one place the "admin of this institution OR assigned
    counselor" rule is written. Both get_accessible_layer and
    get_accessible_participant delegate to this, so the rule can never
    drift out of sync between the two."""
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


def get_accessible_layer(
    layer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Layer:
    """The central "can this user touch this layer" check, reused by
    every layer/participant route. FastAPI automatically fills
    `layer_id` from the URL path because the route also declares a
    `layer_id` path parameter with the same name.

    Returns 404 (not 403) when access is denied — we don't want an
    unauthorized user to even learn that a given layer_id exists."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Layer not found"
    )
    layer = db.get(Layer, layer_id)
    if layer is None or not _can_access_layer(db, current_user, layer):
        raise not_found
    return layer


def get_accessible_participant(
    participant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Participant:
    """Same idea as get_accessible_layer, but for routes keyed by
    participant_id instead (e.g. PATCH /participants/{id}) — access is
    determined by the participant's own layer."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found"
    )
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise not_found

    layer = db.get(Layer, participant.layer_id)
    if layer is None or not _can_access_layer(db, current_user, layer):
        raise not_found
    return participant
