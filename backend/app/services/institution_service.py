# Business logic for creating/renaming an institution — split out from
# group_service.py (which used to bundle institution-creation into
# "create your first layer"). Now an admin can create an empty
# institution and add layers to it whenever they're ready.
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.institution import Institution
from app.models.user import User, UserRole


def create_institution(db: Session, user: User, name: str) -> Institution:
    if user.institution_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="אתה כבר משוייך למסגרת חינוך קיימת",
        )

    institution = Institution(name=name, slug=str(user.id))
    db.add(institution)
    try:
        db.flush()
    except IntegrityError:
        # Hits the unique constraint on institutions.name.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="שם זה תפוס"
        )

    user.institution_id = institution.id
    user.role = UserRole.institution_admin
    db.commit()
    db.refresh(institution)
    return institution


def update_institution(db: Session, admin: User, name: str) -> Institution:
    institution = db.get(Institution, admin.institution_id)
    if institution is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="המוסד לא נמצא")

    institution.name = name
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="שם זה תפוס"
        )

    db.commit()
    db.refresh(institution)
    return institution
