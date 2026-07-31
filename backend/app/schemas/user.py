import uuid

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole | None
    institution_id: uuid.UUID | None

    model_config = {"from_attributes": True}
