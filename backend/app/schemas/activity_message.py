import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ActivityMessageCreate(BaseModel):
    body: str = Field(min_length=1)
    # Who this message is to -- required when the current user is the
    # activity's creator (replying to a specific asker among possibly
    # several); optional otherwise, since a non-creator can only ever
    # be talking to the creator.
    to_user_id: uuid.UUID | None = None


class ActivityMessageOut(BaseModel):
    id: uuid.UUID
    activity_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    recipient_id: uuid.UUID
    body: str
    created_at: datetime


class ActivityMessageThreadOut(BaseModel):
    """One row per person who's messaged the activity's creator --
    for the creator's own inbox view of "who's asking me things"."""
    other_user_id: uuid.UUID
    other_user_name: str
    last_message: str
    last_message_at: datetime
