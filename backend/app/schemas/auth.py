# Request/response shapes for the auth endpoints.
from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserOut


class UserRegister(BaseModel):
    """Body expected by POST /auth/register."""
    email: EmailStr   # EmailStr validates the format automatically
    # min_length=8: FastAPI/Pydantic rejects shorter passwords with a
    # 422 error before our code ever runs, e.g. an empty password.
    password: str = Field(min_length=8)   # plain text here (over HTTPS in prod) — hashed before storage
    full_name: str


class UserLogin(BaseModel):
    """Body expected by POST /auth/login."""
    email: EmailStr
    password: str


class Token(BaseModel):
    """Response for both register and login: the JWT the client should
    store and send on future requests, plus the user's own profile so
    the frontend doesn't need a second request right after logging in."""
    access_token: str
    token_type: str = "bearer"   # tells clients to send "Authorization: Bearer <token>"
    user: UserOut
