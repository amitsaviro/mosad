# Nationwide activity repository endpoints -- not institution-scoped:
# every logged-in user can browse/search all activities and add their
# own, regardless of which institution they belong to.
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.activity import ActivityCategory, ActivityLocation, ActivityType
from app.models.user import User
from app.schemas.activity import (
    ActivityCommentCreate,
    ActivityCommentNotificationOut,
    ActivityCommentOut,
    ActivityCommentsUnreadCountOut,
    ActivityCreate,
    ActivityListOut,
    ActivityOut,
    ActivityRatingCreate,
    ActivityRatingOut,
    ActivityUpdate,
)
from app.services.activity_service import (
    add_comment,
    add_rating,
    count_unread_comments,
    create_activity,
    delete_activity,
    get_activity_or_404,
    list_activities,
    list_unread_comments,
    mark_comments_read,
    require_creator,
    to_activity_comment_notification_out,
    to_activity_comment_out,
    to_activity_out,
    update_activity,
)

router = APIRouter(prefix="/activities", tags=["activities"])


@router.post("", response_model=ActivityOut, status_code=201)
def create_activity_endpoint(
    payload: ActivityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activity = create_activity(db, current_user, payload)
    return to_activity_out(current_user, activity)


@router.get("", response_model=ActivityListOut)
def list_activities_endpoint(
    search: str | None = None,
    activity_type: ActivityType | None = None,
    tag: str | None = None,
    category: list[ActivityCategory] = Query(default=[]),
    location: ActivityLocation | None = None,
    grade_min: int | None = Query(default=None, ge=1, le=12),
    grade_max: int | None = Query(default=None, ge=1, le=12),
    group_size: int | None = Query(default=None, alias="group_size"),
    max_duration: int | None = None,
    created_by_me: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activities, total = list_activities(
        db,
        search=search,
        activity_type=activity_type.value if activity_type else None,
        tag=tag,
        categories=[c.value for c in category] or None,
        location=location.value if location else None,
        grade_min=grade_min,
        grade_max=grade_max,
        group_size=group_size,
        max_duration=max_duration,
        created_by=current_user.id if created_by_me else None,
        page=page,
        page_size=page_size,
    )
    return ActivityListOut(
        items=[to_activity_out(current_user, a) for a in activities],
        total=total,
        page=page,
        page_size=page_size,
    )


# Static routes ("/comments/...") declared before "/{activity_id}" so
# they don't get swallowed by the dynamic path (FastAPI matches in
# registration order, and a non-UUID segment there would just 422).
@router.get("/comments/unread-count", response_model=ActivityCommentsUnreadCountOut)
def activity_comments_unread_count_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ActivityCommentsUnreadCountOut(count=count_unread_comments(db, current_user))


@router.get("/comments/unread", response_model=list[ActivityCommentNotificationOut])
def list_unread_activity_comments_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [to_activity_comment_notification_out(c) for c in list_unread_comments(db, current_user)]


@router.post("/comments/mark-read", status_code=204)
def mark_activity_comments_read_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mark_comments_read(db, current_user)


@router.get("/{activity_id}", response_model=ActivityOut)
def get_activity_endpoint(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activity = get_activity_or_404(db, activity_id)
    return to_activity_out(current_user, activity)


@router.patch("/{activity_id}", response_model=ActivityOut)
def update_activity_endpoint(
    activity_id: uuid.UUID,
    payload: ActivityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activity = get_activity_or_404(db, activity_id)
    require_creator(current_user, activity)
    updated = update_activity(db, activity, payload)
    return to_activity_out(current_user, updated)


@router.delete("/{activity_id}", status_code=204)
def delete_activity_endpoint(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activity = get_activity_or_404(db, activity_id)
    require_creator(current_user, activity)
    delete_activity(db, activity)


@router.post("/{activity_id}/ratings", response_model=ActivityRatingOut, status_code=201)
def add_rating_endpoint(
    activity_id: uuid.UUID,
    payload: ActivityRatingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activity = get_activity_or_404(db, activity_id)
    rating = add_rating(db, current_user, activity, payload)
    return ActivityRatingOut(
        id=rating.id,
        user_id=rating.user_id,
        user_name=rating.user.full_name,
        layer_id=rating.layer_id,
        layer_name=rating.layer.name,
        rating=rating.rating,
        notes=rating.notes,
        created_at=rating.created_at,
    )


@router.get("/{activity_id}/ratings", response_model=list[ActivityRatingOut])
def list_ratings_endpoint(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activity = get_activity_or_404(db, activity_id)
    return [
        ActivityRatingOut(
            id=r.id,
            user_id=r.user_id,
            user_name=r.user.full_name,
            layer_id=r.layer_id,
            layer_name=r.layer.name,
            rating=r.rating,
            notes=r.notes,
            created_at=r.created_at,
        )
        for r in activity.ratings
    ]


@router.post("/{activity_id}/comments", response_model=ActivityCommentOut, status_code=201)
def add_comment_endpoint(
    activity_id: uuid.UUID,
    payload: ActivityCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activity = get_activity_or_404(db, activity_id)
    comment = add_comment(db, current_user, activity, payload)
    return to_activity_comment_out(comment)


@router.get("/{activity_id}/comments", response_model=list[ActivityCommentOut])
def list_comments_endpoint(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activity = get_activity_or_404(db, activity_id)
    return [to_activity_comment_out(c) for c in activity.comments]
