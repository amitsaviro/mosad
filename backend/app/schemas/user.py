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

    # Lets Pydantic build this schema directly from a SQLAlchemy User
    # object (UserOut.model_validate(user)), not just from a dict.
    model_config = {"from_attributes": True}
