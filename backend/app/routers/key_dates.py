# Shared institution-wide "year overview" landmark dates (holidays,
# trips, assemblies) -- any counselor in the institution can view them;
# only an institution admin can add/remove one, since it's shared by
# every layer.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_institution_admin
from app.database import get_db
from app.models.user import User
from app.schemas.institution_key_date import KeyDateCreate, KeyDateOut
from app.services.institution_key_date_service import (
    create_key_date,
    delete_key_date,
    get_key_date_or_404,
    list_key_dates,
)

router = APIRouter(prefix="/key-dates", tags=["key-dates"])


@router.post("", response_model=KeyDateOut, status_code=201)
def create_key_date_endpoint(
    payload: KeyDateCreate,
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    return create_key_date(db, admin, payload)


@router.get("", response_model=list[KeyDateOut])
def list_key_dates_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.institution_id is None:
        return []
    return list_key_dates(db, current_user.institution_id)


@router.delete("/{key_date_id}", status_code=204)
def delete_key_date_endpoint(
    key_date_id: uuid.UUID,
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    key_date = get_key_date_or_404(db, key_date_id, admin.institution_id)
    delete_key_date(db, key_date)
