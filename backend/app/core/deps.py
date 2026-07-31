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
from app.models.user import User

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
