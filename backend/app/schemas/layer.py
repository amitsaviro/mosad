import uuid

from pydantic import BaseModel, field_validator


class LayerCreate(BaseModel):
    """Body for POST /layers. institution_id is NOT here on purpose —
    it's derived server-side from the logged-in user (must already
    have created an institution via POST /institutions first), never
    trusted from client input."""
    name: str
    description: str | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("שם השכבה לא יכול להיות ריק")
        return stripped


class LayerUpdate(BaseModel):
    """Body for PATCH /layers/{layer_id}. Both fields optional — only
    what's provided gets changed."""
    name: str | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
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
    counselor) or only see it read-only (view-only badge). is_assigned
    is narrower — true only if THIS specific user has a counselor
    assignment row on this layer (an admin can_manage every layer in
    their institution without necessarily being assigned to each one)."""
    id: uuid.UUID
    institution_id: uuid.UUID
    name: str
    description: str | None
    join_code: str
    is_active: bool
    can_manage: bool
    is_assigned: bool

    model_config = {"from_attributes": True}
