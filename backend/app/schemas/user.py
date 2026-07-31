# "Schemas" (Pydantic models) describe the JSON shape of API requests
# and responses. They are DIFFERENT from the SQLAlchemy models in
# models/ — those describe DB tables. Keeping them separate means we
# control exactly what gets exposed over the API.
import uuid

from pydantic import BaseModel, EmailStr

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
