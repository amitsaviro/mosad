# Israeli holidays/memorial-and-national days, computed on the fly from
# the actual Hebrew calendar (via the `hdate` library) instead of being
# typed in by hand -- accurate for any year without anyone maintaining a
# table, and correct even though the Hebrew calendar's leap-year rules
# shift the Gregorian date every year. Rosh Chodesh is excluded: it
# recurs monthly and isn't a "holiday" in the sense this list is for.
from dataclasses import dataclass
from datetime import date, timedelta

import hdate

_EXCLUDED_TYPES = {hdate.HolidayTypes.ROSH_CHODESH}


@dataclass
class Holiday:
    name: str
    start_date: date
    end_date: date


def list_israeli_holidays(from_date: date, to_date: date) -> list[Holiday]:
    days: list[tuple[date, str]] = []
    current = from_date
    while current <= to_date:
        info = hdate.HDateInfo(current, diaspora=False)
        for h in info.holidays:
            if h.type in _EXCLUDED_TYPES:
                continue
            days.append((current, str(h)))
        current += timedelta(days=1)

    holidays: list[Holiday] = []
    for day, name in days:
        # Consecutive days with the exact same name (e.g. five days of
        # "חול המועד סוכות" in a row) collapse into a single date range
        # instead of one entry per day.
        if holidays and holidays[-1].name == name and holidays[-1].end_date == day - timedelta(days=1):
            holidays[-1].end_date = day
        else:
            holidays.append(Holiday(name=name, start_date=day, end_date=day))
    return holidays
