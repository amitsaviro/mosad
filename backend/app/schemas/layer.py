import uuid

from pydantic import BaseModel


class LayerCreate(BaseModel):
    """Body for POST /layers. institution_id is NOT here on purpose —
    it's derived server-side from the logged-in user, never trusted
    from client input (a client could otherwise create a layer inside
    someone else's institution)."""
    name: str
    description: str | None = None


class LayerJoin(BaseModel):
    """Body for POST /layers/join."""
    join_code: str


class LayerOut(BaseModel):
    """What we return about a layer, including its join_code so the
    admin can share it with counselors."""
    id: uuid.UUID
    institution_id: uuid.UUID
    name: str
    description: str | None
    join_code: str
    is_active: bool

    model_config = {"from_attributes": True}
