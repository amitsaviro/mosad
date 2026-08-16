# Importing this package (`from app import models`) pulls in every
# model file below. This matters for Alembic: it only "sees" a table
# if the model class has actually been imported somewhere before
# autogenerate runs.
from app.models.activity import Activity, ActivityType
from app.models.activity_attachment import ActivityAttachment
from app.models.activity_comment import ActivityComment
from app.models.activity_message import ActivityMessage
from app.models.activity_rating import ActivityRating
from app.models.attendance import Attendance
from app.models.calendar_activity import CalendarActivity
from app.models.chat_message import ChatMessage, LayerChatRead
from app.models.counselor_layer_assignment import CounselorLayerAssignment
from app.models.institution import Institution
from app.models.institution_key_date import InstitutionKeyDate
from app.models.layer import Layer
from app.models.participant import Participant
from app.models.participant_note import ParticipantNote
from app.models.user import User, UserRole

__all__ = [
    "Institution",
    "User",
    "UserRole",
    "Layer",
    "CounselorLayerAssignment",
    "Participant",
    "Activity",
    "ActivityType",
    "ActivityAttachment",
    "ActivityRating",
    "ActivityComment",
    "InstitutionKeyDate",
    "CalendarActivity",
    "Attendance",
    "ParticipantNote",
    "ChatMessage",
    "LayerChatRead",
    "ActivityMessage",
]
