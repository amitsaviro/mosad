# Self-service profile management, plus an institution admin's ability
# to edit/remove members of their own institution.
import uuid

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.counselor_layer_assignment import CounselorLayerAssignment
from app.models.user import User, UserRole
from app.schemas.user import SelfUserUpdate


def update_self(db: Session, user: User, payload: SelfUserUpdate) -> User:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    try:
        db.flush()
    except IntegrityError:
        # Hits User.email's unique constraint.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="כתובת האימייל הזו כבר בשימוש",
        )
    db.commit()
    db.refresh(user)
    return user


def delete_self(db: Session, user: User) -> None:
    if user.role == UserRole.institution_admin:
        # No "transfer ownership" flow exists yet -- deleting the sole
        # admin would leave the institution with nobody able to manage it.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="כמנהל מוסד לא ניתן למחוק את החשבון כרגע. פנה לתמיכה.",
        )
    # Assignment rows reference this user's id with no cascade -- clear
    # them first or the delete below would fail on the FK constraint.
    db.query(CounselorLayerAssignment).filter(
        CounselorLayerAssignment.user_id == user.id
    ).delete()
    db.delete(user)
    db.commit()


def admin_update_member(db: Session, admin: User, target_user_id: uuid.UUID, full_name: str) -> User:
    target = db.get(User, target_user_id)
    if target is None or target.institution_id != admin.institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="המשתמש לא נמצא")

    target.full_name = full_name
    db.commit()
    db.refresh(target)
    return target


def admin_remove_member(db: Session, admin: User, target_user_id: uuid.UUID) -> None:
    if target_user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא ניתן להסיר את עצמך בדרך הזו",
        )

    target = db.get(User, target_user_id)
    if target is None or target.institution_id != admin.institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="המשתמש לא נמצא")

    # Kicks them out of the institution entirely (not just one layer) --
    # frees them to create or join a different one from scratch.
    db.query(CounselorLayerAssignment).filter(
        CounselorLayerAssignment.user_id == target.id
    ).delete()
    target.institution_id = None
    target.role = None
    db.commit()
