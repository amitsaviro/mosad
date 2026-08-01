from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_institution_admin
from app.database import get_db
from app.models.user import User
from app.schemas.institution import InstitutionCreate, InstitutionOut, InstitutionUpdate
from app.services.institution_service import create_institution, update_institution

router = APIRouter(prefix="/institutions", tags=["institutions"])


@router.post("", response_model=InstitutionOut, status_code=201)
def create_institution_endpoint(
    payload: InstitutionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creates an empty institution — no layers yet. The admin adds
    layers separately via POST /layers whenever they're ready."""
    return create_institution(db, current_user, payload.name)


@router.patch("", response_model=InstitutionOut)
def update_institution_endpoint(
    payload: InstitutionUpdate,
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    return update_institution(db, admin, payload.name)
