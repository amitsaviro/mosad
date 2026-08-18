# CRUD for a layer's schedule profile (weekly meeting pattern + group
# character) -- the settings the AI scheduling agent
# (ai_schedule_agent.py) reads before proposing a draft schedule.
from sqlalchemy.orm import Session

from app.models.layer import Layer
from app.models.layer_schedule_profile import LayerScheduleProfile
from app.schemas.ai_schedule import LayerScheduleProfileOut, LayerScheduleProfileSet


def get_schedule_profile(db: Session, layer: Layer) -> LayerScheduleProfile | None:
    return db.query(LayerScheduleProfile).filter(LayerScheduleProfile.layer_id == layer.id).first()


def set_schedule_profile(db: Session, layer: Layer, payload: LayerScheduleProfileSet) -> LayerScheduleProfile:
    profile = get_schedule_profile(db, layer)
    days_str = ",".join(payload.meeting_days)
    if profile is None:
        profile = LayerScheduleProfile(layer_id=layer.id, meeting_days=days_str, group_character=payload.group_character)
        db.add(profile)
    else:
        profile.meeting_days = days_str
        profile.group_character = payload.group_character
    db.commit()
    db.refresh(profile)
    return profile


def to_profile_out(profile: LayerScheduleProfile | None) -> LayerScheduleProfileOut:
    if profile is None:
        return LayerScheduleProfileOut(meeting_days=[], group_character=None)
    days = [d for d in profile.meeting_days.split(",") if d]
    return LayerScheduleProfileOut(meeting_days=days, group_character=profile.group_character)
