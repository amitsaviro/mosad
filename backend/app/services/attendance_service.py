# Business logic for taking attendance: bulk-mark a whole layer for one
# date (upserting each participant's row), list a date's marks, and
# pull one participant's history/summary for their profile view.
from datetime import date as date_type

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.layer import Layer
from app.models.participant import Participant
from app.models.user import User
from app.schemas.attendance import AttendanceMarkInput, AttendanceOut, ParticipantAttendanceSummary


def mark_attendance(db: Session, user: User, layer: Layer, payload: AttendanceMarkInput) -> list[Attendance]:
    records: list[Attendance] = []
    for item in payload.records:
        participant = db.get(Participant, item.participant_id)
        if participant is None or participant.layer_id != layer.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="חניך לא נמצא בשכבה זו")

        existing = (
            db.query(Attendance)
            .filter(Attendance.participant_id == item.participant_id, Attendance.date == payload.date)
            .first()
        )
        if existing is None:
            existing = Attendance(
                participant_id=item.participant_id,
                date=payload.date,
                present=item.present,
                marked_by_id=user.id,
            )
            db.add(existing)
        else:
            existing.present = item.present
            existing.marked_by_id = user.id
        records.append(existing)

    db.commit()
    for r in records:
        db.refresh(r)
    return records


def list_attendance_for_date(db: Session, layer: Layer, date: date_type) -> list[Attendance]:
    return (
        db.query(Attendance)
        .join(Participant, Attendance.participant_id == Participant.id)
        .filter(Participant.layer_id == layer.id, Attendance.date == date)
        .all()
    )


def list_attendance_for_participant(db: Session, participant: Participant) -> list[Attendance]:
    return (
        db.query(Attendance)
        .filter(Attendance.participant_id == participant.id)
        .order_by(Attendance.date.desc())
        .all()
    )


def summarize_attendance(records: list[Attendance]) -> ParticipantAttendanceSummary:
    total = len(records)
    present_count = sum(1 for r in records if r.present)
    rate = round(present_count / total * 100, 1) if total else None
    return ParticipantAttendanceSummary(total_sessions=total, present_count=present_count, rate=rate)


def to_attendance_out(record: Attendance) -> AttendanceOut:
    return AttendanceOut(
        id=record.id,
        participant_id=record.participant_id,
        participant_name=record.participant.full_name,
        date=record.date,
        present=record.present,
        marked_by_name=record.marked_by.full_name,
        created_at=record.created_at,
    )
