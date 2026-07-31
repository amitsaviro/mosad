# "Services" hold business logic, kept separate from routers so routers
# stay thin (just HTTP plumbing) and this logic is easy to unit-test
# without spinning up a whole HTTP server.
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserLogin, UserRegister
from app.schemas.user import UserOut


def build_user_out(user: User) -> UserOut:
    """Institution name lives on a related Institution row, not
    directly on User, so it can't come from a plain model_validate —
    this walks the relationship explicitly (SQLAlchemy lazy-loads
    user.institution on first access within the request's DB session)."""
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        institution_id=user.institution_id,
        institution_name=user.institution.name if user.institution else None,
    )


def register_user(db: Session, payload: UserRegister) -> User:
    """Creates a brand-new account. No institution/role yet — those get
    set later when the user creates or joins their first group."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),   # never store the raw password
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()    # writes the row to Postgres
    db.refresh(user)   # reloads it, picking up DB-generated fields (id, created_at...)
    return user


def authenticate_user(db: Session, payload: UserLogin) -> User:
    """Checks email+password. Deliberately raises the exact same error
    message whether the email doesn't exist OR the password is wrong —
    so an attacker can't use error differences to discover which emails
    are registered."""
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
    )
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise invalid_credentials
    if not user.is_active:
        raise invalid_credentials
    return user
