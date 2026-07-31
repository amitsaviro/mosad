# Low-level security helpers: password hashing and JWT (login token)
# creation/verification. No database access here on purpose — these
# are pure functions, easy to test in isolation.
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from app.config import settings


def hash_password(password: str) -> str:
    """One-way encryption: turns a plain password into a hash that can't
    be reversed back to the original. bcrypt adds a random "salt" so
    hashing the same password twice gives two different results."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Re-hashes the given plain password (with the salt embedded in
    hashed_password) and checks if it matches. There's no "un-hash"."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user_id: uuid.UUID, institution_id: uuid.UUID | None, role: str | None) -> str:
    """Builds a JWT: a signed, tamper-proof string containing who the
    user is (sub = subject = user id) plus institution/role, and an
    expiry time. The server doesn't store sessions — the client sends
    this token back on every request instead (stateless auth)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user_id),
        "institution_id": str(institution_id) if institution_id else None,
        "role": role,
        "exp": expire,   # standard JWT claim; jose auto-rejects expired tokens
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Verifies the token's signature (proves it was issued by this
    server and not tampered with) and expiry, then returns the payload.
    Raises an error if the signature is invalid or it's expired."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
