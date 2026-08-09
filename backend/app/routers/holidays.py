# Computed Israeli holidays for the year overview -- read-only, not
# stored anywhere, so there's nothing for an admin to keep up to date.
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.holiday import HolidayOut
from app.services.holiday_service import list_israeli_holidays

router = APIRouter(prefix="/holidays", tags=["holidays"])


@router.get("", response_model=list[HolidayOut])
def list_holidays_endpoint(
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    start = from_date or date(today.year, 1, 1)
    end = to_date or date(today.year + 1, 12, 31)
    holidays = list_israeli_holidays(start, end)
    return [HolidayOut(name=h.name, start_date=h.start_date, end_date=h.end_date) for h in holidays]
