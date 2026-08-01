# "Schemas" (Pydantic models) describe the JSON shape of API requests
# and responses. They are DIFFERENT from the SQLAlchemy models in
# models/ — those describe DB tables. Keeping them separate means we
# control exactly what gets exposed over the API.
import uuid

from pydantic import BaseModel, EmailStr, field_validator

from app.models.user import UserRole


class UserOut(BaseModel):
    """What we send back to the client about a user.
    Notice hashed_password is NOT here — it must never leave the server."""
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole | None
    institution_id: uuid.UUID | None
    # Not a plain attribute on the User model (it's a relationship
    # traversal: user.institution.name) — built explicitly via
    # build_user_out() in auth_service.py rather than relying on
    # automatic model_validate(user) conversion.
    institution_name: str | None = None

    # Lets Pydantic build this schema directly from a SQLAlchemy User
    # object (UserOut.model_validate(user)), not just from a dict.
    model_config = {"from_attributes": True}


class SelfUserUpdate(BaseModel):
    """Body for PATCH /users/me — a user editing their own profile.
    Password changes aren't included here; that's a separate concern
    (would need current-password confirmation) not in scope yet."""
    full_name: str | None = None
    email: EmailStr | None = None

    @field_validator("full_name")
    @classmethod
    def full_name_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם מלא לא יכול להיות ריק")
        return stripped


class AdminMemberUpdate(BaseModel):
    """Body for PATCH /users/{user_id} — an institution admin editing a
    member's name. Deliberately narrower than SelfUserUpdate: an admin
    can't change someone else's email (that's how they log in)."""
    full_name: str

    @field_validator("full_name")
    @classmethod
    def full_name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם מלא לא יכול להיות ריק")
        return stripped
