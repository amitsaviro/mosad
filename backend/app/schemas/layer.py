import uuid

from pydantic import BaseModel


class LayerCreate(BaseModel):
    name: str
    description: str | None = None


class LayerJoin(BaseModel):
    join_code: str


class LayerOut(BaseModel):
    id: uuid.UUID
    institution_id: uuid.UUID
    name: str
    description: str | None
    join_code: str
    is_active: bool

    model_config = {"from_attributes": True}
