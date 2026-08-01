import uuid

from pydantic import BaseModel, field_validator


class LayerCreate(BaseModel):
    """Body for POST /layers. institution_id is NOT here on purpose —
    it's derived server-side from the logged-in user, never trusted
    from client input (a client could otherwise create a layer inside
    someone else's institution).

    institution_name is only used the very first time a user creates a
    layer (when it silently creates their institution too) — ignored
    if they already belong to one."""
    name: str
    description: str | None = None
    institution_name: str | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם השכבה לא יכול להיות ריק")
        return stripped


class LayerJoin(BaseModel):
    """Body for POST /layers/join."""
    join_code: str


class LayerAssignCounselor(BaseModel):
    """Body for POST /layers/{layer_id}/assign-counselor."""
    user_id: uuid.UUID


class LayerOut(BaseModel):
    """What we return about a layer, including its join_code so the
    admin can share it with counselors. can_manage tells the frontend
    whether THIS viewer can edit the layer (admin, or assigned
    counselor) or only see it read-only (view-only badge)."""
    id: uuid.UUID
    institution_id: uuid.UUID
    name: str
    description: str | None
    join_code: str
    is_active: bool
    can_manage: bool

    model_config = {"from_attributes": True}
