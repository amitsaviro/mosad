# Admin-only endpoint for browsing the people in your own institution.
# No public "list all users" endpoint exists — that would leak data
# across institutions.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_institution_admin
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_institution_users(
    admin: User = Depends(require_institution_admin),
    db: Session = Depends(get_db),
):
    """Lets an admin see everyone in their institution — used to pick
    who to assign as a counselor on a layer."""
    return db.query(User).filter(User.institution_id == admin.institution_id).all()
