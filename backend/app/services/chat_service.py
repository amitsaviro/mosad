# Business logic for a layer's team chat: posting, listing, and unread
# tracking via a per-(user, layer) "last read" row rather than a
# read-receipt row per message per member.
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.chat_message import ChatMessage, LayerChatRead
from app.models.layer import Layer
from app.models.user import User
from app.schemas.chat import ChatMessageCreate, ChatMessageOut

# How far back list_messages looks -- an unbounded per-layer feed would
# grow forever; this is plenty for "what did I miss."
MESSAGE_LIMIT = 200


def create_message(db: Session, user: User, layer: Layer, payload: ChatMessageCreate) -> ChatMessage:
    message = ChatMessage(layer_id=layer.id, author_id=user.id, body=payload.body.strip())
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def list_messages(db: Session, layer: Layer) -> list[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.layer_id == layer.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(MESSAGE_LIMIT)
        .all()[::-1]
    )


def mark_read(db: Session, user: User, layer: Layer) -> None:
    read_row = (
        db.query(LayerChatRead)
        .filter(LayerChatRead.user_id == user.id, LayerChatRead.layer_id == layer.id)
        .first()
    )
    now = datetime.now(timezone.utc)
    if read_row is None:
        db.add(LayerChatRead(user_id=user.id, layer_id=layer.id, last_read_at=now))
    else:
        read_row.last_read_at = now
    db.commit()


def count_unread(db: Session, user: User, layer_id: uuid.UUID) -> int:
    read_row = (
        db.query(LayerChatRead)
        .filter(LayerChatRead.user_id == user.id, LayerChatRead.layer_id == layer_id)
        .first()
    )
    query = db.query(ChatMessage).filter(
        ChatMessage.layer_id == layer_id,
        ChatMessage.author_id != user.id,
    )
    if read_row is not None:
        query = query.filter(ChatMessage.created_at > read_row.last_read_at)
    return query.count()


def to_chat_message_out(message: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=message.id,
        layer_id=message.layer_id,
        author_id=message.author_id,
        author_name=message.author.full_name,
        body=message.body,
        created_at=message.created_at,
    )
