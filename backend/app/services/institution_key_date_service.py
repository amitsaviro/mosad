# Business logic for the shared "year overview" landmark dates
# (holidays, trips, assemblies...) -- institution-wide, visible to
# every layer's counselor, editable by institution admins only.
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.institution_key_date import InstitutionKeyDate
from app.models.user import User
from app.schemas.institution_key_date import KeyDateCreate


def create_key_date(db: Session, user: User, payload: KeyDateCreate) -> InstitutionKeyDate:
    key_date = InstitutionKeyDate(
        institution_id=user.institution_id,
        name=payload.name,
        date=payload.date,
        note=payload.note,
    )
    db.add(key_date)
    db.commit()
    db.refresh(key_date)
    return key_date


def list_key_dates(db: Session, institution_id: uuid.UUID) -> list[InstitutionKeyDate]:
    return (
        db.query(InstitutionKeyDate)
        .filter(InstitutionKeyDate.institution_id == institution_id)
        .order_by(InstitutionKeyDate.date)
        .all()
    )


def get_key_date_or_404(db: Session, key_date_id: uuid.UUID, institution_id: uuid.UUID) -> InstitutionKeyDate:
    key_date = db.get(InstitutionKeyDate, key_date_id)
    if key_date is None or key_date.institution_id != institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התאריך לא נמצא")
    return key_date


def delete_key_date(db: Session, key_date: InstitutionKeyDate) -> None:
    db.delete(key_date)
    db.commit()
