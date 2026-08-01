# Business logic for the nationwide activity repository: CRUD (creator
# only), search/filter, ratings, and comments.
import uuid

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.activity_attachment import ActivityAttachment
from app.models.activity_comment import ActivityComment
from app.models.activity_rating import ActivityRating
from app.models.layer import Layer
from app.models.user import User
from app.schemas.activity import (
    ActivityCommentCreate,
    ActivityCreate,
    ActivityOut,
    ActivityRatingCreate,
    ActivityUpdate,
    AttachmentOut,
)


def create_activity(db: Session, user: User, payload: ActivityCreate) -> Activity:
    activity = Activity(
        creator_id=user.id,
        name=payload.name,
        description=payload.description,
        activity_type=payload.activity_type,
        age_min=payload.age_min,
        age_max=payload.age_max,
        duration_minutes=payload.duration_minutes,
        group_size_min=payload.group_size_min,
        group_size_max=payload.group_size_max,
        location=payload.location,
        required_equipment=payload.required_equipment,
        budget_estimate=payload.budget_estimate,
        tags=payload.tags,
    )
    db.add(activity)
    db.flush()

    for attachment in payload.attachments:
        db.add(ActivityAttachment(activity_id=activity.id, url=attachment.url, label=attachment.label))

    db.commit()
    db.refresh(activity)
    return activity


def list_activities(
    db: Session,
    search: str | None = None,
    activity_type: str | None = None,
    tag: str | None = None,
    age: int | None = None,
    group_size: int | None = None,
    max_duration: int | None = None,
) -> list[Activity]:
    query = db.query(Activity)

    if search:
        like = f"%{search}%"
        query = query.filter(or_(Activity.name.ilike(like), Activity.description.ilike(like)))
    if activity_type:
        query = query.filter(Activity.activity_type == activity_type)
    if tag:
        # ANY(tags) — Postgres array-contains-element check.
        query = query.filter(Activity.tags.any(tag))
    if age is not None:
        query = query.filter(
            or_(Activity.age_min.is_(None), Activity.age_min <= age),
            or_(Activity.age_max.is_(None), Activity.age_max >= age),
        )
    if group_size is not None:
        query = query.filter(
            or_(Activity.group_size_min.is_(None), Activity.group_size_min <= group_size),
            or_(Activity.group_size_max.is_(None), Activity.group_size_max >= group_size),
        )
    if max_duration is not None:
        query = query.filter(
            or_(Activity.duration_minutes.is_(None), Activity.duration_minutes <= max_duration)
        )

    return query.order_by(Activity.created_at.desc()).all()


def get_activity_or_404(db: Session, activity_id: uuid.UUID) -> Activity:
    activity = db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפעילות לא נמצאה")
    return activity


def require_creator(user: User, activity: Activity) -> None:
    if activity.creator_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="רק מי שהעלה את הפעילות יכול לערוך או למחוק אותה",
        )


def update_activity(db: Session, activity: Activity, payload: ActivityUpdate) -> Activity:
    changes = payload.model_dump(exclude_unset=True, exclude={"attachments"})
    for field, value in changes.items():
        setattr(activity, field, value)

    if payload.attachments is not None:
        # Replace wholesale: delete the old rows, add the new ones.
        for existing in list(activity.attachments):
            db.delete(existing)
        db.flush()
        for attachment in payload.attachments:
            db.add(ActivityAttachment(activity_id=activity.id, url=attachment.url, label=attachment.label))

    db.commit()
    db.refresh(activity)
    return activity


def delete_activity(db: Session, activity: Activity) -> None:
    db.delete(activity)
    db.commit()


def to_activity_out(user: User, activity: Activity) -> ActivityOut:
    return ActivityOut(
        id=activity.id,
        creator_id=activity.creator_id,
        creator_name=activity.creator.full_name,
        name=activity.name,
        description=activity.description,
        activity_type=activity.activity_type,
        age_min=activity.age_min,
        age_max=activity.age_max,
        duration_minutes=activity.duration_minutes,
        group_size_min=activity.group_size_min,
        group_size_max=activity.group_size_max,
        location=activity.location,
        required_equipment=activity.required_equipment,
        budget_estimate=(float(activity.budget_estimate) if activity.budget_estimate is not None else None),
        tags=activity.tags,
        attachments=[AttachmentOut.model_validate(a) for a in activity.attachments],
        average_rating=average_rating(activity),
        usage_count=len(activity.ratings),
        can_manage=activity.creator_id == user.id,
        created_at=activity.created_at,
    )


def average_rating(activity: Activity) -> float | None:
    if not activity.ratings:
        return None
    return round(sum(r.rating for r in activity.ratings) / len(activity.ratings), 1)


def add_rating(db: Session, user: User, activity: Activity, payload: ActivityRatingCreate) -> ActivityRating:
    layer = db.get(Layer, payload.layer_id)
    if layer is None or layer.institution_id != user.institution_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="השכבה לא נמצאה")

    rating = ActivityRating(
        activity_id=activity.id,
        user_id=user.id,
        layer_id=payload.layer_id,
        rating=payload.rating,
        notes=payload.notes,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


def add_comment(db: Session, user: User, activity: Activity, payload: ActivityCommentCreate) -> ActivityComment:
    comment = ActivityComment(activity_id=activity.id, user_id=user.id, body=payload.body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment
