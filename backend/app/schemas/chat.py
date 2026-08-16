import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1)


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    layer_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    body: str
    created_at: datetime


class ChatUnreadCountOut(BaseModel):
    layer_id: uuid.UUID
    count: int
