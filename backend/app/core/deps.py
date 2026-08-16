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
from app.models.calendar_activity import CalendarActivity
from app.models.layer import Layer
from app.models.participant import Participant
from app.models.participant_note import ParticipantNote
from app.models.trip import Trip
from app.models.user import User, UserRole
from app.services.layer_service import user_can_manage_layer, user_can_view_layer

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
        detail="האימות נכשל, יש להתחבר מחדש",
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
            detail="רק מנהל מוסד יכול לבצע פעולה זו",
        )
    return current_user


def get_viewable_layer(
    layer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Layer:
    """READ access: anyone in the same institution — an admin, their
    own assigned counselors, or a counselor just browsing another
    layer in their institution read-only. FastAPI automatically fills
    `layer_id` from the URL path because the route also declares a
    `layer_id` path parameter with the same name.

    Returns 404 (not 403) when access is denied — we don't want an
    unauthorized user to even learn that a given layer_id exists."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="השכבה לא נמצאה"
    )
    layer = db.get(Layer, layer_id)
    if layer is None or not user_can_view_layer(current_user, layer):
        raise not_found
    return layer


def get_manageable_layer(
    layer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Layer:
    """WRITE access: admin of this institution, or a counselor actually
    assigned to this specific layer. Used for anything that changes
    data (adding participants, assigning counselors) — narrower than
    get_viewable_layer."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="השכבה לא נמצאה"
    )
    layer = db.get(Layer, layer_id)
    if layer is None or not user_can_manage_layer(db, current_user, layer):
        raise not_found
    return layer


def get_accessible_participant(
    participant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Participant:
    """For routes keyed by participant_id instead of layer_id (e.g.
    PATCH /participants/{id}, which edits data) — requires WRITE access
    to the participant's own layer."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="החניך לא נמצא"
    )
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise not_found

    layer = db.get(Layer, participant.layer_id)
    if layer is None or not user_can_manage_layer(db, current_user, layer):
        raise not_found
    return participant


def get_viewable_participant(
    participant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Participant:
    """READ-only version of get_accessible_participant -- for viewing a
    participant's attendance history or notes without needing WRITE
    access to their layer (e.g. a counselor from another layer)."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="החניך לא נמצא"
    )
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise not_found

    layer = db.get(Layer, participant.layer_id)
    if layer is None or not user_can_view_layer(current_user, layer):
        raise not_found
    return participant


def get_manageable_note(
    note_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParticipantNote:
    """For DELETE /notes/{id} -- requires WRITE access to the note's
    participant's layer (any layer manager, not just the note's author,
    matching the same pattern as calendar-activity removal)."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="ההערה לא נמצאה"
    )
    note = db.get(ParticipantNote, note_id)
    if note is None:
        raise not_found

    participant = db.get(Participant, note.participant_id)
    if participant is None:
        raise not_found

    layer = db.get(Layer, participant.layer_id)
    if layer is None or not user_can_manage_layer(db, current_user, layer):
        raise not_found
    return note


def get_manageable_calendar_activity(
    entry_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarActivity:
    """For PATCH/DELETE /calendar-activities/{id} -- requires WRITE
    access to the entry's own layer, same pattern as get_accessible_participant."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="הפעילות בלוח השנה לא נמצאה"
    )
    entry = db.get(CalendarActivity, entry_id)
    if entry is None:
        raise not_found

    layer = db.get(Layer, entry.layer_id)
    if layer is None or not user_can_manage_layer(db, current_user, layer):
        raise not_found
    return entry


def get_viewable_trip(
    trip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Trip:
    """READ access: anyone in the trip's own institution, same rule as
    get_viewable_layer since a trip is just a layer's own sub-resource."""
    not_found = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="תיק הטיול לא נמצא")
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise not_found

    layer = db.get(Layer, trip.layer_id)
    if layer is None or not user_can_view_layer(current_user, layer):
        raise not_found
    return trip


def get_manageable_trip(
    trip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Trip:
    """WRITE access: admin of this institution, or a counselor assigned
    to the trip's own layer -- covers every nested mutation (equipment,
    shopping, documents, schedule, confirmations), not just the trip
    itself, so a single dependency is reused everywhere."""
    not_found = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="תיק הטיול לא נמצא")
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise not_found

    layer = db.get(Layer, trip.layer_id)
    if layer is None or not user_can_manage_layer(db, current_user, layer):
        raise not_found
    return trip
