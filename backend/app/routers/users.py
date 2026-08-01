# User profile endpoints: browsing institution members (admin-only),
# self-service profile edit/delete, and admin editing/removing members.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_institution_admin
from app.database import get_db
from app.models.user import User
from app.schemas.user import AdminMemberUpdate, SelfUserUpdate, UserOut
from app.services.auth_service import build_user_out
from app.services.user_service import (
    admin_remove_member,
    admin_update_member,
    delete_self,
    update_self,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_institution_users(
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    """Lets an admin see everyone in their institution — used to pick
    who to assign as a counselor on a layer."""
    users = db.query(User).filter(User.institution_id == admin.institution_id).all()
    return [build_user_out(user) for user in users]


# NOTE: "/me" routes are declared BEFORE "/{user_id}" on purpose --
# FastAPI matches routes in registration order, and "/{user_id}" is
# typed as a UUID, so a request to "/users/me" would 422 (invalid UUID)
# if that route were checked first instead of falling through here.
@router.patch("/me", response_model=UserOut)
def update_self_endpoint(
    payload: SelfUserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = update_self(db, current_user, payload)
    return build_user_out(updated)


@router.delete("/me", status_code=204)
def delete_self_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_self(db, current_user)


@router.patch("/{user_id}", response_model=UserOut)
def admin_update_member_endpoint(
    user_id: uuid.UUID,
    payload: AdminMemberUpdate,
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    updated = admin_update_member(db, admin, user_id, payload.full_name)
    return build_user_out(updated)


@router.delete("/{user_id}", status_code=204)
def admin_remove_member_endpoint(
    user_id: uuid.UUID,
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    admin_remove_member(db, admin, user_id)
