# "Routers" are the actual HTTP endpoints. They stay thin on purpose:
# read input (via schemas), call a service function, return the result.
# No business logic lives here.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token
from app.database import get_db
from app.models.user import User
from app.schemas.auth import Token, UserLogin, UserRegister
from app.schemas.user import UserOut
from app.services.auth_service import authenticate_user, build_user_out, register_user

# prefix="/auth" means every route below is actually "/auth/register" etc.
# once mounted in main.py (which adds "/api/v1" on top of that).
router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user: User) -> Token:
    """Shared by both register and login since they return the same shape."""
    role_value = user.role.value if user.role else None
    access_token = create_access_token(user.id, user.institution_id, role_value)
    return Token(access_token=access_token, user=build_user_out(user))


@router.post("/register", response_model=Token, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    # FastAPI parses the JSON body straight into a UserRegister automatically.
    user = register_user(db, payload)
    return _token_response(user)


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload)
    return _token_response(user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    # get_current_user already did all the token-decoding work — by the
    # time we're here, current_user is a real, validated User row.
    return build_user_out(current_user)
