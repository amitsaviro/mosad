# Business logic for the private "ask the creator" thread on a
# repository Activity: a non-creator only ever talks to the creator, so
# their recipient is implicit; the creator may have several people
# asking things, so replying requires picking which thread (to_user_id).
import uuid

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.activity_message import ActivityMessage
from app.models.user import User
from app.schemas.activity_message import ActivityMessageCreate, ActivityMessageOut, ActivityMessageThreadOut


def create_message(db: Session, user: User, activity: Activity, payload: ActivityMessageCreate) -> ActivityMessage:
    if user.id == activity.creator_id:
        if payload.to_user_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="יש לבחור למי לשלוח את התשובה"
            )
        recipient_id = payload.to_user_id
    else:
        recipient_id = activity.creator_id

    if recipient_id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="לא ניתן לשלוח הודעה לעצמך")

    message = ActivityMessage(
        activity_id=activity.id, sender_id=user.id, recipient_id=recipient_id, body=payload.body.strip()
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def list_thread(db: Session, activity: Activity, user: User, other_user_id: uuid.UUID) -> list[ActivityMessage]:
    return (
        db.query(ActivityMessage)
        .filter(
            ActivityMessage.activity_id == activity.id,
            or_(
                (ActivityMessage.sender_id == user.id) & (ActivityMessage.recipient_id == other_user_id),
                (ActivityMessage.sender_id == other_user_id) & (ActivityMessage.recipient_id == user.id),
            ),
        )
        .order_by(ActivityMessage.created_at)
        .all()
    )


def list_threads_for_creator(db: Session, activity: Activity) -> list[ActivityMessageThreadOut]:
    messages = (
        db.query(ActivityMessage)
        .filter(ActivityMessage.activity_id == activity.id)
        .order_by(ActivityMessage.created_at)
        .all()
    )
    latest_by_other: dict[uuid.UUID, ActivityMessage] = {}
    for m in messages:
        other = m.recipient_id if m.sender_id == activity.creator_id else m.sender_id
        latest_by_other[other] = m

    threads = []
    for other_id, last in latest_by_other.items():
        other_user = last.recipient if last.sender_id == activity.creator_id else last.sender
        threads.append(
            ActivityMessageThreadOut(
                other_user_id=other_id,
                other_user_name=other_user.full_name,
                last_message=last.body,
                last_message_at=last.created_at,
            )
        )
    threads.sort(key=lambda t: t.last_message_at, reverse=True)
    return threads


def to_activity_message_out(message: ActivityMessage) -> ActivityMessageOut:
    return ActivityMessageOut(
        id=message.id,
        activity_id=message.activity_id,
        sender_id=message.sender_id,
        sender_name=message.sender.full_name,
        recipient_id=message.recipient_id,
        body=message.body,
        created_at=message.created_at,
    )
