from datetime import date

from pydantic import BaseModel


class HolidayOut(BaseModel):
    name: str
    start_date: date
    end_date: date
